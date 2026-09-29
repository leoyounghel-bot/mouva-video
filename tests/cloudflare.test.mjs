import test from "node:test";
import assert from "node:assert/strict";
import worker from "../deploy/cloudflare-worker.mjs";
test("Cloudflare proxies API streams only to its configured HTTPS backend and preserves session cookies", async () => {
  const req = new Request("https://video.example.com/api/ai/auth/exchange?ignored=https://evil.example", {
    method: "POST", headers: { Origin: "https://video.example.com", Cookie: "test=cookie", "Content-Type": "application/json" }, body: "{}",
  });
  const result = await worker.fetch(req, { BACKEND_URL: "https://api.example.com/video-api", fetcher: async (url, init) => {
    assert.equal(url.origin, "https://api.example.com"); assert.equal(url.pathname, "/video-api/api/ai/auth/exchange");
    assert.equal(init.headers.get("origin"), "https://video.example.com"); assert.equal(init.headers.get("cookie"), "test=cookie");
    assert.equal(init.redirect, "manual"); assert.ok(init.body);
    return new Response("{}", { headers: { "Set-Cookie": "__Host-mouva-video=test; Path=/; Secure; HttpOnly", "Cache-Control": "public" } });
  }});
  assert.match(result.headers.get("set-cookie"), /HttpOnly/); assert.equal(result.headers.get("cache-control"), "no-store");
});
test("Cloudflare does not proxy unrelated API paths and rejects unsafe upstream configuration", async () => {
  assert.equal((await worker.fetch(new Request("https://video.example.com/api/private"), {})).status, 404);
  assert.equal((await worker.fetch(new Request("https://video.example.com/api/ai/status"), { BACKEND_URL: "http://localhost" })).status, 503);
  const result = await worker.fetch(new Request("https://video.example.com/"), { ASSETS: { fetch: async () => new Response("workspace") } });
  assert.equal(await result.text(), "workspace"); assert.equal(result.headers.get("x-frame-options"), "DENY");
});
