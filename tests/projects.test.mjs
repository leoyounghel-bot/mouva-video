import test from "node:test";
import assert from "node:assert/strict";
import { createVideoProject } from "../src/frontend/project-model.ts";
import {
  addCanvasItem,
  canvasInputs,
  connectNodes,
} from "../src/frontend/canvas/model.ts";
import { validateCanvas } from "../src/frontend/canvas/validation.ts";
import { runCommands } from "../src/frontend/editor/commands.ts";

test("new video projects are independent and start without demo or adopted media", () => {
  const first = createVideoProject("  我的短片  ", "9:16");
  const second = createVideoProject("Another film");
  assert.equal(first.name, "我的短片");
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.shots[0].id, second.shots[0].id);
  assert.equal(first.shots[0].aspectRatio, "9:16");
  assert.equal(first.shots[0].status, "idle");
  assert.equal(first.shots[0].takes[0].status, "idle");
  assert.equal(first.shots[0].takes[0].videoUrl, undefined);
  for (const key of ["assets", "audio", "characters"])
    assert.deepEqual(first[key], []);
  assert.deepEqual(first.canvas, { version: 1, items: [], edges: [] });
  validateCanvas(first);
  // The starter node remains usable by the existing editor commands.
  const changed = runCommands(first, [{ tool: "clip.add", args: {} }]);
  assert.equal(changed.shots[1].aspectRatio, "9:16");
  assert.equal(first.shots.length, 1);
});

test("new-project inputs reject blank names and unsupported frame formats", () => {
  assert.throws(() => createVideoProject("   "));
  assert.throws(() => createVideoProject("x".repeat(101)));
  assert.throws(() => createVideoProject("Film", "wrong"));
});

test("image and editable 3D feed video while legacy audio edges stay out of visual references", () => {
  const p = createVideoProject("Connected film");
  p.assets.push(
    {
      id: "photo",
      name: "Reference",
      kind: "image",
      folder: "uploads",
      url: "https://example.test/reference.png",
    },
    {
      id: "music",
      name: "Sound",
      kind: "audio",
      folder: "uploads",
      url: "https://example.test/music.wav",
    },
  );
  const image = addCanvasItem(
    p,
    "image",
    { x: -790, y: 0 },
    undefined,
    "photo",
  );
  const audio = addCanvasItem(
    p,
    "audio",
    { x: -790, y: 720 },
    undefined,
    "music",
  );
  const scene = addCanvasItem(p, "scene", { x: 0, y: 720 }, image);
  const video = addCanvasItem(p, "video", { x: 790, y: 0 }, scene);
  connectNodes(p, audio, video);
  const restored = JSON.parse(JSON.stringify(p));
  validateCanvas(restored);
  assert.equal(
    restored.shots.find((s) => s.id === scene).takes[0].scene.engine,
    "three",
  );
  assert.equal(
    restored.shots.find((s) => s.id === video).takes[0].status,
    "idle",
  );
  const inputs = canvasInputs(restored, video);
  assert.deepEqual(inputs.assetIds.sort(), ["photo"]);
  assert.equal(inputs.sceneNodeId, scene);
  assert.equal(inputs.scene.engine, "three");
  assert.equal(inputs.count, 2);
  assert.throws(() => connectNodes(restored, video, image), /循环/);
  assert.throws(() => connectNodes(restored, video, video), /自身/);
  const count = restored.canvas.edges.length;
  connectNodes(restored, audio, video);
  assert.equal(restored.canvas.edges.length, count);
});

test("audio is inserted into separate timeline lanes with real peaks and independent mixing", () => {
  let p = createVideoProject("Sound film");
  p.assets.push({
    id: "sound",
    name: "Recorded sound",
    kind: "audio",
    folder: "uploads",
    url: "https://example.test/sound.wav",
    duration: 12,
    peaks: [0.1, 0.8, 0.3],
  });
  p = runCommands(
    p,
    ["voice", "music", "sfx"].map((kind, index) => ({
      tool: "audio.add",
      args: { assetId: "sound", kind, start: index, duration: 3 },
    })),
  );
  assert.deepEqual(
    p.audio.map((a) => a.kind),
    ["voice", "music", "sfx"],
  );
  assert.deepEqual(
    p.audio.map((a) => a.start),
    [0, 1, 2],
  );
  for (const clip of p.audio) {
    assert.deepEqual(clip.peaks, [0.1, 0.8, 0.3]);
    assert.equal(clip.demo, false);
  }
  const changed = runCommands(p, [
    {
      tool: "audio.update",
      targetId: p.audio[0].id,
      args: { gain: 0.4, fadeIn: 0.5 },
    },
  ]);
  assert.equal(changed.audio[0].gain, 0.4);
  assert.equal(changed.audio[1].gain, 0.7);
  assert.equal(p.audio[0].gain, 0.7);
});
