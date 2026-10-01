import { useEffect, useRef, useState, type ReactNode } from "react";
import { NodeToolbar, useStore, useReactFlow } from "@xyflow/react";
import { composerPosition, composerViewport } from "./composer-position";
import { useCanvasActions } from "./context";

export function CanvasComposer({
  nodeId,
  children,
  toolbar,
}: {
  nodeId: string;
  children: ReactNode;
  toolbar: ReactNode;
}) {
  const flow = useReactFlow();
  const { composerBottomInset } = useCanvasActions();
  const geometry = useStore(
    (state) => {
      const node = state.nodeLookup.get(nodeId);
      return [
        state.width,
        state.height,
        state.transform[0] +
          (node?.internals.positionAbsolute.x || 0) * state.transform[2],
        state.transform[1] +
          (node?.internals.positionAbsolute.y || 0) * state.transform[2],
        (node?.measured.width || 620) * state.transform[2],
        (node?.measured.height || 350) * state.transform[2],
        node?.measured.width || 0,
        node?.measured.height || 0,
      ];
    },
    (a, b) => a.every((value, index) => value === b[index]),
  );
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(190);
  const [
    viewportWidth,
    viewportHeight,
    x,
    y,
    width,
    nodeHeight,
    worldWidth,
    worldHeight,
  ] = geometry;
  const bottomInset = Math.max(
    composerBottomInset,
    viewportWidth < 950 ? 118 : 84,
  );
  const placement = composerPosition(
    { x, y, width, height: nodeHeight },
    { width: viewportWidth, height: viewportHeight },
    height,
    bottomInset,
  );
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      // Measure natural content too, so a large reference list remains scrollable.
      const body = element.querySelector<HTMLElement>(".mw-flow-composer-body");
      setHeight(
        element.offsetHeight +
          (body ? Math.max(0, body.scrollHeight - body.clientHeight) : 0),
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!viewportWidth || !viewportHeight || !worldWidth || !worldHeight)
      return;
    // Read live geometry after the parent restores/resizes the camera.
    const frame = requestAnimationFrame(() => {
      const node = flow.getInternalNode(nodeId);
      if (!node?.measured.width || !node.measured.height) return;
      const camera = flow.getViewport();
      const next = composerViewport(
        {
          ...node.internals.positionAbsolute,
          width: node.measured.width,
          height: node.measured.height,
        },
        { width: viewportWidth, height: viewportHeight },
        camera,
        height,
        bottomInset,
      );
      if (
        Math.abs(next.x - camera.x) > 1 ||
        Math.abs(next.y - camera.y) > 1 ||
        Math.abs(next.zoom - camera.zoom) > 0.001
      )
        void flow.setViewport(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    flow,
    nodeId,
    viewportWidth,
    viewportHeight,
    worldWidth,
    worldHeight,
    height,
    bottomInset,
  ]);
  return (
    <>
      <NodeToolbar
        nodeId={nodeId}
        isVisible
        className="mw-flow-toolbar nodrag nopan nowheel"
        style={{
          transform: `translate(${placement.x}px, ${y - 34}px) translateY(-100%)`,
          width: placement.width,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {toolbar}
      </NodeToolbar>
      <NodeToolbar
        nodeId={nodeId}
        isVisible
        className="mw-flow-composer-anchor nodrag nopan nowheel"
        style={{
          transform: `translate(${placement.x}px, ${placement.y}px)`,
          width: placement.width,
          visibility: viewportWidth && viewportHeight ? "visible" : "hidden",
        }}
      >
        <div
          ref={content}
          className="mw-flow-composer"
          style={{
            width: "100%",
            maxWidth: "100%",
            maxHeight: placement.maxHeight,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      </NodeToolbar>
    </>
  );
}
