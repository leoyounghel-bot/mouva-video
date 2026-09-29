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
  return { ...serverConfig({ GEMINI_API_KEY: "fake-video-only-key" }), dataDir };
}
const reply = value => Response.json({
  candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(value) }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10 },
});
test("video director uses real Codex with native Gemini and requires no OpenAI key", async t => {
  const config = await configuration(t);
  assert.equal(config.codexKey, undefined);
  const plan = { summary: "Opening", sceneInstruction: "Preserve the title.", finishPrompt: "Warm light.", continuityNotes: [] };
  let calls = 0;
  const result = await planProduction({
    instruction: "Create a gentle opening", finishPrompt: "Warm light",
    reviseScene: true, scene: createScene("brand", 4), assets: [],
  }, { config, fetcher: async (url, init) => {
    calls++;
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse");
    assert.equal(init.headers["x-goog-api-key"], "fake-video-only-key");
    assert.equal(init.headers["x-api-key"], undefined);
    assert.equal(init.headers["anthropic-version"], undefined);
    const body = JSON.parse(init.body);
    assert.ok(body.systemInstruction.parts.some(p => p.text.includes("server-side production director")));
    assert.ok(body.contents.some(m => JSON.stringify(m).includes("Create a gentle opening")));
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.generationConfig.responseJsonSchema.additionalProperties, false);
    assert.equal(body.generationConfig.maxOutputTokens, 8192);
    // Exercise Google's streaming wire format with JSON split across chunks.
    const json = JSON.stringify(plan), split = Math.floor(json.length / 2);
    return new Response([
      { candidates: [{ content: { role: "model", parts: [{ text: json.slice(0, split) }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ text: json.slice(split) }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10 } },
    ].map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join(""), {
      headers: { "content-type": "text/event-stream" },
    });
  } });
  assert.equal(calls, 1);
  assert.equal(result.provider, "gemini");
  assert.equal(result.model, "gemini-3.8-flash");
  assert.equal(result.orchestrator, "codex");
  assert.equal(result.summary, plan.summary);
  assert.equal(result.usage.inputTokens, 20);
});

test("video editor uses real Codex with Gemini, keeps media URLs private and validates returned commands", async t => {
  const config = await configuration(t), project = structuredClone(demoProject);
  project.shots[0].takes[0].videoUrl = "https://private.example/video?token=DO_NOT_FORWARD";
  project.shots[0].image = { url: "https://private.example/image?token=DO_NOT_FORWARD" };
  const original = JSON.stringify(project);
  const result = await planEditor({
    instruction: "Select the opening shot", project, selectedShotId: project.shots[0].id, playhead: 0,
  }, { config, fetcher: async (url, init) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse");
    assert.equal(init.headers["x-goog-api-key"], "fake-video-only-key");
    assert.ok(!init.body.includes("DO_NOT_FORWARD"));
    const body = JSON.parse(init.body);
    assert.ok(body.systemInstruction.parts.some(p => p.text.includes("documented editing tools")));
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.ok(body.generationConfig.responseJsonSchema.properties.actions);
    return reply({ summary: "Select the opening", actions: [
      { tool: "ui.select", targetId: project.shots[0].id, arguments: "{}" },
    ] });
  } });
  assert.deepEqual(result.commands, [{ tool: "ui.select", targetId: project.shots[0].id, args: {} }]);
  assert.equal(JSON.stringify(project), original, "planning cannot mutate the stored project");
});
