import { useEffect, useState } from "react";
import { t as tr } from "../i18n";
import { useWorkspace } from "../context";
import { Icon } from "../Primitives";
import { shotLength } from "../demo";
import { effects, type EditCommand } from "../editor/commands";

export function AgentEditTools({
  busy,
  onApply,
}: {
  busy: boolean;
  onApply: (command: EditCommand) => boolean;
}) {
  const w = useWorkspace(),
    shot = w.shot;
  const [tool, setTool] = useState("speed");
  const [start, setStart] = useState(String(shot.trimStart));
  const [end, setEnd] = useState(String(shot.trimEnd));
  const [title, setTitle] = useState("");
  useEffect(() => {
    setStart(String(shot.trimStart));
    setEnd(String(shot.trimEnd));
  }, [shot.id, shot.trimStart, shot.trimEnd]);
  useEffect(() => setTitle(""), [shot.id]);
  const adopted = shot.viewingTakeId === shot.adoptedTakeId;
  const disabled = busy || !adopted;
  const apply = (tool: string, args: Record<string, unknown>) =>
    !disabled && onApply({ tool, targetId: shot.id, args });
  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  if (!speeds.includes(shot.speed)) speeds.push(shot.speed);
  return (
    <div className="mw-agent-edit-tools" aria-label={tr("即时剪辑")}>
      <div
        className="mw-agent-edit-tabs"
        role="group"
        aria-label={tr("剪辑操作")}
      >
        {[
          ["speed", "播放速度"],
          ["trim", "裁剪"],
          ["text", "字幕"],
          ["color", "调色"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tool === value}
            onClick={() => setTool(value)}
          >
            {tr(label)}
          </button>
        ))}
      </div>
      {!adopted && (
        <div className="mw-agent-edit-target">
          <span>{tr("剪辑作用于已采用版本。")}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              w.execute([
                {
                  tool: "take.preview",
                  targetId: shot.id,
                  args: { takeId: shot.adoptedTakeId },
                },
              ])
            }
          >
            {tr("预览已采用版本")}
            <Icon name="arrow" size={12} />
          </button>
        </div>
      )}
      {tool === "speed" && (
        <label className="mw-agent-speed">
          <span>{tr("播放速度")}</span>
          <select
            aria-label={tr("Agent 播放速度")}
            value={shot.speed}
            disabled={disabled}
            onChange={(e) =>
              apply("clip.speed", { speed: Number(e.target.value) })
            }
          >
            {speeds
              .sort((a, b) => a - b)
              .map((speed) => (
                <option key={speed} value={speed}>
                  {speed}×
                </option>
              ))}
          </select>
          <output>
            {tr("成片时长")} · {shotLength(shot).toFixed(1)}
            {tr("s")}
          </output>
        </label>
      )}
      {tool === "trim" && (
        <div className="mw-agent-trim">
          <label>
            {tr("起点（秒）")}
            <input
              aria-label={tr("Agent 裁剪起点")}
              type="number"
              min={0}
              max={shot.duration - 0.04}
              step={0.1}
              value={start}
              disabled={disabled}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            {tr("终点（秒）")}
            <input
              aria-label={tr("Agent 裁剪终点")}
              type="number"
              min={0.04}
              max={shot.duration}
              step={0.1}
              value={end}
              disabled={disabled}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={disabled || !start || !end}
            onClick={() =>
              apply("clip.trim", { start: Number(start), end: Number(end) })
            }
          >
            {tr("应用裁剪")}
          </button>
        </div>
      )}
      {tool === "text" && (
        <div className="mw-agent-text-tool">
          <input
            aria-label={tr("Agent 字幕文字")}
            value={title}
            maxLength={2000}
            disabled={disabled}
            placeholder={tr("输入标题或字幕")}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="button"
            disabled={disabled || !title.trim()}
            onClick={() => {
              if (apply("text.add", { text: title.trim() })) setTitle("");
            }}
          >
            {tr("添加字幕")}
          </button>
        </div>
      )}
      {tool === "color" && (
        <div className="mw-agent-color-tool">
          {[
            ["自然", 1, 1, 1],
            ["鲜艳", 1, 1.1, 1.25],
            ["黑白", 1, 1, 0],
          ].map(([label, brightness, contrast, saturation]) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              aria-pressed={
                effects(shot).brightness === brightness &&
                effects(shot).contrast === contrast &&
                effects(shot).saturation === saturation
              }
              onClick={() =>
                apply("clip.effects", { brightness, contrast, saturation })
              }
            >
              {tr(label)}
            </button>
          ))}
        </div>
      )}
      <small>{tr("直接应用到成片，可用顶部撤销恢复。")}</small>
    </div>
  );
}
