import test from "node:test";
import assert from "node:assert/strict";
import {
  wheelPanDelta,
  createPanFrame,
  canvasWheelAction,
  zoomAtPoint,
} from "../src/frontend/canvas/wheel.ts";

const size = { width: 1200, height: 700 };
const input = (values) => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  shiftKey: false,
  ...values,
});

test("mouse modes retain standard wheel zoom and Apple panning with Control zoom", () => {
  for (const deltaMode of [0, 1, 2]) {
    const wheel = input({ deltaY: 3, deltaMode });
    assert.equal(canvasWheelAction(wheel, "wheel"), "zoom");
    assert.equal(canvasWheelAction(wheel, "touch"), "pan");
    assert.equal(
      canvasWheelAction({ ...wheel, shiftKey: true }, "wheel"),
      "pan",
    );
    assert.equal(
      canvasWheelAction({ ...wheel, ctrlKey: true }, "touch"),
      "zoom",
    );
  }
  assert.equal(
    canvasWheelAction(input({ deltaX: 5, deltaY: 2 }), "wheel"),
    "pan",
  );
});

test("Control-drag zoom preserves the pointer's world position and stays within limits", () => {
  const camera = { x: 20, y: -30, zoom: 0.5 },
    anchor = { x: 300, y: 200 };
  const world = {
    x: (anchor.x - camera.x) / camera.zoom,
    y: (anchor.y - camera.y) / camera.zoom,
  };
  for (const factor of [2, 0.5, 1e6, 1e-6]) {
    const next = zoomAtPoint(camera, anchor, factor);
    assert.ok(next.zoom >= 0.1 && next.zoom <= 8);
    assert.ok(Math.abs((anchor.x - next.x) / next.zoom - world.x) < 1e-9);
    assert.ok(Math.abs((anchor.y - next.y) / next.zoom - world.y) < 1e-9);
  }
  assert.equal(zoomAtPoint(camera, anchor, 2).zoom, 1);
  assert.equal(zoomAtPoint(camera, anchor, 0.5).zoom, 0.25);
});

test("Magic Mouse keeps both diagonal axes and fractional inertia", () => {
  assert.deepEqual(wheelPanDelta(input({ deltaX: 1.25, deltaY: -3.5 }), size), {
    x: 1.25,
    y: -3.5,
  });
  assert.deepEqual(wheelPanDelta(input({ deltaY: 80 }), size), { x: 0, y: 80 });
});

test("ordinary wheels normalize line/page units and Shift supplies horizontal panning", () => {
  assert.deepEqual(wheelPanDelta(input({ deltaY: 3, deltaMode: 1 }), size), {
    x: 0,
    y: 60,
  });
  assert.deepEqual(
    wheelPanDelta(input({ deltaX: -1, deltaY: 1, deltaMode: 2 }), size),
    { x: -1200, y: 700 },
  );
  assert.deepEqual(
    wheelPanDelta(input({ deltaY: 3, deltaMode: 1, shiftKey: true }), size),
    { x: 60, y: 0 },
  );
  assert.deepEqual(
    wheelPanDelta(input({ deltaY: 1, deltaMode: 2, shiftKey: true }), size),
    { x: 1200, y: 0 },
  );
  // Chrome/macOS may already convert Shift-wheel into deltaX.
  assert.deepEqual(wheelPanDelta(input({ deltaX: 40, shiftKey: true }), size), {
    x: 40,
    y: 0,
  });
});

function harness() {
  let camera = { x: 10, y: 20, zoom: 0.5 },
    sequence = 0;
  const frames = new Map(),
    writes = [];
  const pan = createPanFrame({
    read: () => camera,
    write: (next) => {
      camera = next;
      writes.push(next);
    },
    requestFrame: (callback) => {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelFrame: (id) => frames.delete(id),
  });
  return {
    pan,
    frames,
    writes,
    setCamera(next) {
      camera = next;
    },
    tick() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((cb) => cb());
    },
  };
}

test("a high-frequency two-axis gesture produces one camera update per frame without zoom", () => {
  const h = harness();
  for (let i = 0; i < 200; i++) h.pan.push({ x: 0.25, y: -0.5 });
  assert.equal(h.frames.size, 1);
  assert.equal(h.writes.length, 0);
  h.tick();
  assert.deepEqual(h.writes, [{ x: -40, y: 120, zoom: 0.5 }]);
  h.pan.push({ x: -2, y: 4 });
  h.tick();
  assert.deepEqual(h.writes[1], { x: -38, y: 116, zoom: 0.5 });
});

test("queued panning preserves a newer camera and zoom set by the controls", () => {
  const h = harness();
  h.pan.push({ x: 5, y: 6 });
  h.setCamera({ x: 200, y: 300, zoom: 2 });
  h.pan.flush();
  h.tick();
  assert.deepEqual(h.writes, [{ x: 195, y: 294, zoom: 2 }]);
  assert.equal(h.frames.size, 0);
});

test("unmount cancels queued work and opposite gestures do not trigger redundant renders", () => {
  const h = harness();
  h.pan.push({ x: 8, y: 5 });
  h.pan.push({ x: -8, y: -5 });
  h.tick();
  assert.equal(h.writes.length, 0);
  h.pan.push({ x: 30, y: 50 });
  h.pan.dispose();
  h.tick();
  assert.equal(h.writes.length, 0);
  assert.equal(h.frames.size, 0);
});
