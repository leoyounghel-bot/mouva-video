import test from "node:test";
import assert from "node:assert/strict";
import { editingInstruction } from "../src/frontend/agent/conversation.ts";
import { validateEditorPlan } from "../bridge/editor-ai.mjs";
import { runCommands } from "../src/frontend/editor/commands.ts";
import { demoProject } from "../src/frontend/demo.ts";
import { readConversation, saveConversation } from "../src/frontend/agent/history.ts";

test("Agent restores project-scoped context and drafts without restoring executable plans", () => {
  const values = new Map();
  const store = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const pending = { id: "plan", role: "assistant", text: "Trim the opening", state: "pending",
    plan: { commands: [{ tool: "clip.remove", targetId: "shot" }] } };
  saveConversation(store, "account-a/project-a", [pending], "Keep this draft", false);
  const restored = readConversation(store, "account-a/project-a");
  assert.equal(restored.draft, "Keep this draft");
  assert.equal(restored.messages[0].state, "stale");
  assert.equal(restored.messages[0].restored, true);
  assert.equal(restored.messages[0].plan, undefined);
  assert.deepEqual(readConversation(store, "account-b/project-a"), { messages: [], draft: "" });
  assert.deepEqual(readConversation(store, "account-a/project-b"), { messages: [], draft: "" });
  saveConversation(store, "account-a/project-a", [], "", false);
  assert.deepEqual(readConversation(store, "account-a/project-a"), { messages: [], draft: "" });
});

test("Agent history tolerates corrupt storage and marks interrupted requests instead of resuming them", () => {
  let value = "broken JSON";
  const store = { getItem: () => value, setItem: (_key, next) => { value = next; } };
  assert.deepEqual(readConversation(store, "key"), { messages: [], draft: "" });
  const messages = Array.from({ length: 50 }, (_, i) => ({ id: String(i), role: "assistant", text: "Working" }));
  saveConversation(store, "key", messages, "a".repeat(5000), true);
  const restored = readConversation(store, "key");
  assert.equal(restored.messages.length, 40);
  assert.equal(restored.messages.at(-1).state, "cancelled");
  assert.equal(restored.draft.length, 4000);
  const unavailable = { getItem: () => { throw Error("Unavailable"); }, setItem: () => { throw Error("Full"); } };
  assert.doesNotThrow(() => saveConversation(unavailable, "key", messages, "", false));
  assert.deepEqual(readConversation(unavailable, "key"), { messages: [], draft: "" });
});

test("Agent follow-ups retain recent context and the complete latest request within the API limit", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    text: `turn ${i}: ` + "背景".repeat(1000),
  }));
  const latest = "要求".repeat(2000);
  const result = editingInstruction(history, latest);
  assert.ok(result.length <= 8000);
  assert.ok(result.endsWith(latest));
  assert.ok(result.includes("turn 14:"));
  assert.ok(result.includes("turn 19:"));
  assert.ok(!result.includes("turn 13:"));
});

test("Agent rejects empty or oversized input without submitting a model request", () => {
  assert.throws(() => editingInstruction([], "  "));
  assert.throws(() => editingInstruction([], "a".repeat(4001)));
  assert.equal(editingInstruction([], "  放慢镜头  "), "放慢镜头");
});

test("Validated Agent plans use native editing without modifying their project snapshot", () => {
  const project = structuredClone(demoProject);
  const before = structuredClone(project);
  const planned = validateEditorPlan(
    {
      summary: "放慢当前镜头",
      actions: [
        {
          tool: "clip.speed",
          targetId: project.shots[0].id,
          arguments: JSON.stringify({ speed: 0.75 }),
        },
      ],
    },
    project,
  );
  const edited = runCommands(project, planned.commands);
  assert.deepEqual(project, before);
  assert.equal(edited.shots[0].speed, 0.75);
  assert.deepEqual(edited.shots[0].takes, before.shots[0].takes);
});

test("Agent plan validation rejects invented commands and invalid edit parameters", () => {
  const project = structuredClone(demoProject);
  for (const action of [
    { tool: "shell.run", targetId: "", arguments: "{}" },
    {
      tool: "clip.speed",
      targetId: project.shots[0].id,
      arguments: '{"speed":0}',
    },
    {
      tool: "clip.speed",
      targetId: "missing-shot",
      arguments: '{"speed":0.75}',
    },
  ])
    assert.throws(() =>
      validateEditorPlan({ summary: "invalid", actions: [action] }, project),
    );
});
