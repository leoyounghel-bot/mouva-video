import { ReactFlowProvider } from "@xyflow/react";
import { useWorkspace } from "./context";
import { CanvasWorkspace } from "./canvas/CanvasWorkspace";
import "@xyflow/react/dist/style.css";
export function CreativeGraph() {
  const w = useWorkspace();
  return (
    <ReactFlowProvider key={w.project.id}>
      <CanvasWorkspace />
    </ReactFlowProvider>
  );
}
