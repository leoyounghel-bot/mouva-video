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

test("main-site video entry is isolated, bilingual and never proxies other main-site routes", async () => {
  const entry = await worker.fetch(new Request("https://mouva.ai/video?lang=en"), {});
  assert.equal(entry.status, 200);
  assert.equal(entry.headers.get("cache-control"), "no-store");
  assert.match(await entry.text(), /English/);
  assert.match(entry.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const script = await worker.fetch(new Request("https://mouva.ai/video/launch.js"), {});
  assert.match(await script.text(), /api\.mouva\.ai\/video-api\/api\/ai\/auth\/handoff/);
  assert.equal((await worker.fetch(new Request("https://mouva.ai/video/unknown"), {})).status, 404);
  assert.equal((await worker.fetch(new Request("https://mouva.ai/video", { method: "POST" }), {})).status, 405);
  const main = await worker.fetch(new Request("https://mouva.ai/studio"), { ASSETS: { fetch: async () => new Response("Design") } });
  assert.equal(await main.text(), "Design");
});
