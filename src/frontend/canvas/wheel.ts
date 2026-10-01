type Point = { x: number; y: number };
type Camera = Point & { zoom: number };
type WheelInput = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  shiftKey: boolean;
  ctrlKey?: boolean;
};
export type MouseMode = "touch" | "wheel";
export function canvasWheelAction(event: WheelInput, mode: MouseMode) {
  if (event.ctrlKey && mode === "touch") return "zoom";
  return mode === "touch" || event.shiftKey || event.deltaX !== 0
    ? "pan"
    : "zoom";
}

export function zoomAtPoint(
  camera: Camera,
  anchor: Point,
  scale: number,
): Camera {
  const zoom = Math.max(0.1, Math.min(8, camera.zoom * scale));
  const ratio = zoom / camera.zoom;
  return {
    x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio,
    zoom,
  };
}

// Preserve pixel deltas (including Magic Mouse inertia and diagonal gestures).
// Ordinary wheels may report lines/pages; Shift + wheel supplies a second axis.
export function wheelPanDelta(
  event: WheelInput,
  size: { width: number; height: number },
): Point {
  const horizontal = event.shiftKey && event.deltaX === 0;
  const x = horizontal ? event.deltaY : event.deltaX;
  const y = horizontal ? 0 : event.deltaY;
  return {
    x:
      x * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? size.width : 1),
    y:
      y *
      (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? size.height : 1),
  };
}

// One viewport update per animation frame, without React state, easing or
// synchronous persistence in the input loop. Read the latest camera at flush
// time so a queued gesture never restores an old zoom or camera position.
export function createPanFrame({
  read,
  write,
  requestFrame,
  cancelFrame,
}: {
  read: () => Camera;
  write: (camera: Camera) => void;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
}) {
  let frame: number | null = null;
  let x = 0,
    y = 0;
  const flush = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    if (!x && !y) return;
    const camera = read();
    const next = { ...camera, x: camera.x - x, y: camera.y - y };
    x = y = 0;
    write(next);
  };
  return {
    push(delta: Point) {
      x += delta.x;
      y += delta.y;
      if ((x || y) && frame === null)
        frame = requestFrame(() => {
          frame = null;
          flush();
        });
    },
    flush,
    dispose() {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      x = y = 0;
    },
  };
}
