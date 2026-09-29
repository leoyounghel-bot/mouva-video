import { useWorkspace } from "../context";
import { Field, NumberField, Toggle, Icon, IconButton } from "../Primitives";
import { effects, defaults } from "./commands";
import { shotLength, locate } from "../demo";
export function EditingTools() {
  const w = useWorkspace(),
    s = w.shot,
    e = effects(s),
    hit = locate(w.project, w.time);
  const canSplit =
    hit?.shot.id === s.id &&
    hit.local > s.trimStart + 0.04 &&
    hit.local < s.trimEnd - 0.04;
  const change = (args: Record<string, any>) =>
    w.execute([{ tool: "clip.effects", targetId: s.id, args }]);
  return (
    <div className="mw-edit-tools">
      <div className="mw-section-heading">
        <h3>Clip editor</h3>
        <span className="mw-tool-badge">Manual + AI</span>
      </div>
      <p className="mw-muted">
        Edits appear in the preview and exported movie.
      </p>
      <div className="mw-tool-actions">
        <button
          disabled={!canSplit}
          onClick={() =>
            w.execute([
              {
                tool: "clip.split",
                targetId: s.id,
                args: { sourceTime: hit?.local },
              },
            ])
          }
        >
          <Icon name="scissors" size={16} />
          Split
        </button>
        <button
          onClick={() =>
            w.execute([{ tool: "clip.duplicate", targetId: s.id }])
          }
        >
          <Icon name="copy" size={16} />
          Duplicate
        </button>
        <button
          disabled={w.project.shots.length < 2}
          onClick={() => w.execute([{ tool: "clip.remove", targetId: s.id }])}
        >
          <Icon name="trash" size={16} />
          Delete
        </button>
      </div>
      <h3>Timing</h3>
      <div className="mw-form-grid">
        <NumberField
          label="Clip in (s)"
          value={s.trimStart}
          min={0}
          max={s.trimEnd - 0.04}
          onChange={(start) =>
            w.execute([
              {
                tool: "clip.trim",
                targetId: s.id,
                args: { start, end: s.trimEnd },
              },
            ])
          }
        />
        <NumberField
          label="Clip out (s)"
          value={s.trimEnd}
          min={s.trimStart + 0.04}
          max={s.duration}
          onChange={(end) =>
            w.execute([
              {
                tool: "clip.trim",
                targetId: s.id,
                args: { start: s.trimStart, end },
              },
            ])
          }
        />
        <NumberField
          label="Playback speed"
          value={s.speed}
          min={0.25}
          max={4}
          step={0.25}
          onChange={(speed) =>
            w.execute([{ tool: "clip.speed", targetId: s.id, args: { speed } }])
          }
        />
        <Field label="Frame fit">
          <select
            value={e.fit}
            onChange={(ev) => change({ fit: ev.target.value })}
          >
            <option value="cover">Fill frame</option>
            <option value="contain">Fit inside</option>
          </select>
        </Field>
      </div>
      <h3>Transform</h3>
      <div className="mw-form-grid">
        <NumberField
          label="Scale"
          value={e.scale}
          min={0.1}
          max={5}
          onChange={(scale) => change({ scale })}
        />
        <NumberField
          label="Rotation (°)"
          value={e.rotation}
          min={-180}
          max={180}
          step={1}
          onChange={(rotation) => change({ rotation })}
        />
        <NumberField
          label="Position X (%)"
          value={e.x}
          min={-100}
          max={100}
          step={1}
          onChange={(x) => change({ x })}
        />
        <NumberField
          label="Position Y (%)"
          value={e.y}
          min={-100}
          max={100}
          step={1}
          onChange={(y) => change({ y })}
        />
      </div>
      <div className="mw-tool-actions">
        <button
          aria-pressed={e.flipX}
          onClick={() => change({ flipX: !e.flipX })}
        >
          Flip horizontal
        </button>
        <button
          aria-pressed={e.flipY}
          onClick={() => change({ flipY: !e.flipY })}
        >
          Flip vertical
        </button>
      </div>
      <h3>Color & appearance</h3>
      {(
        ["brightness", "contrast", "saturation", "opacity", "blur"] as const
      ).map((k) => (
        <label className="mw-editor-slider" key={k}>
          <span>
            {k[0].toUpperCase() + k.slice(1)} <output>{e[k].toFixed(2)}</output>
          </span>
          <input
            type="range"
            aria-label={k}
            min={0}
            max={k === "opacity" ? 1 : k === "blur" ? 20 : 2}
            step={k === "blur" ? 0.5 : 0.05}
            value={e[k]}
            onChange={(ev) => change({ [k]: Number(ev.target.value) })}
          />
        </label>
      ))}
      <div className="mw-tool-actions">
        <button
          onClick={() =>
            change({ brightness: 1.06, contrast: 1.08, saturation: 1.15 })
          }
        >
          Vivid
        </button>
        <button onClick={() => change({ saturation: 0, contrast: 1.12 })}>
          Monochrome
        </button>
        <button onClick={() => change({ ...defaults })}>Reset effects</button>
      </div>
      <h3>Fades & source audio</h3>
      <div className="mw-form-grid">
        <NumberField
          label="Fade in (s)"
          value={e.fadeIn}
          min={0}
          max={shotLength(s)}
          onChange={(fadeIn) => change({ fadeIn })}
        />
        <NumberField
          label="Fade out (s)"
          value={e.fadeOut}
          min={0}
          max={shotLength(s)}
          onChange={(fadeOut) => change({ fadeOut })}
        />
      </div>
      <label className="mw-editor-slider">
        <span>
          Source volume <output>{Math.round(e.volume * 100)}%</output>
        </span>
        <input
          aria-label="Source volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={e.volume}
          onChange={(ev) => change({ volume: Number(ev.target.value) })}
        />
      </label>
      <Toggle
        label="Mute source audio"
        checked={e.muted}
        onChange={(muted) => change({ muted })}
      />
      <button
        className="mw-secondary full"
        onClick={() => {
          w.execute([
            { tool: "text.add", targetId: s.id, args: { text: "Your title" } },
          ]);
          w.setInspectorTab("settings");
        }}
      >
        <Icon name="text" size={16} />
        Add text / subtitle
      </button>
      <button
        className="mw-primary full"
        onClick={() => w.setModal("editing-assistant")}
      >
        <Icon name="spark" size={16} />
        Ask AI to edit this shot
      </button>
    </div>
  );
}
export function ClipToolbar() {
  const w = useWorkspace(),
    s = w.shot,
    hit = locate(w.project, w.time),
    source = hit?.shot.id === s.id ? hit.local : s.trimStart;
  const split = source > s.trimStart + 0.04 && source < s.trimEnd - 0.04;
  return (
    <div className="mw-clip-toolbar" aria-label="Clip editing tools">
      <IconButton
        icon="undo"
        label="Undo edit"
        disabled={!w.canUndo}
        onClick={w.undo}
      />
      <IconButton
        icon="redo"
        label="Redo edit"
        disabled={!w.canRedo}
        onClick={w.redo}
      />
      <i />
      <button
        title="Split at playhead (S)"
        disabled={!split}
        onClick={() =>
          w.execute([
            {
              tool: "clip.split",
              targetId: s.id,
              args: { sourceTime: source },
            },
          ])
        }
      >
        <Icon name="scissors" size={16} />
        Split
      </button>
      <button
        onClick={() => w.execute([{ tool: "clip.duplicate", targetId: s.id }])}
      >
        <Icon name="copy" size={16} />
        Duplicate
      </button>
      <IconButton
        icon="trash"
        label="Delete selected clip"
        disabled={w.project.shots.length < 2}
        onClick={() => w.execute([{ tool: "clip.remove", targetId: s.id }])}
      />
      <i />
      <button
        disabled={!split}
        onClick={() =>
          w.execute([
            {
              tool: "clip.trim",
              targetId: s.id,
              args: { start: source, end: s.trimEnd },
            },
          ])
        }
      >
        Set in
      </button>
      <button
        disabled={!split}
        onClick={() =>
          w.execute([
            {
              tool: "clip.trim",
              targetId: s.id,
              args: { start: s.trimStart, end: source },
            },
          ])
        }
      >
        Set out
      </button>
      <select
        aria-label="Clip speed"
        value={s.speed}
        onChange={(ev) =>
          w.execute([
            {
              tool: "clip.speed",
              targetId: s.id,
              args: { speed: Number(ev.target.value) },
            },
          ])
        }
      >
        {[...new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, s.speed])]
          .sort((a, b) => a - b)
          .map((n) => (
            <option key={n} value={n}>
              {n}×
            </option>
          ))}
      </select>
      <button
        onClick={() => {
          w.setInspectorTab("edit");
          w.setInspectorOpen(true);
        }}
      >
        <Icon name="sliders" size={16} />
        Adjust
      </button>
      <button
        onClick={() => {
          w.execute([
            { tool: "text.add", targetId: s.id, args: { text: "Your title" } },
          ]);
          w.setInspectorTab("settings");
          w.setInspectorOpen(true);
        }}
      >
        <Icon name="text" size={16} />
        Text
      </button>
      <button
        className="mw-ai-tool"
        onClick={() => w.setModal("editing-assistant")}
      >
        <Icon name="spark" size={16} />
        AI edit
      </button>
    </div>
  );
}
