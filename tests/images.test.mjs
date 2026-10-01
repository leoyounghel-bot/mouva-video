import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  ImageStore,
  imageData,
  imageConfiguration,
  validateImageInput,
  generateImage,
} from "../bridge/images.mjs";
import { createServer, serverConfig } from "../bridge/server.mjs";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/hX8AAAAASUVORK5CYII=";
const input = (overrides = {}) => ({
  requestId: crypto.randomUUID(),
  projectId: "test-image-project",
  prompt: "A quiet coastal café",
  width: 1024,
  height: 576,
  count: 2,
  referenceImages: [],
  ...overrides,
});
async function fixture(t, extras = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "mouva-image-test-"));
  const config = {
    ...serverConfig({}),
    imageKey: "unit-test-secret",
    imageModel: "black-forest-labs/FLUX-2-klein-9b",
    dataDir,
    ...extras,
  };
  const store = await new ImageStore(config, {
    image: async () => imageData(png),
  }).init();
  t.after(async () => {
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store, config };
}
async function finish(store, id, owner = "owner-a") {
  for (let i = 0; i < 150; i++) {
    const r = store.get(id, owner);
    if (!["queued", "running"].includes(r.status)) return r;
    await delay(5);
  }
  throw new Error("Image test did not finish");
}
test("image input has fixed dimensions, bounded references and no client-selected model", () => {
  assert.equal(imageConfiguration({}).imageKey, "");
  assert.throws(() => validateImageInput(input({ width: 999 })), /Invalid/);
  assert.throws(() => validateImageInput(input({ count: 20 })), /Invalid/);
  assert.throws(() => validateImageInput(input({ prompt: " " })), /Invalid/);
  assert.throws(
    () =>
      validateImageInput(
        input({ referenceImages: ["https://private.example/image.png"] }),
      ),
    /Invalid/,
  );
  const checked = validateImageInput(
    input({ model: "other-provider", referenceImages: [png] }),
  );
  assert.equal(checked.model, undefined);
  assert.deepEqual(checked.referenceImages, [png]);
  assert.throws(() => imageData("data:image/png;base64,PHN2Zz4="), /Invalid/);
});
test("provider sends owned references and corrects image MIME from bytes", async () => {
  const result = await generateImage(input({ referenceImages: [png] }), {
    config: {
      imageKey: "test-key",
      imageModel: "black-forest-labs/FLUX-2-klein-9b",
    },
    fetcher: async (url, init) => {
      assert.equal(
        url,
        "https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-2-klein-9b",
      );
      assert.equal(init.headers.Authorization, "Bearer test-key");
      assert.equal(init.redirect, "error");
      const body = JSON.parse(init.body);
      assert.equal(body.input_image_1, png);
      assert.equal(body.width, 1024);
      return Response.json({
        images: [png.replace("image/png", "image/jpeg")],
        nsfw_content_detected: [false],
      });
    },
  });
  assert.equal(result.type, "png");
  assert.equal(result.url, png);
  await assert.rejects(
    generateImage(input(), {
      config: { imageKey: "test-key", imageModel: "model" },
      fetcher: async () =>
        Response.json({ images: [png], nsfw_content_detected: [true] }),
    }),
    /could not generate/,
  );
});
test("provider errors never expose upstream content or credentials", async () => {
  await assert.rejects(
    generateImage(input(), {
      config: { imageKey: "private-key", imageModel: "model" },
      fetcher: async () =>
        Response.json(
          { error: "private-key sensitive prompt" },
          { status: 500 },
        ),
    }),
    (error) =>
      !error.message.includes("private-key") &&
      !error.message.includes("sensitive prompt"),
  );
});
test("rounds retain independent candidates, deduplicate submission and isolate owners", async (t) => {
  const { store } = await fixture(t);
  const request = input();
  let calls = 0;
  store.generate = async () => {
    calls++;
    return imageData(png);
  };
  const [first, duplicate] = await Promise.all([
    store.create(request, "owner-a"),
    store.create(request, "owner-a").catch((e) => e),
  ]);
  assert.ok(duplicate.status === 429 || duplicate.id === first.id);
  await finish(store, first.id);
  assert.equal((await store.create(request, "owner-a")).id, first.id);
  assert.equal(calls, 2);
  assert.equal(store.list(request.projectId, "owner-b").length, 0);
  assert.throws(() => store.get(first.id, "owner-b"), /not found/);
  const record = store.get(first.id, "owner-a");
  const publicRecord = store.public(record);
  assert.equal(publicRecord.ownerId, undefined);
  assert.equal(publicRecord.token, undefined);
  assert.equal(publicRecord.candidates.length, 2);
  assert.throws(
    () => store.file(first.id, record.candidates[0].file, "bad-token"),
    /Invalid/,
  );
  const file = store.file(first.id, record.candidates[0].file, record.token);
  assert.deepEqual(await readFile(file), imageData(png).bytes);
});
test("partial failure preserves completed images and history survives restart", async (t) => {
  const { store, config } = await fixture(t);
  let calls = 0;
  store.generate = async () => {
    if (++calls === 2) throw new Error("secret-provider-error");
    return imageData(png);
  };
  const round = await store.create(input(), "owner-a");
  const result = await finish(store, round.id);
  assert.equal(result.status, "succeeded");
  assert.deepEqual(
    result.candidates.map((c) => c.status),
    ["succeeded", "failed"],
  );
  assert.ok(!result.candidates[1].error.includes("secret"));
  const reloaded = await new ImageStore(config).init();
  assert.equal(
    reloaded.list("test-image-project", "owner-a")[0].candidates[0].status,
    "succeeded",
  );
  await reloaded.close();
});
test("cancelling stops the provider and prevents dispatch of remaining candidates", async (t) => {
  const { store } = await fixture(t);
  let started;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  let calls = 0;
  store.generate = async (_, { signal }) => {
    calls++;
    started();
    await delay(10000, null, { signal });
    return imageData(png);
  };
  const round = await store.create(input({ count: 4 }), "owner-a");
  await waiting;
  await store.cancel(round.id, "owner-a");
  const result = await finish(store, round.id);
  assert.equal(result.status, "cancelled");
  assert.equal(calls, 1);
  assert.deepEqual(
    result.candidates.map((c) => c.status),
    ["cancelled", "cancelled", "cancelled", "cancelled"],
  );
});
test("the image API uses workspace authentication and signed media retrieval", async (t) => {
  const { config } = await fixture(t, {
    accessToken: "test-workspace-access",
    port: 0,
  });
  const app = await createServer(config, { image: async () => imageData(png) });
  t.after(() => app.close());
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal(
    (await fetch(base + "/api/ai/images?projectId=test-image-project")).status,
    401,
  );
  const headers = {
    Authorization: "Bearer test-workspace-access",
    "Content-Type": "application/json",
  };
  const response = await fetch(base + "/api/ai/images", {
    method: "POST",
    headers,
    body: JSON.stringify(input({ count: 1 })),
  });
  assert.equal(response.status, 202);
  const round = await response.json();
  await finish(app.images, round.id, "local");
  const saved = await (
    await fetch(base + "/api/ai/images?projectId=test-image-project", {
      headers,
    })
  ).json();
  const media = await fetch(base + saved[0].candidates[0].url);
  assert.equal(media.status, 200);
  assert.match(media.headers.get("content-type"), /image\/png/);
  assert.equal(
    (
      await fetch(
        base + saved[0].candidates[0].url.replace(/token=.*/, "token=bad"),
      )
    ).status,
    401,
  );
});

test("missing image configuration rejects requests before queueing or provider dispatch", async (t) => {
  const { store } = await fixture(t, { imageKey: "" });
  let calls = 0;
  store.generate = async () => {
    calls++;
    return imageData(png);
  };
  await assert.rejects(store.create(input(), "owner-a"), /not configured/);
  assert.equal(store.records.size, 0);
  assert.equal(calls, 0);
});
test("restart marks interrupted candidates failed while retaining completed media", async (t) => {
  const { store, config } = await fixture(t);
  const created = await store.create(input(), "owner-a");
  await finish(store, created.id);
  const record = structuredClone(store.get(created.id, "owner-a"));
  record.status = "running";
  record.candidates[1].status = "running";
  delete record.candidates[1].file;
  await store.save(record);
  const reloaded = await new ImageStore(config).init();
  const recovered = reloaded.list(record.projectId, "owner-a")[0];
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.candidates[0].status, "succeeded");
  assert.ok(recovered.candidates[0].url);
  assert.equal(recovered.candidates[1].status, "failed");
  await reloaded.close();
});
