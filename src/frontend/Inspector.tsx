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
            Inspector <Icon name="link" size={16} />
          </h2>
          <p>
            <strong>Shot {String(index + 1).padStart(2, "0")}</strong>
            <span>{s.title}</span>
          </p>
        </div>
        <div>
          <IconButton
            icon="chevron"
            label="Previous shot"
            disabled={index === 0}
            onClick={() => w.select(p.shots[index - 1].id)}
          />
          <IconButton
            icon="chevron"
            label="Next shot"
            disabled={index === p.shots.length - 1}
            onClick={() => w.select(p.shots[index + 1].id)}
          />
          <IconButton
            icon="close"
            label="Close inspector"
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
          Edit connected 3D scene
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
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <div className="mw-inspector-scroll">
        {tab === "edit" && <EditingTools />}
        {tab === "prompt" && (
          <>
            <section className="mw-prompt-card">
              <textarea
                aria-label="Shot prompt"
                value={s.prompt}
                onChange={(e) => w.updateShot({ prompt: e.target.value })}
              />
              <div className="mw-tags">
                {s.tags.map((t) => (
                  <button
                    title={"Remove tag " + t}
                    key={t}
                    onClick={() =>
                      w.updateShot({ tags: s.tags.filter((x) => x !== t) })
                    }
                  >
                    {t}
                  </button>
                ))}
                <input
                  aria-label="Add prompt tag"
                  placeholder="＋ tag"
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
              <Field label="Model">
                <select
                  aria-label="Generation model"
                  value={s.model}
                  onChange={(e) => w.updateShot({ model: e.target.value })}
                >
                  {["Seedance 2.5"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <NumberField
                label="Duration"
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
              <Field label="Resolution">
                <select
                  value={s.resolution}
                  onChange={(e) => w.updateShot({ resolution: e.target.value })}
                >
                  {["720p", "1080p", "4K"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Aspect Ratio">
                <select
                  value={s.aspectRatio}
                  onChange={(e) =>
                    w.updateShot({ aspectRatio: e.target.value })
                  }
                >
                  {["16:9", "9:16", "1:1", "4:3", "21:9"].map((x) => (
                    <option key={x}>{x}</option>
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
            <h3>Character consistency</h3>
            <p className="mw-muted">
              Choose a character reference for this shot.
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
                  <small>{c.role}</small>
                </span>
                <span className="mw-choice-dot" />
              </button>
            ))}
            <CharacterReference />
            <h3 className="mw-spaced">Location reference</h3>
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
                  <span>{String(name)}</span>
                </button>
              ))}
            </div>
            <h3 className="mw-spaced">Shot reference</h3>
            <Photo className="mw-full-reference" media={s.image} />
            <button
              className="mw-secondary full"
              onClick={() => w.setSection("assets")}
            >
              <Icon name="image" size={15} />
              Choose from assets
            </button>
            <p className="mw-help">
              Reference images guide your connected model. Character similarity
              remains a creative target.
            </p>
          </>
        )}
        {tab === "repair" && (
          <>
            <div className="mw-section-heading">
              <h3>Repair selected range</h3>
              <Badge>Source time</Badge>
            </div>
            <p className="mw-muted">
              Choose the frames and region you want to change.
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
              <span>Click to place a region</span>
            </div>
            <div className="mw-form-grid">
              <NumberField
                label="Start (seconds)"
                min={0}
                max={s.repair.end - 0.1}
                value={s.repair.start}
                onChange={(start) => repair({ start })}
              />
              <NumberField
                label="End (seconds)"
                min={s.repair.start + 0.1}
                max={s.duration}
                value={s.repair.end}
                onChange={(end) => repair({ end })}
              />
            </div>
            <div className="mw-range-sliders">
              <input
                aria-label="Repair start"
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
                aria-label="Repair end"
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
                      label={"Region " + key}
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
                  Clear region
                </button>
              </>
            )}
            <Field label="Repair instruction">
              <textarea
                aria-label="Repair instruction"
                placeholder="Describe what should change in this range…"
                value={s.repair.prompt}
                onChange={(e) => repair({ prompt: e.target.value })}
              />
            </Field>
            <Toggle
              label="Preserve character"
              checked={s.preserveCharacter}
              onChange={(preserveCharacter) =>
                w.updateShot({ preserveCharacter })
              }
            />
            <p className="mw-help">
              The original take stays available. A connected API creates a new
              candidate for you to review.
            </p>
          </>
        )}
        {tab === "settings" && (
          <>
            <Field label="Shot title">
              <input
                value={s.title}
                onChange={(e) => w.updateShot({ title: e.target.value })}
              />
            </Field>
            <Field label="Story caption">
              <input
                value={s.description}
                onChange={(e) => w.updateShot({ description: e.target.value })}
              />
            </Field>
            <div className="mw-section-heading">
              <h3>Clip timing</h3>
              <Badge tone="gray">Source seconds</Badge>
            </div>
            <div className="mw-form-grid">
              <NumberField
                label="Trim in"
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
                label="Trim out"
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
              <Field label="Playback speed">
                <select
                  aria-label="Playback speed"
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
                      {x}×
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Version binding">
                <select
                  value={s.binding}
                  onChange={(e) =>
                    w.updateShot({ binding: e.target.value as any })
                  }
                >
                  <option value="follow">Follow shot</option>
                  <option value="pinned">Pinned take</option>
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
              Duplicate shot
            </button>
            <button
              className="mw-text-button danger"
              disabled={p.shots.length <= 1}
              onClick={() => {
                w.execute([{ tool: "clip.remove", targetId: s.id }]);
              }}
            >
              <Icon name="trash" size={14} />
              Remove from sequence
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
          {tab === "repair" ? "Create repair candidate" : "Generate this shot"}
          <Icon name="arrow" size={16} />
        </button>
        <span>Compare your takes. Choose your favorite.</span>
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
        <h3>Generation stages</h3>
        <Badge tone={job ? "purple" : "gray"}>{job ? "Live" : "Ready"}</Badge>
        <button onClick={() => w.setModal("jobs")}>
          View logs <Icon name="chevron" size={12} />
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
            <strong>{name}</strong>
            <small>
              {i === 0
                ? "Reference"
                : i === 1 && job
                  ? job.progress !== undefined
                    ? Math.round(job.progress * 100) + "%"
                    : job.phase || job.status
                  : "Waiting"}
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
      <h3>Repair tools</h3>
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
            {title}
          </button>
        ))}
      </div>
      {w.inspectorTab !== "repair" && (
        <Toggle
          label="Preserve Character"
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
        <h3>Character Consistency</h3>
        {c ? (
          <div>
            <button onClick={() => w.setSection("characters")}>
              <Photo media={c.image} />
              <span>
                <strong>{c.name}</strong>
                <small>{c.role}</small>
              </span>
            </button>
            <label>
              <span>Strength</span>
              <input
                aria-label="Character strength"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.characterStrength}
                onChange={(e) =>
                  w.updateShot({ characterStrength: Number(e.target.value) })
                }
              />
              <b>{s.characterStrength.toFixed(2).replace(/0$/, "")}</b>
            </label>
          </div>
        ) : (
          <button
            className="mw-secondary full"
            onClick={() => w.setSection("characters")}
          >
            Choose a character
          </button>
        )}
      </section>
      {w.inspectorTab === "prompt" && (
        <section className="mw-location-reference">
          <h3>Location Reference</h3>
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
              <strong>{s.location}</strong>
              <small>Style reference</small>
            </span>
            <Icon name="chevron" size={17} />
          </button>
        </section>
      )}
    </>
  );
}
