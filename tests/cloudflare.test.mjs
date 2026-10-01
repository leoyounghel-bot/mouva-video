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

test("lesson videos support bounded, suffix and open ranges when asset storage returns a full file", async () => {
  let cancelled = 0;
  const env = { ASSETS: { fetch: async (request) => {
    assert.equal(request.headers.get("range"), null);
    let offset = 0;
    const bytes = new TextEncoder().encode("0123456789");
    return new Response(new ReadableStream({
      pull(controller) {
        if (offset >= bytes.length) { controller.close(); return; }
        controller.enqueue(bytes.slice(offset, offset + 2)); offset += 2;
      }, cancel() { cancelled++; },
    }), { headers: { "Content-Length": "10", "Content-Type": "video/mp4", ETag: '"lesson-v1"' } });
  } } };
  const request = (range, extra = {}) => new Request("https://video.example.com/learn/wuxia/3d-film.mp4", { headers: { Range: range, ...extra } });
  for (const [range, content, span] of [["bytes=3-5", "345", "3-5"], ["bytes=-3", "789", "7-9"], ["bytes=8-", "89", "8-9"], ["bytes=8-99", "89", "8-9"]]) {
    const r = await worker.fetch(request(range), env);
    assert.equal(r.status, 206);
    assert.equal(r.headers.get("accept-ranges"), "bytes");
    assert.equal(r.headers.get("content-range"), `bytes ${span}/10`);
    assert.equal(Number(r.headers.get("content-length")), content.length);
    assert.equal(await r.text(), content);
  }
  assert.ok(cancelled > 0, "stop reading storage after the requested span");
  for (const range of ["bytes=10-", "bytes=7-3", "bytes=-0"]) {
    const r = await worker.fetch(request(range), env);
    assert.equal(r.status, 416);
    assert.equal(r.headers.get("content-range"), "bytes */10");
    assert.equal(await r.text(), "");
  }
  for (const [range, extra] of [["bytes=0-1,8-9", {}], ["bytes=0-1", { "If-Range": '"old-version"' }]]) {
    const r = await worker.fetch(request(range, extra), env);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "0123456789");
  }
});
