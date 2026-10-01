type Rect = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };
type Camera = { x: number; y: number; zoom: number };

// The node and composer share one centre and a fixed gap. Camera framing,
// rather than flipping the form, keeps this relationship when space is tight.
export function composerPosition(
  node: Rect,
  viewport: Size,
  _contentHeight: number,
  bottomInset: number,
) {
  const width = Math.max(0, Math.min(660, viewport.width - 32));
  return {
    x: node.x + node.width / 2 - width / 2,
    y: node.y + node.height + 16,
    width,
    maxHeight: Math.max(
      48,
      Math.min(
        (viewport.height - bottomInset - 32) / 2,
        viewport.height - bottomInset - 170,
      ),
    ),
  };
}

// Run on selection or layout changes, never on node drags or manual panning.
export function composerViewport(
  node: Rect,
  viewport: Size,
  camera: Camera,
  contentHeight: number,
  bottomInset: number,
): Camera {
  const form = composerPosition(node, viewport, contentHeight, bottomInset);
  const top = 90;
  const bottom = viewport.height - bottomInset - 16;
  const height = Math.min(contentHeight, form.maxHeight);
  const available = Math.max(20, bottom - top - 16 - height);
  const zoom = Math.max(
    0.1,
    Math.min(
      camera.zoom,
      available / node.height,
      (viewport.width - 32) / node.width,
    ),
  );
  const cardWidth = node.width * zoom;
  const pairWidth = Math.max(cardWidth, form.width);
  const centre = Math.max(
    16 + pairWidth / 2,
    Math.min(
      camera.x + (node.x + node.width / 2) * zoom,
      viewport.width - 16 - pairWidth / 2,
    ),
  );
  const y = Math.max(
    top,
    Math.min(
      camera.y + node.y * zoom,
      bottom - height - 16 - node.height * zoom,
    ),
  );
  return {
    x: centre - (node.x + node.width / 2) * zoom,
    y: y - node.y * zoom,
    zoom,
  };
}
