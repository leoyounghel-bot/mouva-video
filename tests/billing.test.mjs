import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { JobStore } from "../bridge/jobs.mjs";
import { ImageStore, imageData } from "../bridge/images.mjs";
import { ApiError } from "../bridge/providers.mjs";
import { serverConfig } from "../bridge/server.mjs";
import { createScene } from "../src/frontend/native/templates.ts";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/hX8AAAAASUVORK5CYII=";
function billing(allow = true) {
  const operations = new Map();
  return {
    enabled: true,
    allow,
    operations,
    async reserve(owner, id, spec, approval) {
      assert.equal(owner, "verified-account");
      if (!this.allow)
        throw new ApiError(402, "Low balance", "AI_CREDIT_LIMIT_REACHED");
      assert.equal(approval.version, "reviewed-price");
      if (!operations.has(id))
        operations.set(id, { spec, reservations: 1, settlements: [] });
      return { quote: { version: "reviewed-price", credits: 100 } };
    },
    async settle(owner, id, outcome) {
      assert.equal(owner, "verified-account");
      operations.get(id)?.settlements.push(outcome);
      return outcome.status === "unknown"
        ? { settled: false }
        : {
            settled: true,
            chargedCredits: outcome.status === "succeeded" ? 100 : 0,
          };
    },
  };
}
async function fixture(t, b, extras = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "mouva-billing-"));
  const config = {
    ...serverConfig({}),
    dataDir,
    geminiKey: "mock",
    arkKey: "mock",
    publicOrigin: "https://media.example",
    pollMs: 1,
  };
  let calls = 0;
  const deps = {
    billing: b,
    plan: async () => {
      calls++;
      return {
        sceneInstruction: "unchanged",
        finishPrompt: "test",
        model: "gemini-3.8-flash",
        usage: { inputTokens: 20, outputTokens: 10 },
      };
    },
    scene: async (input) => ({
      scene: input.scene,
      model: "gemini-3.8-flash",
      usage: { inputTokens: 30, outputTokens: 20 },
    }),
    render: async ({ output }) => {
      await writeFile(output, Buffer.alloc(256));
      return {};
    },
    publish: async () => "https://media.example/reference.mp4",
    createVideo: async () => ({ id: "existing-provider-task" }),
    getVideo: async () => ({
      status: "succeeded",
      usage: { completion_tokens: 600000 },
      content: { video_url: "https://media.example/final.mp4" },
    }),
    download: async (_url, dest) => writeFile(dest, Buffer.alloc(256)),
    ...extras,
  };
  const store = await new JobStore(config, deps).init();
  t.after(async () => {
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store, config, deps, calls: () => calls };
}
const input = () => ({
  requestId: crypto.randomUUID(),
  projectId: "project",
  shotId: "shot",
  scene: createScene("brand", 4),
  assets: [],
  mode: "finish",
  reviseScene: true,
  instruction: "test",
  finishPrompt: "test",
  resolution: "720p",
  ratio: "16:9",
  billingApproval: { version: "reviewed-price", maxCredits: 100 },
});
async function terminal(store, id) {
  for (let n = 0; n < 150; n++) {
    const record = store.get(id);
    if (
      !["queued", "running"].includes(record.status) &&
      record.billing.state !== "reserved"
    )
      return record;
    await delay(5);
  }
  assert.fail("Billing did not settle");
}
test("insufficient balance dispatches no providers; retry uses the same durable reservation", async (t) => {
  const b = billing(false),
    f = await fixture(t, b),
    body = input();
  await assert.rejects(f.store.create(body, "workspace", "verified-account"), {
    code: "AI_CREDIT_LIMIT_REACHED",
  });
  await delay(20);
  assert.equal(f.calls(), 0);
  assert.equal(f.store.busy, false);
  b.allow = true;
  const [one, two] = await Promise.all([
    f.store.create(body, "workspace", "verified-account"),
    f.store.create(body, "workspace", "verified-account"),
  ]);
  assert.equal(one.id, two.id);
  const r = await terminal(f.store, one.id);
  assert.equal(f.calls(), 1);
  assert.equal(b.operations.size, 1);
  assert.equal(r.billing.state, "settled");
  assert.equal(
    r.providerCosts.video.listPriceCost.basis.completion_tokens,
    600000,
  );
  assert.equal(r.providerCosts.scene.usage.outputTokens, 20);
  assert.equal(
    JSON.stringify(f.store.public(r)).includes("verified-account"),
    false,
  );
});
test("saving a succeeded provider video can fail without erasing incurred cost or releasing an uncertain hold", async (t) => {
  const b = billing(),
    f = await fixture(t, b, {
      download: async () => {
        throw new Error("Disk unavailable");
      },
    });
  const job = await f.store.create(input(), "workspace", "verified-account");
  const r = await terminal(f.store, job.id);
  assert.equal(r.status, "failed");
  assert.equal(r.providerStatus, "succeeded");
  assert.equal(r.providerCosts.video.listPriceCost.basis.cny, 25.2);
  assert.equal(r.billing.state, "reconcile");
  assert.equal(
    b.operations.values().next().value.settlements.at(-1).status,
    "unknown",
  );
});
test("image rounds pass verified ownership and charge only delivered candidates", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "mouva-image-billing-")),
    b = billing();
  let calls = 0;
  const store = await new ImageStore(
    {
      dataDir,
      imageKey: "mock",
      imageModel: "black-forest-labs/FLUX-2-klein-9b",
    },
    {
      billing: b,
      image: async () => {
        if (++calls === 2) throw new ApiError(422, "Blocked");
        return imageData(png);
      },
    },
  ).init();
  t.after(async () => {
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const body = {
    requestId: crypto.randomUUID(),
    projectId: "project",
    prompt: "synthetic",
    width: 1024,
    height: 1024,
    count: 2,
    referenceImages: [],
    billingApproval: { version: "reviewed-price", maxCredits: 100 },
  };
  const created = await store.create(body, "workspace", "verified-account");
  for (
    let n = 0;
    n < 100 && ["queued", "running"].includes(store.get(created.id).status);
    n++
  )
    await delay(5);
  await store.close();
  const record = store.get(created.id);
  assert.equal(record.billing.state, "settled");
  assert.equal(record.candidates[0].listPriceCost.usd, 0.015);
  assert.equal(
    b.operations.values().next().value.settlements.at(-1).deliveredCount,
    1,
  );
  assert.equal(
    JSON.stringify(store.public(record)).includes("verified-account"),
    false,
  );
});

