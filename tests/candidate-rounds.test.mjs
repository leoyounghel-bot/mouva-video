import test from "node:test";
import assert from "node:assert/strict";
import { candidateRound, submitRound } from "../src/frontend/native/rounds.ts";
import { productionCandidates } from "../src/frontend/native/candidates.ts";
import { validateProduction, JobStore } from "../bridge/jobs.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createScene } from "../src/frontend/native/templates.ts";

test("completed rounds reroll identical prompts with fresh request IDs", async () => {
  const first = candidateRound("same source", 2, null);
  const seen = [];
  await submitRound(
    first,
    async (identity) => {
      seen.push(identity);
      return { id: identity.requestId };
    },
    () => {},
  );
  const second = candidateRound("same source", 2, first);
  assert.notEqual(first.roundId, second.roundId);
  assert.equal(new Set([...first.requestIds, ...second.requestIds]).size, 4);
  assert.deepEqual(
    seen.map((i) => i.candidateIndex),
    [1, 2],
  );
  assert.ok(
    seen.every((i) => i.candidateCount === 2 && i.roundId === first.roundId),
  );
});

test("partial submission resumes uncertain request, without resubmitting accepted candidates", async () => {
  const round = candidateRound("frozen source", 4, null);
  const calls = [],
    accepted = [];
  let fail = true;
  const send = async (identity) => {
    calls.push(identity.requestId);
    if (identity.candidateIndex === 2 && fail) {
      fail = false;
      throw new Error("response lost after server accepted");
    }
    return { id: identity.requestId };
  };
  await assert.rejects(
    submitRound(round, send, (job) => accepted.push(job.id)),
    /response lost/,
  );
  assert.equal(round.accepted.length, 1);
  assert.equal(candidateRound("frozen source", 4, round), round);
  const complete = await submitRound(round, send, (job) =>
    accepted.push(job.id),
  );
  assert.deepEqual(calls, [
    round.requestIds[0],
    round.requestIds[1],
    round.requestIds[1],
    round.requestIds[2],
    round.requestIds[3],
  ]);
  assert.equal(complete.length, 4);
  assert.equal(new Set(accepted).size, 4);
  assert.notEqual(
    candidateRound("changed brief", 4, round).roundId,
    round.roundId,
  );
});

test("round metadata is validated at the server boundary", () => {
  const input = {
    requestId: "request",
    projectId: "project",
    shotId: "shot",
    scene: createScene("brand", 4),
    assets: [],
    mode: "finish",
    reviseScene: false,
    instruction: "Slow orbit",
    finishPrompt: "Slow orbit",
    resolution: "720p",
    ratio: "16:9",
    roundId: "round",
    candidateCount: 4,
    candidateIndex: 1,
  };
  assert.equal(validateProduction(input), input);
  for (const bad of [
    { candidateCount: 3 },
    { candidateIndex: 0 },
    { candidateIndex: 5 },
    { roundId: "bad/path" },
    { roundId: undefined },
  ])
    assert.throws(
      () => validateProduction({ ...input, ...bad }),
      /candidate|Candidate/,
    );
  assert.throws(() => candidateRound("source", 3, null), /Choose/);
});

test("ready candidates retain their round and source lineage without adopting them", () => {
  const shot = {
    image: { url: "data:image/png;base64,AA==" },
    adoptedTakeId: "original",
  };
  const job = {
    id: "job",
    provider: "pipeline",
    mode: "finish",
    status: "succeeded",
    scene: createScene("brand", 4),
    outputUrl: "/finished.mp4",
    roundId: "round",
    candidateCount: 4,
    candidateIndex: 2,
    baseTakeId: "original",
    instruction: "Slow orbit",
  };
  const candidates = productionCandidates(job, shot);
  assert.equal(candidates.length, 2);
  assert.ok(
    candidates.every(
      (t) =>
        t.roundId === "round" &&
        t.candidateIndex === 2 &&
        t.parentTakeId === "original",
    ),
  );
  assert.equal(candidates[1].videoUrl, "/finished.mp4");
  assert.equal(shot.adoptedTakeId, "original");
});

test("round identity survives storage restart and idempotent response recovery", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "mouva-round-test-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const make = async () => {
    const store = new JobStore({ dataDir });
    store.closing = true; // Storage-only test, without rendering or providers.
    return store.init();
  };
  const input = {
    requestId: "request",
    projectId: "project",
    shotId: "shot",
    scene: createScene("brand", 4),
    assets: [],
    mode: "reference",
    reviseScene: false,
    instruction: "Slow orbit",
    finishPrompt: "Slow orbit",
    resolution: "720p",
    ratio: "16:9",
    roundId: "round",
    candidateCount: 4,
    candidateIndex: 2,
  };
  const store = await make();
  const job = await store.create(input, "owner");
  const restarted = await make();
  const restored = await restarted.create(input, "owner");
  assert.equal(restored.id, job.id);
  assert.equal(restored.roundId, "round");
  assert.equal(restored.candidateIndex, 2);
  assert.equal(restored.candidateCount, 4);
  assert.equal(restarted.list("project", "owner").length, 1);
  assert.equal(restarted.list("project", "another-owner").length, 0);
});
