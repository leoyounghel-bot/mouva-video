import { Handle, Position } from "@xyflow/react";
import { Icon } from "../Primitives";
export function CanvasPorts() {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="mw-flow-port"
        aria-label="输入连接"
      >
        <Icon name="plus" size={12} />
      </Handle>
      <Handle
        type="source"
        position={Position.Right}
        className="mw-flow-port"
        aria-label="输出连接"
      >
        <Icon name="plus" size={12} />
      </Handle>
    </>
  );
}