import { BilledActions } from "../bridge/billed-actions.mjs";
test("Agent receipts survive settlement outages and replay without another AI dispatch", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "mouva-agent-billing-")),
    b = billing();
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  let calls = 0,
    outage = true;
  const settle = b.settle.bind(b);
  b.settle = async (...args) => {
    if (outage) throw new Error("Billing unavailable");
    return settle(...args);
  };
  const actions = await new BilledActions({ dataDir }, b).init();
  const body = {
    requestId: crypto.randomUUID(),
    instruction: "Slow down",
    project: { shots: [] },
    billingApproval: { version: "reviewed-price", maxCredits: 100 },
  };
  const execute = async () => {
    calls++;
    return {
      summary: "Slow down",
      commands: [],
      model: "gemini-3.8-flash",
      usage: { inputTokens: 10, outputTokens: 10 },
    };
  };
  assert.equal(
    (await actions.run(body, "workspace", "verified-account", execute)).summary,
    "Slow down",
  );
  assert.equal(calls, 1);
  outage = false;
  const restarted = await new BilledActions({ dataDir }, b).init();
  await restarted.reconcileBilling();
  const [one, two] = await Promise.all([
    restarted.run(body, "workspace", "verified-account", execute),
    restarted.run(body, "workspace", "verified-account", execute),
  ]);
  assert.deepEqual(one, two);
  assert.equal(calls, 1);
  await assert.rejects(
    restarted.run(
      { ...body, instruction: "different" },
      "workspace",
      "verified-account",
      execute,
    ),
    { status: 409 },
  );
});
test("Agent uncertainty retains a hold and never redispatches after restart", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "mouva-agent-unknown-")),
    b = billing();
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const actions = await new BilledActions({ dataDir }, b).init();
  const body = {
    requestId: crypto.randomUUID(),
    instruction: "Edit",
    project: { shots: [] },
    billingApproval: { version: "reviewed-price", maxCredits: 100 },
  };
  let calls = 0;
  const execute = async () => {
    calls++;
    throw new Error("Connection lost");
  };
  await assert.rejects(
    actions.run(body, "workspace", "verified-account", execute),
  );
  const restarted = await new BilledActions({ dataDir }, b).init();
  await assert.rejects(
    restarted.run(body, "workspace", "verified-account", execute),
    { code: "BILLING_RECONCILIATION_REQUIRED" },
  );
  assert.equal(calls, 1);
  assert.equal(
    b.operations.values().next().value.settlements.at(-1).status,
    "unknown",
  );
});

import { agentOperation } from "../src/frontend/native/agent-operation.ts";
test("browser retries retain one operation across reloads and isolate accounts without storing private input", async () => {
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k) || null,
      setItem: (k, v) => values.set(k, v),
    };
  const body = {
    instruction: "private creative input",
    project: { shots: [] },
  };
  const first = await agentOperation("account-a", body, storage);
  const retry = await agentOperation("account-a", body, storage);
  assert.equal(first.requestId, retry.requestId);
  assert.equal(retry.previous, true);
  assert.equal(
    JSON.stringify([...values]).includes("private creative input"),
    false,
  );
  assert.notEqual(
    (await agentOperation("account-b", body, storage)).requestId,
    first.requestId,
  );
  retry.finish();
  assert.notEqual(
    (await agentOperation("account-a", body, storage)).requestId,
    first.requestId,
  );
});
