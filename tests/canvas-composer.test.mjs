import test from "node:test";
import assert from "node:assert/strict";
import {
  composerPosition,
  composerViewport,
} from "../src/frontend/canvas/composer-position.ts";

const node = { x: 140, y: -180, width: 620, height: 350 };
const size = { width: 1020, height: 720 };
const camera = { x: 484, y: 417, zoom: 0.51 };
const screen = (rect, view) => ({
  x: view.x + rect.x * view.zoom,
  y: view.y + rect.y * view.zoom,
  width: rect.width * view.zoom,
  height: rect.height * view.zoom,
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.001, `${a} != ${b}`);

test("composer stays centred exactly 16px below its node at every zoom and position", () => {
  for (const zoom of [0.1, 0.51, 1, 4, 8]) {
    const rect = screen(node, { ...camera, zoom });
    const form = composerPosition(rect, size, 190, 84);
    near(form.y, rect.y + rect.height + 16);
    near(form.x + form.width / 2, rect.x + rect.width / 2);
    const moved = composerPosition(
      { ...rect, x: rect.x + 40, y: rect.y + 60 },
      size,
      190,
      84,
    );
    near(moved.x, form.x + 40);
    near(moved.y, form.y + 60);
  }
});

test("selection framing fits the card, attached form, toolbar and bottom controls together", () => {
  for (const viewport of [
    size,
    { width: 720, height: 540 },
    { width: 440, height: 600 },
  ]) {
    for (const inset of [84, 118, 300]) {
      for (const height of [176, 480]) {
        const next = composerViewport(node, viewport, camera, height, inset);
        const rect = screen(node, next);
        const form = composerPosition(rect, viewport, height, inset);
        assert.ok(rect.y >= 89.99);
        assert.ok(form.x >= 15.99);
        assert.ok(form.x + form.width <= viewport.width - 15.99);
        assert.ok(
          form.y + Math.min(height, form.maxHeight) <=
            viewport.height - inset - 15.99,
        );
        assert.ok(next.zoom <= camera.zoom);
      }
    }
  }
});

test("framing an already visible pair preserves the camera", () => {
  const next = composerViewport(node, size, camera, 176, 84);
  const again = composerViewport(node, size, next, 176, 84);
  assert.deepEqual(again, next);
});
