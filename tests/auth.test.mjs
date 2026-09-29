import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { VideoAuth, authConfig } from "../bridge/auth.mjs";
import { createServer, serverConfig } from "../bridge/server.mjs";
import { JobStore } from "../bridge/jobs.mjs";
import { EditorStore } from "../bridge/editor-store.mjs";
import { createScene } from "../src/frontend/native/templates.ts";

const env = {
  MOUVA_AUTH_MODE: "mouva", MOUVA_SESSION_SECRET: "unit-test-session-secret-never-for-production",
  MOUVA_FRONTEND_ORIGIN: "https://video.example.com", MOUVA_LOGIN_ORIGIN: "https://mouva.example.com",
  MOUVA_IDENTITY_URL: "https://api.example.com/api/auth/me",
};
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; } });
const req = (origin, extra = {}) => ({ method: "POST", headers: { origin, ...extra } });
const sha = v => createHash("sha256").update(v).digest("hex");
async function fixture(t, extras = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "mouva-auth-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  let calls = 0;
  const config = { ...serverConfig(env), dataDir, port: 0 };
  const deps = { identityFetch: async (url, init) => {
    calls++; assert.equal(url, env.MOUVA_IDENTITY_URL); assert.equal(init.redirect, "error");
    assert.match(init.headers.Authorization, /^Bearer /);
    return Response.json({ user: { id: init.headers.Authorization.endsWith("B") ? "user-b" : "user-a" } });
  }, ...extras };
  const auth = await new VideoAuth(config, deps).init();
  return { config, deps, auth, calls: () => calls };
}
async function handoff(auth, account = "A") {
  const startRes = response();
  const { loginUrl } = auth.start(req(env.MOUVA_FRONTEND_ORIGIN), startRes);
  const challenge = new URL(loginUrl).searchParams.get("challenge");
  const bearer = "Bearer unit-test-main-token-" + account;
  const { launchUrl } = await auth.handoff(req(env.MOUVA_LOGIN_ORIGIN, { authorization: bearer }), { challenge });
  return { code: new URLSearchParams(new URL(launchUrl).hash.slice(1)).get("handoff"),
    loginCookie: startRes.headers["Set-Cookie"].split(";")[0], bearer };
}
test("public SSO requires secure fixed endpoints and an independent secret", () => {
  assert.throws(() => authConfig({ ...env, MOUVA_SESSION_SECRET: "short" }));
  assert.throws(() => authConfig({ ...env, MOUVA_IDENTITY_URL: "http://127.0.0.1/private" }));
  assert.throws(() => authConfig({ ...env, MOUVA_FRONTEND_ORIGIN: "https://user:password@example.com" }));
  assert.equal(authConfig(env).authMode, "mouva");
});
test("handoff validates Mouva, keeps the main token off disk, survives restart and rejects replay", async t => {
  const { auth, config, deps, calls } = await fixture(t);
  const { code, loginCookie, bearer } = await handoff(auth);
  const file = path.join(auth.directory, (await readdir(auth.directory))[0]);
  assert.ok(!(await readFile(file, "utf8")).includes(bearer));
  const restarted = await new VideoAuth(config, deps).init(), out = response();
  const exchangeReq = req(env.MOUVA_FRONTEND_ORIGIN, { cookie: loginCookie });
  const session = await restarted.exchange(exchangeReq, out, { code });
  assert.equal(calls(), 1); assert.equal(session.ownerId, sha(env.MOUVA_IDENTITY_URL + "\nuser-a"));
  assert.match(out.headers["Set-Cookie"][0], /HttpOnly; Secure; SameSite=Lax/);
  const cookie = out.headers["Set-Cookie"][0].split(";")[0];
  assert.equal(restarted.owner(req(env.MOUVA_FRONTEND_ORIGIN, { cookie, "x-mouva-workspace": session.ownerId })), session.ownerId);
  assert.throws(() => restarted.owner(req(env.MOUVA_FRONTEND_ORIGIN, { cookie, "x-mouva-workspace": "another-user" })), /account changed/);
  assert.throws(() => restarted.owner(req("https://evil.example", { cookie, "x-mouva-workspace": session.ownerId })), /website/);
  assert.equal(restarted.session(req(env.MOUVA_FRONTEND_ORIGIN, { cookie: cookie + "tampered" })), null);
  await assert.rejects(restarted.exchange(exchangeReq, response(), { code }), /expired|already/);
});
test("login proof binds the handoff to its initiating browser; expired and unverified logins fail", async t => {
  let now = Date.now(); const { auth } = await fixture(t, { now: () => now });
  const h = await handoff(auth);
  const other = await handoff(auth, "B");
  await assert.rejects(auth.exchange(req(env.MOUVA_FRONTEND_ORIGIN, { cookie: other.loginCookie }), response(), h), /another browser/);
  now += 61000;
  await assert.rejects(auth.exchange(req(env.MOUVA_FRONTEND_ORIGIN, { cookie: h.loginCookie }), response(), h), /expired/);
  auth.fetch = async () => new Response("", { status: 401 });
  await assert.rejects(handoff(auth), /Sign in/);
  await assert.rejects(auth.handoff(req("https://evil.example"), {}), /website/);
});
test("parallel handoff exchanges admit exactly one session", async t => {
  const { auth } = await fixture(t), h = await handoff(auth);
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => auth.exchange(
    req(env.MOUVA_FRONTEND_ORIGIN, { cookie: h.loginCookie }), response(), { code: h.code })));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
});
test("production idempotency, list, cancellation and parent references are scoped to their owner", async t => {
  const { config } = await fixture(t), store = await new JobStore(config).init();
  store.closing = true; t.after(() => store.close());
  const input = { requestId: "same-request", projectId: "project", shotId: "shot", scene: createScene("brand", 4),
    assets: [], mode: "reference", reviseScene: false, ratio: "16:9", resolution: "720p", instruction: "Preview the scene", finishPrompt: "Warm light" };
  const a = await store.create(input, "a"), b = await store.create(input, "b");
  assert.notEqual(a.id, b.id);
  assert.deepEqual(store.list("project", "b").map(j => j.id), [b.id]);
  assert.throws(() => store.get(a.id, "b"), /not found/);
  await assert.rejects(store.cancel(a.id, "b"), /not found/);
  await assert.rejects(store.create({ ...input, requestId: "child", parentJobId: a.id }, "b"), /source production/);
});
test("uploads and export tasks cannot be referenced or cancelled by another account", async t => {
  const { config } = await fixture(t), store = await new EditorStore(config).init();
  store.closed = true; t.after(() => store.close());
  const stream = Readable.from([Buffer.from("test-image")]); stream.headers = { "content-type": "image/png" };
  const media = await store.upload(stream, "a");
  assert.ok(await store.fileForUrl(media.url, "a"));
  await assert.rejects(store.fileForUrl(media.url, "b"), /not found/);
  store.jobs.set("export-a", { id: "export-a", ownerId: "a", status: "queued", input: { project: { id: "project" } } });
  assert.deepEqual(store.list("project", "b"), []);
  assert.throws(() => store.get("export-a", "b"), /not found/);
  await assert.rejects(store.cancel("export-a", "b"), /not found/);
});
test("HTTP login enforces CORS, one-time cookie exchange and account-bound API access", async t => {
  const { config, deps } = await fixture(t), app = await createServer(config, deps);
  t.after(() => app.close()); const address = await app.listen(), base = `http://127.0.0.1:${address.port}/api/ai`;
  const preflight = await fetch(base + "/auth/handoff", { method: "OPTIONS", headers: { Origin: env.MOUVA_LOGIN_ORIGIN } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), env.MOUVA_LOGIN_ORIGIN);
  assert.equal((await fetch(base + "/productions?projectId=project")).status, 401);
  const start = await fetch(base + "/auth/start", { method: "POST", headers: { Origin: env.MOUVA_FRONTEND_ORIGIN } });
  const challenge = new URL((await start.json()).loginUrl).searchParams.get("challenge");
  const launch = await fetch(base + "/auth/handoff", { method: "POST", headers: {
    Origin: env.MOUVA_LOGIN_ORIGIN, Authorization: "Bearer unit-test-main-token-A", "Content-Type": "application/json" }, body: JSON.stringify({ challenge }) });
  const code = new URLSearchParams(new URL((await launch.json()).launchUrl).hash.slice(1)).get("handoff");
  const exchange = await fetch(base + "/auth/exchange", { method: "POST", headers: {
    Origin: env.MOUVA_FRONTEND_ORIGIN, Cookie: start.headers.getSetCookie()[0].split(";")[0], "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
  assert.equal(exchange.status, 200); const session = await exchange.json();
  const cookie = exchange.headers.getSetCookie()[0].split(";")[0];
  assert.equal((await fetch(base + "/productions?projectId=project", { headers: { Cookie: cookie, "X-Mouva-Workspace": session.ownerId } })).status, 200);
  assert.equal((await fetch(base + "/productions?projectId=project", { headers: { Cookie: cookie, "X-Mouva-Workspace": "wrong" } })).status, 401);
  assert.equal((await fetch(base + "/auth/start", { method: "POST", headers: { Origin: "https://evil.example" } })).status, 403);
});
