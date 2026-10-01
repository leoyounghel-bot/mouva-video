import { t as tr } from "../i18n";
import { Handle, Position } from "@xyflow/react";
import { Icon } from "../Primitives";
export function CanvasPorts() {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="mw-flow-port"
        aria-label={tr("输入连接")}
        title={tr("输入连接")}
      >
        <Icon name="plus" size={12} />
      </Handle>
      <Handle
        type="source"
        position={Position.Right}
        className="mw-flow-port"
        aria-label={tr("输出连接")}
        title={tr("输出连接")}
      >
        <Icon name="plus" size={12} />
      </Handle>
    </>
  );
}
