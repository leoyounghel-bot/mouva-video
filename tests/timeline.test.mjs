import test from "node:test";
import assert from "node:assert/strict";
import {
  editAudioRange,
  rulerInterval,
  timelineRows,
  snapTime,
} from "../src/frontend/editor/timelineEditing.ts";
import { createVideoProject } from "../src/frontend/project-model.ts";
import { runCommands } from "../src/frontend/editor/commands.ts";
const clip = () => ({
  id: "audio",
  name: "Recording",
  kind: "voice",
  start: 2,
  duration: 6,
  sourceStart: 1,
  gain: 0.7,
  pan: 0.2,
  fadeIn: 1,
  fadeOut: 2,
  muted: false,
  solo: false,
  peaks: [0.2, 0.7],
  demo: false,
  assetId: "recording",
});
test("audio moves preserve its source, trimming changes source offset and caps fades", () => {
  const a = clip();
  assert.deepEqual(editAudioRange(a, "move", 3, 20, 12), {
    start: 5,
    duration: 6,
    sourceStart: 1,
    fadeIn: 1,
    fadeOut: 2,
  });
  const left = editAudioRange(a, "in", 2, 20, 12);
  assert.deepEqual(left, {
    start: 4,
    duration: 4,
    sourceStart: 3,
    fadeIn: 1,
    fadeOut: 2,
  });
  assert.equal(left.start + left.duration, a.start + a.duration);
  assert.equal(editAudioRange(a, "in", -10, 20, 12).sourceStart, 0);
  assert.equal(editAudioRange(a, "out", 30, 20, 12).duration, 11);
  const short = editAudioRange(a, "out", -30, 20, 12);
  assert.equal(short.duration, 0.04);
  assert.equal(short.fadeIn, 0.04);
  assert.equal(short.fadeOut, 0.04);
  assert.equal(editAudioRange(a, "move", 100, 20, 12).start, 14);
  assert.equal(a.duration, 6);
});
test("overlapping audio uses independently selectable rows and adjacent ranges share a row", () => {
  const result = timelineRows([
    { id: "a", start: 0, duration: 4 },
    { id: "b", start: 1, duration: 2 },
    { id: "c", start: 4, duration: 2 },
    { id: "d", start: 2, duration: 3 },
  ]);
  assert.equal(result.count, 3);
  assert.equal(result.rows.get("a"), result.rows.get("c"));
  assert.notEqual(result.rows.get("a"), result.rows.get("b"));
  assert.equal(timelineRows([]).count, 1);
});
test("ruler spacing scales across long films and zoom; snapping only uses close boundaries", () => {
  assert.equal(rulerInterval(28, 1000), 5);
  assert.equal(rulerInterval(28, 4000), 1);
  assert.ok(7200 / rulerInterval(7200, 1000) < 20);
  assert.equal(snapTime(4.06, [0, 4, 8], 0.1), 4);
  assert.equal(snapTime(4.3, [0, 4, 8], 0.1), 4.3);
});
test("audio split and duplicate preserve source continuity, mixing and the original project", () => {
  const p = createVideoProject("Editing");
  p.audio = [clip()];
  p.assets.push({
    id: "recording",
    name: "Recording",
    kind: "audio",
    duration: 12,
    url: "https://example.test/recording.wav",
    folder: "uploads",
  });
  const split = runCommands(p, [
    { tool: "audio.split", targetId: "audio", args: { time: 5 } },
  ]);
  assert.equal(split.audio.length, 2);
  assert.equal(split.audio[0].duration, 3);
  assert.equal(split.audio[1].start, 5);
  assert.equal(split.audio[1].sourceStart, 4);
  assert.equal(split.audio[1].duration, 3);
  assert.equal(split.audio[1].pan, 0.2);
  assert.deepEqual(split.audio[1].peaks, [0.2, 0.7]);
  assert.equal(split.audio[0].fadeOut, 0);
  assert.equal(split.audio[1].fadeIn, 0);
  assert.equal(p.audio[0].duration, 6);
  const duplicate = runCommands(split, [
    { tool: "audio.duplicate", targetId: "audio", args: { start: 2 } },
  ]);
  assert.equal(duplicate.audio.length, 3);
  assert.notEqual(duplicate.audio[0].id, duplicate.audio[2].id);
  assert.deepEqual(duplicate.audio[2], {
    ...duplicate.audio[0],
    id: duplicate.audio[2].id,
  });
  assert.throws(() =>
    runCommands(p, [
      { tool: "audio.split", targetId: "audio", args: { time: 2 } },
    ]),
  );
  assert.throws(() =>
    runCommands(p, [{ tool: "audio.duplicate", targetId: "missing" }]),
  );
});
