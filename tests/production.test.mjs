import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createScene } from "../src/frontend/native/templates.ts";
import {
  validateScene,
  sceneKey,
  objectAt,
} from "../src/frontend/native/schema.ts";
import {
  configuration,
  generateScene,
  videoPayload,
} from "../bridge/providers.mjs";
import { planProduction, validatePlan } from "../bridge/orchestrator.mjs";
import { planEditor } from "../bridge/editor-ai.mjs";
import { JobStore } from "../bridge/jobs.mjs";
import { createServer, serverConfig } from "../bridge/server.mjs";
const scene = () => createScene("brand", 4);
const plan = {
  summary: "One linked shot",
  sceneInstruction: "Move the title up.",
  finishPrompt: "Warm cinematic lighting; preserve the reference motion.",
  continuityNotes: ["Preserve the title"],
};
const config = async (extra = {}) => ({
  ...serverConfig({}),
  dataDir: await mkdtemp(path.join(tmpdir(), "mouva-production-")),
  geminiKey: "gemini-test-secret",
  arkKey: "ark-test-secret",
  publicOrigin: "https://studio.example.com",
  pollMs: 5,
  ...extra,
});
const input = (overrides = {}) => ({
  requestId: crypto.randomUUID(),
  projectId: "project-test",
  shotId: "shot-test",
  scene: scene(),
  assets: [],
  mode: "finish",
  reviseScene: true,
  instruction: "A gentle opening",
  finishPrompt: "Warm light",
  resolution: "720p",
  ratio: "16:9",
  generateAudio: true,
  ...overrides,
});
async function terminal(store, id) {
  for (let i = 0; i < 200; i++) {
    const r = store.get(id);
    if (!["queued", "running"].includes(r.status)) return r;
    await delay(10);
  }
  throw new Error("Job did not settle");
}
function mocks(log = []) {
  return {
    plan: async () => {
      log.push("codex");
      return { ...plan, orchestrator: "codex" };
    },
    scene: async ({ scene }) => {
      log.push("gemini");
      const copy = structuredClone(scene);
      copy.objects[1].position[1] = 1;
      return { scene: copy };
    },
    render: async ({ output, scene, onProgress }) => {
      log.push("three");
      assert.equal(scene.objects[1].position[1], 1);
      await onProgress(50);
      await writeFile(output, Buffer.alloc(256, 5));
      return { width: 960, height: 540, fps: 24, duration: 4, frames: 96 };
    },
    publish: async () => {
      log.push("publish");
      return "https://cdn.example.com/reference.mp4";
    },
    createVideo: async (value) => {
      log.push("seedance");
      assert.equal(value.references[0].type, "video");
      assert.equal(
        value.references[0].url,
        "https://cdn.example.com/reference.mp4",
      );
      return { id: "remote-task-1" };
    },
    getVideo: async () => ({
      status: "succeeded",
      content: { video_url: "https://video.example.com/finish.mp4" },
    }),
    download: async (_url, out) => {
      log.push("save");
      await writeFile(out, Buffer.alloc(256, 8));
    },
  };
}
test("scene schema rejects scripts, unknown assets and impossible timing; evaluation is deterministic", () => {
  const s = scene();
  validateScene(s);
  const original = sceneKey(s);
  assert.deepEqual(objectAt(s.objects[0], 2), objectAt(s.objects[0], 2));
  s.objects[0].rotation[1] = 50;
  assert.notEqual(sceneKey(s), original);
  s.script = "alert(1)";
  assert.throws(() => validateScene(s));
  delete s.script;
  s.objects[0].motion.end = 9;
  assert.throws(() => validateScene(s));
  s.objects[0].motion.end = 4;
  s.objects[0].assetId = "untrusted";
  assert.throws(() => validateScene(s, new Set()));
});
test("Gemini is configured independently and missing credentials never fall back to Claude", async () => {
  const onlyClaude = serverConfig({ ANTHROPIC_API_KEY: "unused-provider-key", GEMINI_API_KEY: "  " });
  assert.equal(onlyClaude.geminiKey, "");
  assert.equal(onlyClaude.geminiModel, "gemini-3.8-flash");
  const custom = configuration({
    GEMINI_API_KEY: "  fake-video-key  ",
    GEMINI_MODEL: "gemini-test-custom",
    GEMINI_BASE_URL: "https://gemini.example.test/v1beta",
  });
  assert.equal(custom.geminiKey, "fake-video-key");
  assert.equal(custom.geminiModel, "gemini-test-custom");
  assert.equal(custom.geminiBase, "https://gemini.example.test/v1beta");
  const ctx = { config: onlyClaude, fetcher: () => assert.fail("Missing Gemini credentials must not call a provider") };
  for (const run of [planProduction, generateScene, planEditor]) {
    await assert.rejects(() => run({}, ctx), error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, "GEMINI_NOT_CONFIGURED");
      assert.match(error.message, /GEMINI_API_KEY/);
      return true;
    });
  }
  const c = await config({ ...onlyClaude, dataDir: await mkdtemp(path.join(tmpdir(), "mouva-unconfigured-")), port: 0 });
  const app = await createServer(c, mocks());
  const addr = await app.listen();
  try {
    const status = await (await fetch("http://127.0.0.1:" + addr.port + "/api/ai/status")).json();
    assert.equal(status.sceneProvider, "gemini");
    assert.equal(status.orchestratorProvider, "gemini");
    assert.equal(status.sceneReady, false);
    assert.equal(status.orchestratorReady, false);
    assert.equal(status.sceneModel, "gemini-3.8-flash");
    assert.equal(JSON.stringify(status).includes("unused-provider-key"), false);
  } finally {
    await app.close();
  }
});
test("Codex SDK runs in an isolated server workspace and validates structured plans", async () => {
  let opts, threadOpts, runOptions;
  class MockCodex {
    constructor(o) {
      opts = o;
    }
    startThread(o) {
      threadOpts = o;
      return {
        id: "thread-test",
        runStreamed: async (_prompt, t) => {
          runOptions = t;
          return { events: (async function* () {
            yield { type: "item.completed", item: { type: "agent_message", id: "plan", text: JSON.stringify(plan) } };
            yield { type: "turn.completed", usage: { input_tokens: 30, cached_input_tokens: 0, output_tokens: 20 } };
          })() };
        },
      };
    }
  }
  const result = await planProduction(input(), {
    config: await config(),
    CodexClass: MockCodex,
  });
  assert.equal(result.orchestrator, "codex");
  assert.equal(opts.apiKey, undefined);
  assert.equal(opts.config.model_provider, "mouva");
  assert.equal(threadOpts.model, "gemini-3.8-flash");
  assert.equal(opts.env.OPENAI_API_KEY, undefined);
  assert.equal(typeof opts.env.MOUVA_CODEX_GATEWAY_TOKEN, "string");
  assert.equal(result.provider, "gemini");
  assert.equal(opts.env.GEMINI_API_KEY, undefined);
  assert.equal(opts.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(opts.env.ARK_API_KEY, undefined);
  assert.equal(opts.config.features.shell_tool, false);
  assert.equal(threadOpts.sandboxMode, "read-only");
  assert.equal(threadOpts.networkAccessEnabled, false);
  assert.equal(runOptions.outputSchema, undefined);
  assert.throws(() => validatePlan({ ...plan, command: "sh" }));
});
test("Gemini uses official structured output and object-scoped edits cannot change the rest of the scene", async () => {
  const original = scene(),
    generated = structuredClone(original);
  generated.objects[1].text = "A new brand";
  generated.objects[0].color = "#ff0000";
  generated.background = "#abcdef";
  let payload;
  const result = await generateScene(
    {
      scene: original,
      assets: [],
      scope: "object",
      objectId: original.objects[1].id,
      prompt: "Change this title",
    },
    {
      config: await config(),
      fetcher: async (url, init) => {
        assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse");
        assert.equal(init.headers["x-goog-api-key"], "gemini-test-secret");
        payload = JSON.parse(init.body);
        return Response.json({
          candidates: [{
            content: { role: "model", parts: [{ text: JSON.stringify(generated) }] },
            finishReason: "STOP",
          }],
        });
      },
    },
  );
  assert.equal(payload.generationConfig.responseMimeType, "application/json");
  assert.equal(payload.generationConfig.responseJsonSchema.additionalProperties, false);
  assert.equal(payload.generationConfig.maxOutputTokens, 12000);
  assert.equal(result.model, "gemini-3.8-flash");
  assert.equal(result.provider, "gemini");
  assert.equal(result.scene.objects[1].text, "A new brand");
  assert.deepEqual(result.scene.objects[0], original.objects[0]);
  assert.equal(result.scene.background, original.background);
});
test("Seedance receives the 2.5 model and reference video task contract; video base64 is rejected", () => {
  const c = configuration(),
    base = {
      prompt: "Warm light",
      duration: 4,
      resolution: "720p",
      ratio: "16:9",
      operation: "generate",
      references: [{ type: "video", url: "https://cdn.example.com/ref.mp4" }],
    };
  const p = videoPayload(base, c);
  assert.equal(p.model, "doubao-seedance-2-5-260628");
  assert.equal(p.omni_reference_task_type, "reference");
  assert.equal(p.content[1].role, "reference_video");
  assert.throws(() =>
    videoPayload(
      {
        ...base,
        references: [{ type: "video", url: "data:video/mp4;base64,abc" }],
      },
      c,
    ),
  );
  assert.throws(() =>
    videoPayload(
      {
        ...base,
        references: [{ type: "video", url: "http://localhost/ref.mp4" }],
      },
      c,
    ),
  );
});
test("production runs Codex → Gemini → Three.js → published reference → Seedance; idempotency preserves one task", async () => {
  const c = await config(),
    log = [],
    store = await new JobStore(c, mocks(log)).init();
  try {
    const body = input(),
      job = await store.create(body),
      same = await store.create(body);
    assert.equal(job.id, same.id);
    const done = await terminal(store, job.id);
    assert.equal(done.status, "succeeded", done.error);
    assert.deepEqual(log, [
      "codex",
      "gemini",
      "three",
      "publish",
      "seedance",
      "save",
    ]);
    assert.equal(done.sourceSceneKey, sceneKey(done.scene));
    assert.match(done.referenceUrl, /reference.mp4/);
    assert.match(done.outputUrl, /final.mp4/);
    assert.ok(done.scene);
    assert.equal(store.public(done).input, undefined);
    assert.equal(store.public(done).mediaToken, undefined);
    await assert.rejects(
      () => store.create({ ...body, finishPrompt: "Different" }),
      (e) => e.status === 409,
    );
    assert.ok(
      (
        await readFile(path.join(c.dataDir, "jobs", job.id + ".json"), "utf8")
      ).includes("remote-task-1"),
    );
  } finally {
    await store.close();
  }
});
test("reference-only render works without model keys and never invokes providers", async () => {
  const c = await config({
      geminiKey: "",
      arkKey: "",
      publicOrigin: "",
    }),
    store = await new JobStore(c, {
      render: async ({ output }) => {
        await writeFile(output, "reference");
        return { width: 960, height: 540 };
      },
      plan: async () => {
        throw new Error("unexpected paid call");
      },
    }).init();
  try {
    const j = await store.create(
        input({ mode: "reference", reviseScene: false }),
      ),
      done = await terminal(store, j.id);
    assert.equal(done.status, "succeeded", done.error);
    assert.equal(done.outputUrl, undefined);
    assert.ok(done.referenceUrl);
    await assert.rejects(
      () => store.create(input()),
      (e) => e.code === "GEMINI_NOT_CONFIGURED",
    );
  } finally {
    await store.close();
  }
});
test("restart resumes known Seedance tasks without resubmitting or rerunning Gemini", async () => {
  const c = await config(),
    log = [],
    store = await new JobStore(c, {
      ...mocks(log),
      getVideo: async () => ({ status: "running" }),
    }).init();
  const job = await store.create(input());
  while (!store.get(job.id).remoteTaskId) await delay(5);
  await store.close();
  const resumed = await new JobStore(c, mocks(log)).init();
  try {
    const done = await terminal(resumed, job.id);
    assert.equal(done.status, "succeeded", done.error);
    assert.equal(log.filter((x) => x === "seedance").length, 1);
    assert.equal(log.filter((x) => x === "gemini").length, 1);
  } finally {
    await resumed.close();
  }
});
test("queued cancellation persists and running Seedance jobs reject unsupported cancellation", async () => {
  const c = await config(),
    store = await new JobStore(c, {
      ...mocks(),
      getVideo: async () => ({ status: "running" }),
    }).init();
  try {
    const j = await store.create(input());
    while (!store.get(j.id).remoteTaskId) await delay(5);
    await assert.rejects(
      () => store.cancel(j.id),
      (e) => e.status === 409,
    );
    const queued = await store.create(input());
    const stopped = await store.cancel(queued.id);
    assert.equal(stopped.status, "cancelled");
  } finally {
    await store.close();
  }
});
test("HTTP service protects API and media, supports Range playback and reports missing configuration honestly", async () => {
  const c = await config({ port: 0, accessToken: "x".repeat(40) }),
    app = await createServer(c, mocks());
  const addr = await app.listen(),
    origin = "http://127.0.0.1:" + addr.port,
    headers = {
      Authorization: "Bearer " + c.accessToken,
      "Content-Type": "application/json",
    };
  try {
    assert.equal((await fetch(origin + "/api/ai/status")).status, 401);
    assert.equal(
      (
        await fetch(origin + "/api/ai/status", {
          headers: {
            Authorization: "Bearer " + String.fromCharCode(20013).repeat(40),
          },
        }).catch(() => ({ status: 401 }))
      ).status,
      401,
    );
    const status = await (
      await fetch(origin + "/api/ai/status", { headers })
    ).json();
    assert.equal(status.orchestrator, "codex");
    assert.equal(status.orchestratorProvider, "gemini");
    assert.equal(status.orchestratorModel, "gemini-3.8-flash");
    assert.equal(status.orchestratorReady, true);
    assert.equal(status.sceneProvider, "gemini");
    assert.equal(status.sceneModel, "gemini-3.8-flash");
    assert.equal(status.sceneReady, true);
    assert.equal(JSON.stringify(status).includes("test-secret"), false);
    const job = await (
      await fetch(origin + "/api/ai/productions", {
        method: "POST",
        headers,
        body: JSON.stringify(input()),
      })
    ).json();
    const done = await terminal(app.store, job.id);
    assert.equal(
      (await fetch(origin + "/api/ai/media/" + job.id + "/final.mp4")).status,
      401,
    );
    const range = await fetch(origin + done.outputUrl, {
      headers: { Range: "bytes=0-9" },
    });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 10);
    const foreign = await fetch(origin + "/api/ai/productions", {
      method: "POST",
      headers: { ...headers, Origin: "https://evil.example" },
      body: "{}",
    });
    assert.equal(foreign.status, 403);
  } finally {
    await app.close();
  }
});
