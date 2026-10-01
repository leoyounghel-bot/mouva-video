import http from "node:http";
import { readFile, stat, open, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { configuration, ApiError, generateScene } from "./providers.mjs";
import { ImageStore, imageConfiguration } from "./images.mjs";
import { planProduction } from "./orchestrator.mjs";
import { JobStore } from "./jobs.mjs";
import { planEditor } from "./editor-ai.mjs";
import { EditorStore } from "./editor-store.mjs";
import { VideoAuth, authConfig } from "./auth.mjs";
import { VideoBilling, billingConfig, productionBillingSpec } from "./billing.mjs";
import { renderReference } from "./render.mjs";
import { validateScene } from "../src/frontend/native/schema.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function serverConfig(env = process.env) {
  const host = env.MOUVA_AI_HOST || "127.0.0.1",
    port = Number(env.MOUVA_AI_PORT || 5175),
    publicOrigin = (env.MOUVA_PUBLIC_BASE_URL || env.MOUVA_PUBLIC_ORIGIN || "").replace(/\/$/, "");
  if (publicOrigin) {
    const u = new URL(publicOrigin);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      (u.pathname !== "/" && !env.MOUVA_PUBLIC_BASE_URL)
    )
      throw new Error(
        "MOUVA_PUBLIC_ORIGIN must be an HTTPS origin, e.g. https://studio.example.com",
      );
  }
  return {
    ...configuration(env),
    ...imageConfiguration(env),
    ...authConfig(env),
    ...billingConfig(env, env.MOUVA_AUTH_MODE || "local"),
    host,
    port,
    accessToken: env.MOUVA_ACCESS_TOKEN || "",
    dataDir: path.resolve(root, env.MOUVA_AI_DATA_DIR || ".mouva-ai"),
    harnessEnv: Object.fromEntries(["MOUVA_CODEX_MAX_CONCURRENT", "MOUVA_CODEX_MAX_QUEUED",
      "MOUVA_CODEX_TIMEOUT_MS", "MOUVA_CODEX_MAX_INPUT_BYTES"].filter(k => env[k] !== undefined).map(k => [k, env[k]])),
    publicOrigin,
    uploadUrl: env.MOUVA_MEDIA_UPLOAD_URL || "",
    uploadToken: env.MOUVA_MEDIA_UPLOAD_TOKEN || "",
    chromePath: env.CHROME_PATH,
    ffmpegPath: env.FFMPEG_PATH,
    renderOrigin: env.MOUVA_RENDER_ORIGIN || "http://127.0.0.1:" + port,
    staticDir: path.join(root, "dist"),
  };
}
async function jsonBody(req, limit = 30 * 1024 * 1024) {
  let total = 0;
  const chunks = [];
  for await (const c of req) {
    total += c.length;
    if (total > limit)
      throw new ApiError(413, "Request body is too large.");
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "Request body must be JSON.");
  }
}
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};
async function sendFile(req, res, file, contentType) {
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new ApiError(404, "File not found.");
  }
  if (!info.isFile()) throw new ApiError(404, "File not found.");
  const headers = {
    "Content-Type": contentType || mime[path.extname(file)] || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": file.endsWith(".html")
      ? "no-cache"
      : "private, max-age=3600",
    ...(contentType === "image/svg+xml" ? { "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" } : {}),
  };
  let start = 0,
    end = info.size - 1,
    status = 200;
  if (req.headers.range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!m || (!m[1] && !m[2])) {
      res.writeHead(416, { "Content-Range": "bytes */" + info.size });
      res.end();
      return;
    }
    if (!m[1]) start = Math.max(0, info.size - Number(m[2]));
    else {
      start = Number(m[1]);
      if (m[2]) end = Math.min(end, Number(m[2]));
    }
    if (start > end || start >= info.size) {
      res.writeHead(416, { "Content-Range": "bytes */" + info.size });
      res.end();
      return;
    }
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
  }
  headers["Content-Length"] = String(Math.max(0, end - start + 1));
  res.writeHead(status, headers);
  if (req.method === "HEAD") res.end();
  else
    createReadStream(file, { start, end })
      .on("error", () => res.destroy())
      .pipe(res);
}
export async function createServer(config, deps = {}) {
  if (
    !["127.0.0.1", "localhost", "::1"].includes(config.host) &&
    config.authMode !== "mouva" &&
    config.accessToken.length < 32
  )
    throw new Error(
      "Public binding requires a MOUVA_ACCESS_TOKEN of at least 32 characters.",
    );
  const auth = await new VideoAuth(config, deps).init();
  const billing = new VideoBilling(config, deps);
  // Both production pipelines share one Chromium/FFmpeg render slot.
  let rendering = Promise.resolve();
  const serial = render => args => {
    const next = rendering.then(() => { args.signal?.throwIfAborted(); return render(args); });
    rendering = next.catch(() => {});
    return next;
  };
  const store = await new JobStore(config, { ...deps, billing, render: serial(deps.render || renderReference) }).init();
  const images = await new ImageStore(config, deps).init();
  const editor = await new EditorStore(config, { ...deps, renderExport: serial(deps.renderExport || renderReference) }).init();
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    try {
      const url = new URL(req.url, "http://localhost");
      if (config.authMode === "mouva" && url.pathname.startsWith("/api/ai/auth/")) {
        if (url.pathname === "/api/ai/auth/handoff") {
          auth.checkOrigin(req, [config.loginOrigin], true);
          res.setHeader("Access-Control-Allow-Origin", config.loginOrigin);
          res.setHeader("Vary", "Origin");
          if (req.method === "OPTIONS") {
            res.setHeader("Access-Control-Allow-Methods", "POST");
            res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
            res.setHeader("Access-Control-Max-Age", "600");
            res.writeHead(204); res.end(); return;
          }
          if (req.method === "POST") { json(res, 200, await auth.handoff(req, await jsonBody(req, 4096))); return; }
        }
        if (req.method === "POST" && url.pathname === "/api/ai/auth/start") { json(res, 200, auth.start(req, res)); return; }
        if (req.method === "POST" && url.pathname === "/api/ai/auth/exchange") { json(res, 200, await auth.exchange(req, res, await jsonBody(req, 4096))); return; }
        if (req.method === "GET" && url.pathname === "/api/ai/auth/session") {
          auth.checkOrigin(req, [config.frontendOrigin]);
          const session = auth.session(req);
          if (!session) throw new ApiError(401, "Sign in to Mouva to continue.", "AUTH_REQUIRED");
          json(res, 200, { ownerId: session.ownerId, expiresAt: session.expiresAt }); return;
        }
        if (req.method === "POST" && url.pathname === "/api/ai/auth/logout") { json(res, 200, auth.logout(req, res)); return; }
        throw new ApiError(404, "Sign-in route not found.");
      }
      if (url.pathname === "/api/ai/health") {
        json(res, 200, { ok: true, service: "mouva-production" });
        return;
      }
      const imageMedia = /^\/api\/ai\/images\/([a-f0-9-]{36})\/([a-f0-9-]{36}-[0-3]\.(?:png|jpeg|webp))$/.exec(url.pathname);
      if (imageMedia && ["GET", "HEAD"].includes(req.method)) {
        await sendFile(req, res, images.file(imageMedia[1], imageMedia[2], url.searchParams.get("token"))); return;
      }
      const uploadMedia = /^\/api\/ai\/editor\/media\/([a-f0-9-]{36})$/.exec(url.pathname);
      if (uploadMedia && ["GET","HEAD"].includes(req.method)) { const media = await editor.mediaFile(uploadMedia[1], url.searchParams.get("token")); await sendFile(req,res,media.file,media.type); return; }
      const exportMedia = /^\/api\/ai\/editor\/results\/([a-f0-9-]{36})\/movie\.(mp4|webm)$/.exec(url.pathname);
      if (exportMedia && ["GET","HEAD"].includes(req.method)) { await sendFile(req,res,editor.result(exportMedia[1],url.searchParams.get("token"),exportMedia[2])); return; }
      const media =
        /^\/api\/ai\/media\/([-a-f0-9]{36})\/(reference|final)\.mp4$/.exec(
          url.pathname,
        );
      if (media && ["GET", "HEAD"].includes(req.method)) {
        const r = store.get(media[1]);
        if (!equal(url.searchParams.get("token"), r.mediaToken))
          throw new ApiError(401, "Invalid media link.");
        await sendFile(
          req,
          res,
          path.join(store.jobDir(r.id), media[2] + ".mp4"),
        );
        return;
      }
      if (url.pathname.startsWith("/api/ai/")) {
        const ownerId = auth.owner(req);
        const accountId = config.authMode === "mouva" ? auth.session(req)?.accountId : undefined;
        if (req.method === "GET" && url.pathname === "/api/ai/billing") {
          json(res, 200, await billing.balance(accountId)); return;
        }
        if (req.method === "POST" && url.pathname === "/api/ai/billing/quote") {
          json(res, 200, await billing.quote(await jsonBody(req, 4096))); return;
        }
        if (req.method === "GET" && url.pathname === "/api/ai/status") {
          json(res, 200, {
            service: "mouva-production",
            orchestrator: "codex",
            orchestratorReady: !!config.geminiKey,
            orchestratorModel: config.geminiModel,
            orchestratorProvider: "gemini",
            sceneProvider: "gemini",
            sceneModel: config.geminiModel,
            sceneReady: !!config.geminiKey,
            imageModel: config.imageModel,
            imageReady: !!config.imageKey,
            videoModel: config.seedanceModel,
            videoReady: !!config.arkKey,
            publisherReady: !!(config.publicOrigin || config.uploadUrl),
            billingReady: billing.ready,
            billingMode: config.billingMode || "local",
          });
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/ai/images") { json(res, 200, images.list(url.searchParams.get("projectId"), ownerId)); return; }
        if (req.method === "POST" && url.pathname === "/api/ai/images") { json(res, 202, await images.create(await jsonBody(req), ownerId)); return; }
        const imageJob = /^\/api\/ai\/images\/([a-f0-9-]{36})(\/cancel)?$/.exec(url.pathname);
        if (imageJob && req.method === "GET" && !imageJob[2]) { json(res, 200, images.public(images.get(imageJob[1], ownerId))); return; }
        if (imageJob && req.method === "POST" && imageJob[2]) { json(res, 200, await images.cancel(imageJob[1], ownerId)); return; }
        if (req.method === "POST" && url.pathname === "/api/ai/editor/uploads") { json(res,201,await editor.upload(req, ownerId)); return; }
        if (req.method === "POST" && url.pathname === "/api/ai/editor/exports") { json(res,202,await editor.create(await jsonBody(req), ownerId)); return; }
        if (req.method === "GET" && url.pathname === "/api/ai/editor/jobs") { json(res,200,editor.list(url.searchParams.get("projectId"), ownerId)); return; }
        const editorJob=/^\/api\/ai\/editor\/jobs\/([a-f0-9-]{36})(\/cancel)?$/.exec(url.pathname);
        if(editorJob && req.method==="GET" && !editorJob[2]) { json(res,200,editor.public(editor.get(editorJob[1], ownerId))); return; }
        if(editorJob && req.method==="POST" && editorJob[2]) { json(res,200,await editor.cancel(editorJob[1], ownerId)); return; }
        if (req.method === "POST" && url.pathname === "/api/ai/editor/plan") {
          const body = await jsonBody(req);
          json(res, 200, await (deps.editorPlan || planEditor)(body, { config, signal: AbortSignal.timeout(120000) }));
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/ai/scenes") {
          const body = await jsonBody(req);
          if (
            !Array.isArray(body.assets) ||
            body.assets.length > 200 ||
            typeof body.prompt !== "string" ||
            body.prompt.length > 8000 ||
            !body.prompt.trim() ||
            !["scene", "object"].includes(body.scope)
          )
            throw new ApiError(400, "Invalid scene edit.");
          try {
            validateScene(body.scene, new Set(body.assets.map((a) => a.id)));
          } catch (e) {
            throw new ApiError(400, e.message);
          }
          if (
            body.assets.some(
              (a) =>
                !a ||
                typeof a.id !== "string" ||
                typeof a.name !== "string" ||
                a.name.length > 160 ||
                !/^[a-zA-Z0-9_-]{1,160}$/.test(a.id) ||
                !["image", "model"].includes(a.kind),
            ) ||
            (body.scope === "object" &&
              !body.scene.objects.some((o) => o.id === body.objectId))
          )
            throw new ApiError(
              400,
              "Invalid asset catalog or selected object.",
            );
          if (!config.geminiKey)
            throw new ApiError(
              503,
              "Configure GEMINI_API_KEY on the video server to direct a scene.",
              "GEMINI_NOT_CONFIGURED",
            );
          {
            const signal = AbortSignal.timeout(240000),
              ctx = { config, signal, fetcher: deps.fetcher || fetch };
            const plan = await (deps.plan || planProduction)(
              {
                ...body,
                instruction: body.prompt,
                finishPrompt: body.prompt,
                reviseScene: true,
              },
              ctx,
            );
            const result = await (deps.scene || generateScene)(
              { ...body, prompt: plan.sceneInstruction },
              ctx,
            );
            json(res, 200, {
              ...result,
              plan: { summary: plan.summary, orchestrator: "codex" },
            });
          }
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/ai/productions") {
          json(res, 200, store.list(url.searchParams.get("projectId"), ownerId));
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/ai/productions") {
          json(res, 202, await store.create(await jsonBody(req), ownerId, accountId));
          return;
        }
        const job = /^\/api\/ai\/productions\/([-a-f0-9]{36})(\/cancel)?$/.exec(
          url.pathname,
        );
        if (job && req.method === "GET" && !job[2]) {
          const record = store.get(job[1], ownerId);
          json(res, 200, store.public(record));
          return;
        }
        if (job && req.method === "POST" && job[2]) {
          json(res, 200, await store.cancel(job[1], ownerId));
          return;
        }
        throw new ApiError(404, "API route not found.");
      }
      if (!["GET", "HEAD"].includes(req.method))
        throw new ApiError(405, "Method not allowed.");
      const pathname = decodeURIComponent(url.pathname),
        target = path.resolve(
          config.staticDir,
          "." + (pathname === "/" ? "/index.html" : pathname),
        );
      if (!target.startsWith(config.staticDir + path.sep))
        throw new ApiError(403, "Invalid path.");
      await sendFile(req, res, target);
    } catch (e) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      json(res, e.status || 500, {
        message:
          e instanceof ApiError
            ? e.message
            : "The server could not complete this request.",
        code: e.code || "SERVER_ERROR",
      });
    }
  });
  server.requestTimeout = 300000;
  server.headersTimeout = 15000;
  return {
    server,
    store,
    editor,
    images,
    listen: () =>
      new Promise((resolve) =>
        server.listen(config.port, config.host, () =>
          resolve(server.address()),
        ),
      ),
    close: async () => {
      await images.close();
      await editor.close();
      await store.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  try {
    process.loadEnvFile(path.join(root, ".env.ai"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const config = serverConfig();
  const app = await createServer(config);
  await app.listen();
  console.log(
    "Mouva production service listening on " + config.host + ":" + config.port,
  );
  for (const event of ["SIGINT", "SIGTERM"])
    process.once(event, () => {
      void app.close().then(() => process.exit(0));
    });
}
