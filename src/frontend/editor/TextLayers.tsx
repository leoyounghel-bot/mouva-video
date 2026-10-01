import { t as tr } from "../i18n";
import { useWorkspace } from "../context";
import { Field, NumberField, IconButton } from "../Primitives";
export function TextLayers() {
  const w = useWorkspace(),
    s = w.shot;
  const edit = (id: string, args: Record<string, unknown>) =>
    w.execute([{ tool: "text.update", targetId: s.id, args: { id, ...args } }]);
  return (
    <>
      <div className="mw-section-heading mw-spaced">
        <h3>{tr("Native text layers")}</h3>
        <IconButton
          icon="plus"
          label={tr("Add text layer")}
          onClick={() =>
            w.execute([
              { tool: "text.add", targetId: s.id, args: { text: "Your text" } },
            ])
          }
        />
      </div>
      {!s.layers.length && (
        <p className="mw-muted">
          {tr("Add a title or subtitle, then choose when it appears.")}
        </p>
      )}
      {s.layers.map((l, i) => (
        <div className="mw-text-layer" key={l.id}>
          <header>
            <strong>
              {tr("Text")}
              {i + 1}
            </strong>
            <IconButton
              icon="trash"
              label={tr("Delete text ") + (i + 1)}
              onClick={() =>
                w.execute([
                  { tool: "text.remove", targetId: s.id, args: { id: l.id } },
                ])
              }
            />
          </header>
          <textarea
            aria-label={tr("Text layer ") + (i + 1)}
            value={l.text}
            maxLength={2000}
            onChange={(e) => edit(l.id, { text: e.target.value })}
          />
          <div className="mw-form-grid">
            <NumberField
              label={tr("Text in (source s)")}
              value={l.start}
              min={0}
              max={l.end - 0.001}
              onChange={(start) => edit(l.id, { start })}
            />
            <NumberField
              label={tr("Text out (source s)")}
              value={l.end}
              min={l.start + 0.001}
              max={s.duration}
              onChange={(end) => edit(l.id, { end })}
            />
            <NumberField
              label={tr("Font size")}
              value={l.fontSize}
              min={8}
              max={200}
              step={1}
              onChange={(fontSize) => edit(l.id, { fontSize })}
            />
            <Field label={tr("Text color")}>
              <input
                type="color"
                value={l.color}
                onChange={(e) => edit(l.id, { color: e.target.value })}
              />
            </Field>
            <NumberField
              label={tr("Text X (%)")}
              value={l.x}
              min={0}
              max={100}
              onChange={(x) => edit(l.id, { x })}
            />
            <NumberField
              label={tr("Text Y (%)")}
              value={l.y}
              min={0}
              max={100}
              onChange={(y) => edit(l.id, { y })}
            />
            <NumberField
              label={tr("Text opacity")}
              value={l.opacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(opacity) => edit(l.id, { opacity })}
            />
          </div>
        </div>
      ))}
    </>
  );
}
