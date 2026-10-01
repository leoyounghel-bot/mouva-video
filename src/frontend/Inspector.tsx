import { t as tr } from "./i18n";
import { EditingTools } from "./editor/EditingTools";
import { TextLayers } from "./editor/TextLayers";
import { workingScene } from "./native/templates";
import { useState } from "react";
import { useWorkspace } from "./context";
import {
  Photo,
  Icon,
  IconButton,
  Field,
  NumberField,
  Toggle,
  Badge,
} from "./Primitives";
import { media, uid } from "./demo";
export function Inspector() {
  const w = useWorkspace(),
    s = w.shot,
    p = w.project,
    index = p.shots.findIndex((x) => x.id === s.id),
    character = p.characters.find((c) => c.id === s.characterId),
    [tag, setTag] = useState(""),
    tab = w.inspectorTab;
  const repair = (patch: Partial<typeof s.repair>) =>
    w.updateShot({ repair: { ...s.repair, ...patch } });
  return (
    <aside className={"mw-inspector " + (w.inspectorOpen ? "open" : "")}>
      <header className="mw-inspector-heading">
        <div>
          <h2>
            {tr("Inspector")}
            <Icon name="link" size={16} />
          </h2>
          <p>
            <strong>
              {tr("Shot")}
              {String(index + 1).padStart(2, "0")}
            </strong>
            <span>{s.title}</span>
          </p>
        </div>
        <div>
          <IconButton
            icon="chevron"
            label={tr("Previous shot")}
            disabled={index === 0}
            onClick={() => w.select(p.shots[index - 1].id)}
          />
          <IconButton
            icon="chevron"
            label={tr("Next shot")}
            disabled={index === p.shots.length - 1}
            onClick={() => w.select(p.shots[index + 1].id)}
          />
          <IconButton
            icon="close"
            label={tr("Close inspector")}
            onClick={() => w.setInspectorOpen(false)}
          />
        </div>
      </header>
      {workingScene(s) && (
        <button
          className="mw-edit-source-button"
          onClick={() => w.openScene(s.id)}
        >
          <Icon name="box" size={16} />
          {tr("Edit connected 3D scene")}
          <Icon name="arrow" size={15} />
        </button>
      )}
      <nav className="mw-inspector-tabs">
        {["edit", "prompt", "reference", "repair", "settings"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => {
              w.setInspectorTab(t);
              if (t === "edit") {
                w.setSceneOpen(false);
              }
            }}
          >
            {tr(t[0].toUpperCase() + t.slice(1))}
          </button>
        ))}
      </nav>
      <div className="mw-inspector-scroll">
        {tab === "edit" && <EditingTools />}
        {tab === "prompt" && (
          <>
            <section className="mw-prompt-card">
              <textarea
                aria-label={tr("Shot prompt")}
                value={s.prompt}
                onChange={(e) => w.updateShot({ prompt: e.target.value })}
              />
              <div className="mw-tags">
                {s.tags.map((t) => (
                  <button
                    title={tr("Remove tag ") + t}
                    key={t}
                    onClick={() =>
                      w.updateShot({ tags: s.tags.filter((x) => x !== t) })
                    }
                  >
                    {tr(t)}
                  </button>
                ))}
                <input
                  aria-label={tr("Add prompt tag")}
                  placeholder={tr("＋ tag")}
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tag.trim()) {
                      w.updateShot({
                        tags: [...new Set([...s.tags, tag.trim()])],
                      });
                      setTag("");
                    }
                  }}
                />
              </div>
            </section>
            <div className="mw-form-grid">
              <Field label={tr("Model")}>
                <select
                  aria-label={tr("Generation model")}
                  value={s.model}
                  onChange={(e) => w.updateShot({ model: e.target.value })}
                >
                  {["Seedance 2.5"].map((m) => (
                    <option key={m}>{tr(m)}</option>
                  ))}
                </select>
              </Field>
              <NumberField
                label={tr("Duration")}
                disabled={s.takes.some(
                  (t) => t.id === s.adoptedTakeId && !!t.videoUrl,
                )}
                value={s.duration}
                min={1}
                max={120}
                step={0.1}
                onChange={(n) =>
                  w.updateShot({
                    duration: n,
                    trimStart: Math.min(s.trimStart, n - 0.1),
                    trimEnd: n,
                    repair: {
                      ...s.repair,
                      end: Math.min(s.repair.end, n),
                      start: Math.min(s.repair.start, n - 0.1),
                    },
                    layers: s.layers.map((l) => ({
                      ...l,
                      start: Math.min(l.start, n - 0.1),
                      end: Math.min(l.end, n),
                    })),
                  })
                }
              />
              <Field label={tr("Resolution")}>
                <select
                  value={s.resolution}
                  onChange={(e) => w.updateShot({ resolution: e.target.value })}
                >
                  {["720p", "1080p", "4K"].map((x) => (
                    <option key={x}>{tr(x)}</option>
                  ))}
                </select>
              </Field>
              <Field label={tr("Aspect Ratio")}>
                <select
                  value={s.aspectRatio}
                  onChange={(e) =>
                    w.updateShot({ aspectRatio: e.target.value })
                  }
                >
                  {["16:9", "9:16", "1:1", "4:3", "21:9"].map((x) => (
                    <option key={x}>{tr(x)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Stages />
            <RepairTools />
            <CharacterReference />
          </>
        )}
        {tab === "reference" && (
          <>
            <h3>{tr("Character consistency")}</h3>
            <p className="mw-muted">
              {tr("Choose a character reference for this shot.")}
            </p>
            {p.characters.map((c) => (
              <button
                className={
                  "mw-reference-choice " +
                  (s.characterId === c.id ? "selected" : "")
                }
                key={c.id}
                onClick={() => w.updateShot({ characterId: c.id })}
              >
                <Photo media={c.image} />
                <span>
                  <strong>{c.name}</strong>
                  <small>{tr(c.role)}</small>
                </span>
                <span className="mw-choice-dot" />
              </button>
            ))}
            <CharacterReference />
            <h3 className="mw-spaced">{tr("Location reference")}</h3>
            <div className="mw-location-grid">
              {[
                ["Paris Street", media.paris],
                ["Cafe", media.cafeLocation],
                ["Art Gallery", media.galleryLocation],
              ].map(([name, image]) => (
                <button
                  className={s.location === name ? "active" : ""}
                  key={String(name)}
                  onClick={() => w.updateShot({ location: String(name) })}
                >
                  <Photo media={image as any} />
                  <span>{tr(String(name))}</span>
                </button>
              ))}
            </div>
            <h3 className="mw-spaced">{tr("Shot reference")}</h3>
            <Photo className="mw-full-reference" media={s.image} />
            <button
              className="mw-secondary full"
              onClick={() => w.setSection("assets")}
            >
              <Icon name="image" size={15} />
              {tr("Choose from assets")}
            </button>
            <p className="mw-help">
              {tr(
                "Reference images guide your connected model. Character similarity remains a creative target.",
              )}
            </p>
          </>
        )}
        {tab === "repair" && (
          <>
            <div className="mw-section-heading">
              <h3>{tr("Repair selected range")}</h3>
              <Badge>{tr("Source time")}</Badge>
            </div>
            <p className="mw-muted">
              {tr("Choose the frames and region you want to change.")}
            </p>
            <div
              className="mw-mask-preview"
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect(),
                  x = Math.max(
                    0,
                    Math.min(0.85, (e.clientX - r.left) / r.width - 0.15),
                  ),
                  y = Math.max(
                    0,
                    Math.min(0.75, (e.clientY - r.top) / r.height - 0.2),
                  );
                repair({ mask: { x, y, width: 0.3, height: 0.4 } });
              }}
            >
              <Photo media={s.image} />
              {s.repair.mask && (
                <div
                  style={{
                    left: s.repair.mask.x * 100 + "%",
                    top: s.repair.mask.y * 100 + "%",
                    width: s.repair.mask.width * 100 + "%",
                    height: s.repair.mask.height * 100 + "%",
                  }}
                >
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              )}
              <span>{tr("Click to place a region")}</span>
            </div>
            <div className="mw-form-grid">
              <NumberField
                label={tr("Start (seconds)")}
                min={0}
                max={s.repair.end - 0.1}
                value={s.repair.start}
                onChange={(start) => repair({ start })}
              />
              <NumberField
                label={tr("End (seconds)")}
                min={s.repair.start + 0.1}
                max={s.duration}
                value={s.repair.end}
                onChange={(end) => repair({ end })}
              />
            </div>
            <div className="mw-range-sliders">
              <input
                aria-label={tr("Repair start")}
                type="range"
                min={0}
                max={s.duration}
                step={0.1}
                value={s.repair.start}
                onChange={(e) =>
                  repair({
                    start: Math.min(Number(e.target.value), s.repair.end - 0.1),
                  })
                }
              />
              <input
                aria-label={tr("Repair end")}
                type="range"
                min={0}
                max={s.duration}
                step={0.1}
                value={s.repair.end}
                onChange={(e) =>
                  repair({
                    end: Math.max(Number(e.target.value), s.repair.start + 0.1),
                  })
                }
              />
            </div>
            <RepairTools />
            {s.repair.mask && (
              <>
                <div className="mw-form-grid">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <NumberField
                      key={key}
                      label={tr("Region ") + key}
                      value={s.repair.mask![key]}
                      min={key === "width" || key === "height" ? 0.01 : 0}
                      max={
                        key === "x"
                          ? 1 - s.repair.mask!.width
                          : key === "y"
                            ? 1 - s.repair.mask!.height
                            : key === "width"
                              ? 1 - s.repair.mask!.x
                              : 1 - s.repair.mask!.y
                      }
                      step={0.01}
                      onChange={(n) =>
                        repair({ mask: { ...s.repair.mask!, [key]: n } })
                      }
                    />
                  ))}
                </div>
                <button
                  className="mw-text-button"
                  onClick={() => repair({ mask: undefined })}
                >
                  {tr("Clear region")}
                </button>
              </>
            )}
            <Field label={tr("Repair instruction")}>
              <textarea
                aria-label={tr("Repair instruction")}
                placeholder={tr("Describe what should change in this range…")}
                value={s.repair.prompt}
                onChange={(e) => repair({ prompt: e.target.value })}
              />
            </Field>
            <Toggle
              label={tr("Preserve character")}
              checked={s.preserveCharacter}
              onChange={(preserveCharacter) =>
                w.updateShot({ preserveCharacter })
              }
            />
            <p className="mw-help">
              {tr(
                "The original take stays available. A connected API creates a new candidate for you to review.",
              )}
            </p>
          </>
        )}
        {tab === "settings" && (
          <>
            <Field label={tr("Shot title")}>
              <input
                value={s.title}
                onChange={(e) => w.updateShot({ title: e.target.value })}
              />
            </Field>
            <Field label={tr("Story caption")}>
              <input
                value={s.description}
                onChange={(e) => w.updateShot({ description: e.target.value })}
              />
            </Field>
            <div className="mw-section-heading">
              <h3>{tr("Clip timing")}</h3>
              <Badge tone="gray">{tr("Source seconds")}</Badge>
            </div>
            <div className="mw-form-grid">
              <NumberField
                label={tr("Trim in")}
                value={s.trimStart}
                min={0}
                max={s.trimEnd - 0.1}
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
                label={tr("Trim out")}
                value={s.trimEnd}
                min={s.trimStart + 0.1}
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
              <Field label={tr("Playback speed")}>
                <select
                  aria-label={tr("Playback speed")}
                  value={s.speed}
                  onChange={(e) =>
                    w.execute([
                      {
                        tool: "clip.speed",
                        targetId: s.id,
                        args: { speed: Number(e.target.value) },
                      },
                    ])
                  }
                >
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map((x) => (
                    <option key={x} value={x}>
                      {tr(x)}×
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={tr("Version binding")}>
                <select
                  value={s.binding}
                  onChange={(e) =>
                    w.updateShot({ binding: e.target.value as any })
                  }
                >
                  <option value="follow">{tr("Follow shot")}</option>
                  <option value="pinned">{tr("Pinned take")}</option>
                </select>
              </Field>
            </div>
            <TextLayers />
            <div className="mw-divider" />
            <button
              className="mw-secondary full"
              onClick={() =>
                w.execute([{ tool: "clip.duplicate", targetId: s.id }])
              }
            >
              <Icon name="layers" size={15} />
              {tr("Duplicate shot")}
            </button>
            <button
              className="mw-text-button danger"
              disabled={p.shots.length <= 1}
              onClick={() => {
                w.execute([{ tool: "clip.remove", targetId: s.id }]);
              }}
            >
              <Icon name="trash" size={14} />
              {tr("Remove from sequence")}
            </button>
          </>
        )}
      </div>
      <footer className="mw-inspector-footer">
        <button
          className="mw-primary full"
          onClick={() => w.request(tab === "repair" ? "repair" : "generate")}
        >
          <Icon name="spark" size={16} />
          {tr(
            tab === "repair" ? "Create repair candidate" : "Generate this shot",
          )}
          <Icon name="arrow" size={16} />
        </button>
        <span>{tr("Compare your takes. Choose your favorite.")}</span>
      </footer>
    </aside>
  );
}
function Stages() {
  const w = useWorkspace(),
    job = w.jobs.find((j) => j.shotId === w.shot.id),
    labels = ["Keyframes", "Motion preview", "Audio", "Enhancement"];
  return (
    <section className="mw-generation">
      <header>
        <h3>{tr("Generation stages")}</h3>
        <Badge tone={job ? "purple" : "gray"}>
          {tr(job ? "Live" : "Ready")}
        </Badge>
        <button onClick={() => w.setModal("jobs")}>
          {tr("View logs")}
          <Icon name="chevron" size={12} />
        </button>
      </header>
      <div>
        {labels.map((name, i) => (
          <section key={name}>
            <span
              className={i === 0 ? "done" : job && i === 1 ? "current" : ""}
            >
              {i === 0 ? (
                <Icon name="check" size={14} />
              ) : i === 1 ? (
                <Icon name="play" size={11} />
              ) : (
                <Icon name="plus" size={13} />
              )}
            </span>
            <strong>{tr(name)}</strong>
            <small>
              {tr(
                i === 0
                  ? "Reference"
                  : i === 1 && job
                    ? job.progress !== undefined
                      ? Math.round(job.progress * 100) + "%"
                      : job.phase || job.status
                    : "Waiting",
              )}
            </small>
          </section>
        ))}
      </div>
    </section>
  );
}
function RepairTools() {
  const w = useWorkspace();
  return (
    <section className="mw-repair-tools">
      <h3>{tr("Repair tools")}</h3>
      <div>
        {[
          ["range", "image", "Modify Range"],
          ["frame", "target", "Fix Frame"],
          ["inpaint", "spark", "Inpaint"],
          ["extend", "video", "Extend"],
        ].map(([id, icon, title]) => (
          <button
            key={id}
            className={w.shot.repair.tool === id ? "active" : ""}
            onClick={() => {
              w.updateShot({ repair: { ...w.shot.repair, tool: id as any } });
              w.setInspectorTab("repair");
            }}
          >
            <Icon name={icon} size={16} />
            {tr(title)}
          </button>
        ))}
      </div>
      {w.inspectorTab !== "repair" && (
        <Toggle
          label={tr("Preserve Character")}
          checked={w.shot.preserveCharacter}
          onChange={(preserveCharacter) => w.updateShot({ preserveCharacter })}
        />
      )}
    </section>
  );
}
function CharacterReference() {
  const w = useWorkspace(),
    s = w.shot,
    c = w.project.characters.find((c) => c.id === s.characterId);
  return (
    <>
      <section className="mw-character-consistency">
        <h3>{tr("Character Consistency")}</h3>
        {c ? (
          <div>
            <button onClick={() => w.setSection("characters")}>
              <Photo media={c.image} />
              <span>
                <strong>{c.name}</strong>
                <small>{tr(c.role)}</small>
              </span>
            </button>
            <label>
              <span>{tr("Strength")}</span>
              <input
                aria-label={tr("Character strength")}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.characterStrength}
                onChange={(e) =>
                  w.updateShot({ characterStrength: Number(e.target.value) })
                }
              />
              <b>{tr(s.characterStrength.toFixed(2).replace(/0$/, ""))}</b>
            </label>
          </div>
        ) : (
          <button
            className="mw-secondary full"
            onClick={() => w.setSection("characters")}
          >
            {tr("Choose a character")}
          </button>
        )}
      </section>
      {w.inspectorTab === "prompt" && (
        <section className="mw-location-reference">
          <h3>{tr("Location Reference")}</h3>
          <button onClick={() => w.setInspectorTab("reference")}>
            <Photo
              media={
                s.location === "Cafe"
                  ? media.cafeLocation
                  : s.location === "Art Gallery"
                    ? media.galleryLocation
                    : media.paris
              }
            />
            <span>
              <strong>{tr(s.location)}</strong>
              <small>{tr("Style reference")}</small>
            </span>
            <Icon name="chevron" size={17} />
          </button>
        </section>
      )}
    </>
  );
}
