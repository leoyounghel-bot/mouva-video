import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { serverConfig } from "../bridge/server.mjs";
import { planProduction } from "../bridge/orchestrator.mjs";
import { planEditor } from "../bridge/editor-ai.mjs";
import { createScene } from "../src/frontend/native/templates.ts";
import { demoProject } from "../src/frontend/demo.ts";

async function configuration(t) {
  const parent = path.resolve(os.tmpdir());
  const dataDir = await mkdtemp(path.join(parent, "mouva-video-harness-test-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(dataDir)), parent);
    assert.ok(path.basename(dataDir).startsWith("mouva-video-harness-test-"));
    await rm(dataDir, { recursive: true, force: true });
  });
  return { ...serverConfig({ ANTHROPIC_API_KEY: "fake-video-only-key" }), dataDir };
}
const reply = value => Response.json({
  content: [{ type: "text", text: JSON.stringify(value) }], stop_reason: "end_turn",
  usage: { input_tokens: 20, output_tokens: 10 },
});
test("video director uses real Codex with native Claude and requires no OpenAI key", async t => {
  const config = await configuration(t);
  assert.equal(config.codexKey, undefined);
  const plan = { summary: "Opening", sceneInstruction: "Preserve the title.", finishPrompt: "Warm light.", continuityNotes: [] };
  let calls = 0;
  const result = await planProduction({
    instruction: "Create a gentle opening", finishPrompt: "Warm light",
    reviseScene: true, scene: createScene("brand", 4), assets: [],
  }, { config, fetcher: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(init.headers["x-api-key"], "fake-video-only-key");
    const body = JSON.parse(init.body);
    assert.equal(body.model, config.claudeModel);
    assert.ok(body.system.includes("server-side production director"));
    assert.ok(body.messages.some(m => JSON.stringify(m).includes("Create a gentle opening")));
    assert.equal(body.output_config.format.schema.additionalProperties, false);
    return reply(plan);
  } });
  assert.equal(calls, 1);
  assert.equal(result.provider, "anthropic");
  assert.equal(result.orchestrator, "codex");
  assert.equal(result.summary, plan.summary);
  assert.equal(result.usage.inputTokens, 20);
});

test("video editor uses real Codex with Claude, keeps media URLs private and validates returned commands", async t => {
  const config = await configuration(t), project = structuredClone(demoProject);
  project.shots[0].takes[0].videoUrl = "https://private.example/video?token=DO_NOT_FORWARD";
  project.shots[0].image = { url: "https://private.example/image?token=DO_NOT_FORWARD" };
  const original = JSON.stringify(project);
  const result = await planEditor({
    instruction: "Select the opening shot", project, selectedShotId: project.shots[0].id, playhead: 0,
  }, { config, fetcher: async (url, init) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.ok(!init.body.includes("DO_NOT_FORWARD"));
    const body = JSON.parse(init.body);
    assert.equal(body.model, config.claudeModel);
    assert.ok(body.system.includes("documented editing tools"));
    return reply({ summary: "Select the opening", actions: [
      { tool: "ui.select", targetId: project.shots[0].id, arguments: "{}" },
    ] });
  } });
  assert.deepEqual(result.commands, [{ tool: "ui.select", targetId: project.shots[0].id, args: {} }]);
  assert.equal(JSON.stringify(project), original, "planning cannot mutate the stored project");
});
