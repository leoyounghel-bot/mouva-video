import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  readLearningState,
  preparePracticeProject,
  isPracticeProject,
  localizePracticeProject,
} from "../src/frontend/learning/state.ts";
import { courses } from "../src/frontend/learning/catalog.ts";
import { runCommands } from "../src/frontend/editor/commands.ts";
import { validateExport } from "../bridge/editor-export.mjs";
const template = JSON.parse(
  await readFile(
    new URL("../public/learn/wuxia/lesson-project.json", import.meta.url),
    "utf8",
  ),
);
const build = () =>
  preparePracticeProject(
    template,
    "https://studio.example",
    "zh",
    "lesson-copy-1",
  );

test("built-in lesson media travels with the app, without historical ports or upload tokens", async () => {
  const original = structuredClone(template),
    project = build();
  assert.deepEqual(template, original);
  assert.equal(project.id, "lesson-copy-1");
  assert.ok(isPracticeProject(project));
  assert.equal(project.shots.length, 8);
  assert.equal(validateExport({ project, settings: {} }).duration, 32);
  const serialized = JSON.stringify(project);
  assert.ok(!serialized.includes("127.0.0.1"));
  assert.ok(!serialized.includes("token="));
  for (const asset of project.assets) {
    const url = new URL(asset.url);
    assert.equal(url.origin, "https://studio.example");
    assert.ok(url.pathname.startsWith("/learn/wuxia/"));
    assert.ok(
      (await readFile(new URL("../public" + url.pathname, import.meta.url)))
        .length > 0,
    );
  }
  const poisoned = structuredClone(template);
  poisoned.assets[0].url = "https://old-server.example/private?token=secret";
  assert.throws(
    () =>
      preparePracticeProject(poisoned, "https://studio.example", "en", "other"),
    /Invalid lesson media path/,
  );
});
test("the guided speed edit keeps the source range and all seven other shots unchanged", () => {
  const project = build(),
    shot = project.shots[2];
  const result = runCommands(project, [
    {
      tool: "take.preview",
      targetId: shot.id,
      args: { takeId: shot.adoptedTakeId },
    },
    { tool: "clip.speed", targetId: shot.id, args: { speed: 0.75 } },
  ]);
  assert.equal(project.shots[2].speed, 1);
  assert.equal(result.shots[2].trimStart, 9.6);
  assert.equal(result.shots[2].trimEnd, 14.4);
  assert.ok(
    Math.abs(
      validateExport({ project: result, settings: {} }).duration - 33.6,
    ) < 1e-9,
  );
  for (let i = 0; i < 8; i++)
    if (i !== 2) assert.deepEqual(result.shots[i], project.shots[i]);
});
test("stored lesson progress is bounded and resilient to invalid storage", () => {
  for (const raw of [null, "null", "{broken", "[]"])
    assert.equal(readLearningState(raw).open, false);
  const state = readLearningState(
    JSON.stringify({
      courseId: "wuxia",
      step: 100,
      open: true,
      completed: { wuxia: [0, 0, 8, 9, -1, "1"], missing: [0] },
    }),
  );
  assert.equal(state.step, 8);
  assert.deepEqual(state.completed, { wuxia: [0, 8] });
  assert.equal(state.open, true);
});
test("all lesson content is bilingual and the English practice localizes supplied shot labels", () => {
  for (const c of courses)
    for (const s of c.steps) {
      for (const pair of [
        c.title,
        c.description,
        s.title,
        s.body,
        ...s.tasks,
        ...(s.tip ? [s.tip] : []),
        ...(s.actionLabel ? [s.actionLabel] : []),
      ])
        assert.equal(pair.length, 2);
      if (s.action) assert.ok(s.actionLabel?.every(Boolean));
    }
  const project = preparePracticeProject(
    template,
    "https://studio.example",
    "en",
    "en-copy",
  );
  assert.equal(project.shots[2].title, "Sidestep and thrust");
  assert.ok(!/[\u3400-\u9fff]/.test(project.name));
  assert.ok(!/[\u3400-\u9fff]/.test(JSON.stringify(project)));
});

test("switching a saved practice language translates defaults and preserves custom edits and media", () => {
  const project = build();
  project.shots[1].title = "我的原创镜头";
  project.shots[1].prompt = "我自己修改的提示词";
  project.shots[2].speed = 0.75;
  const en = localizePracticeProject(project, "en");
  assert.equal(en.shots[0].title, "Standoff");
  assert.ok(!/[\u3400-\u9fff]/.test(en.shots[0].prompt));
  assert.equal(en.shots[1].title, project.shots[1].title);
  assert.equal(en.shots[1].prompt, project.shots[1].prompt);
  assert.equal(en.shots[2].speed, 0.75);
  assert.equal(
    en.shots[0].takes[0].videoUrl,
    project.shots[0].takes[0].videoUrl,
  );
  assert.deepEqual(localizePracticeProject(en, "zh"), project);
});
