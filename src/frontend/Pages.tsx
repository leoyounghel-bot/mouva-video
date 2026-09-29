import { workingScene } from "./native/templates";
import { useRef, useState } from "react";
import { useWorkspace } from "./context";
import { Photo, Icon, IconButton, Badge, EmptyState } from "./Primitives";
import { uid, shotLength } from "./demo";
export function StreamView() {
  const w = useWorkspace();
  return (
    <div className="mw-stream-page">
      <header>
        <span className="mw-eyebrow">YOUR STORY, FRAME BY FRAME</span>
        <h1>Let your story unfold.</h1>
        <p>A little direction. A world of possibilities.</p>
        <Badge>{w.project.shots.length} connected shots</Badge>
      </header>
      {w.project.shots.map((s, i) => {
        const selected = s.id === w.selected;
        return (
          <article
            className={"mw-story-card " + (selected ? "selected" : "")}
            key={s.id}
          >
            <header>
              <button onClick={() => w.select(s.id)}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <small>SHOT {String(i + 1).padStart(2, "0")}</small>
                  <h2>{s.title}</h2>
                </div>
              </button>
              <Badge tone="gray">{shotLength(s).toFixed(1)}s</Badge>
              <IconButton
                icon="more"
                label={"Shot settings " + s.title}
                onClick={() => {
                  w.select(s.id);
                  w.setInspectorTab("settings");
                }}
              />
            </header>
            <p>{s.description}</p>
            <button className="mw-story-image" onClick={() => w.select(s.id)}>
              <Photo
                media={
                  s.takes.find((t) => t.id === s.viewingTakeId)?.image ||
                  s.image
                }
                label={s.title}
              />
              <span className="mw-image-format">
                {s.resolution} · {s.aspectRatio}
              </span>
              <span className="mw-image-badge">
                <Icon name="image" size={12} /> Reference storyboard
              </span>
              {selected &&
                w.inspectorTab === "settings" &&
                s.layers.map((l) => (
                  <span
                    className="mw-native-overlay"
                    key={l.id}
                    style={{
                      left: l.x + "%",
                      top: l.y + "%",
                      fontSize: l.fontSize * 0.65,
                      color: l.color,
                      opacity: l.opacity,
                    }}
                  >
                    {l.text}
                  </span>
                ))}
            </button>
            <footer>
              <div className="mw-take-chips">
                {s.takes.map((t) => (
                  <button
                    key={t.id}
                    className={t.id === s.viewingTakeId ? "active" : ""}
                    onClick={() => {
                      w.select(s.id);
                      w.update((p) => {
                        p.shots.find((x) => x.id === s.id)!.viewingTakeId =
                          t.id;
                      }, "View take");
                    }}
                  >
                    {t.label}
                    {s.adoptedTakeId === t.id && (
                      <Icon name="check" size={12} />
                    )}
                  </button>
                ))}
                <button
                  onClick={() => {
                    w.select(s.id);
                    w.request("generate");
                  }}
                >
                  <Icon name="plus" size={14} />
                  New take
                </button>
              </div>
              <button
                className="mw-text-button"
                onClick={() => {
                  w.select(s.id);
                  w.setModal("compare");
                }}
              >
                Compare takes <Icon name="arrow" size={14} />
              </button>
            </footer>
            {selected && s.viewingTakeId !== s.adoptedTakeId && (
              <div className="mw-adoption-bar">
                <span>Previewing a candidate · sequence unchanged</span>
                <button
                  className="mw-primary"
                  onClick={() => {
                    if (
                      w.execute([
                        {
                          tool: "take.adopt",
                          targetId: s.id,
                          args: { takeId: s.viewingTakeId },
                        },
                      ])
                    )
                      w.notify(
                        "Take adopted. All workspace views are in sync.",
                      );
                  }}
                >
                  Use this take
                </button>
              </div>
            )}
          </article>
        );
      })}
      <button className="mw-add-story" onClick={() => w.setModal("new-shot")}>
        <Icon name="plus" size={20} />
        <strong>What happens next?</strong>
        <span>Add another shot to your story</span>
      </button>
    </div>
  );
}
export function AssetsPage() {
  const w = useWorkspace(),
    input = useRef<HTMLInputElement>(null),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    assets = w.project.assets.filter(
      (a) =>
        (filter === "all" || a.kind === filter) &&
        a.name.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <div className="mw-resource-page">
      <header>
        <div>
          <span className="mw-eyebrow">YOUR CREATIVE TOOLKIT</span>
          <h1>Everything your story needs.</h1>
          <p>Keep references, footage, audio and 3D assets together.</p>
        </div>
        <button className="mw-primary" onClick={() => input.current?.click()}>
          <Icon name="upload" size={16} />
          Import assets
        </button>
      </header>
      <div className="mw-resource-toolbar">
        <div className="mw-filter-tabs">
          {["all", "image", "video", "audio", "model"].map((kind) => (
            <button
              className={filter === kind ? "active" : ""}
              key={kind}
              onClick={() => setFilter(kind)}
            >
              {kind === "all"
                ? "All assets"
                : kind[0].toUpperCase() + kind.slice(1) + "s"}
            </button>
          ))}
        </div>
        <label className="mw-search">
          <Icon name="search" size={16} />
          <input
            aria-label="Search assets"
            placeholder="Search assets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div
        className="mw-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add("dragover");
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove("dragover")}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("dragover");
          void w.upload(e.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={23} />
        <div>
          <strong>Drop your files here</strong>
          <span>Images, videos, audio & GLB · stored in this browser</span>
        </div>
        <button
          className="mw-text-button"
          onClick={() => input.current?.click()}
        >
          Browse files
        </button>
      </div>
      {assets.length ? (
        <div className="mw-assets-grid">
          {assets.map((a) => (
            <article
              key={a.id}
              className="mw-asset-card"
              draggable
              onDragStart={(e) => e.dataTransfer.setData("mouva/asset", a.id)}
            >
              <div>
                {a.image ? (
                  <Photo media={a.image} />
                ) : a.kind === "video" && a.url ? (
                  <video src={a.url} muted preload="metadata" />
                ) : (
                  <span className={"mw-asset-placeholder " + a.kind}>
                    <Icon
                      name={a.kind === "audio" ? "music" : "box"}
                      size={40}
                    />
                  </span>
                )}
                <Badge tone="gray">{a.kind}</Badge>
              </div>
              <section>
                <h3>{a.name}</h3>
                <small>
                  {a.folder === "uploads"
                    ? "Imported asset"
                    : "Project reference"}
                  {a.size
                    ? " · " + (a.size / 1024 / 1024).toFixed(1) + " MB"
                    : ""}
                </small>
                <button
                  className="mw-icon"
                  aria-label={"Use " + a.name}
                  onClick={() => {
                    if (a.kind === "image" && a.image) {
                      w.updateShot({
                        image: a.image,
                        takes: w.shot.takes.map((t) =>
                          t.id === w.shot.viewingTakeId
                            ? { ...t, image: a.image! }
                            : t,
                        ),
                      });
                      w.notify("Reference added to " + w.shot.title);
                    } else if (a.kind === "video" && a.url) {
                      w.updateShot({
                        takes: [
                          ...w.shot.takes,
                          {
                            id: uid(),
                            label: "Imported video",
                            image: a.image || w.shot.image,
                            status: "succeeded",
                            createdAt: new Date().toISOString(),
                            assetId: a.id,
                            duration: a.duration,
                            videoUrl: a.url,
                          },
                        ],
                      });
                      w.notify("Video added as a new candidate.");
                    } else if (a.kind === "audio") {
                      w.update((p) =>
                        p.audio.push({
                          id: uid(),
                          name: a.name,
                          kind: "music",
                          start: 0,
                          duration: a.duration || 10,
                          gain: 0.65,
                          pan: 0,
                          fadeIn: 0,
                          fadeOut: 0,
                          muted: false,
                          solo: false,
                          assetId: a.id,
                          peaks: [],
                          demo: false,
                        }),
                      );
                      w.setModal("audio");
                    } else if (a.kind === "model") {
                      const scene = workingScene(w.shot);
                      if (!scene) {
                        w.notify(
                          "Create an editable 3D shot first, then attach this model.",
                        );
                        return;
                      }
                      const next = structuredClone(scene),
                        target =
                          next.objects.find(
                            (o) =>
                              o.id === w.selectedObject && o.kind === "model",
                          ) || next.objects.find((o) => o.kind === "model");
                      if (target) target.assetId = a.id;
                      else {
                        if (next.objects.length >= 32) {
                          w.notify("This scene already has 32 objects.");
                          return;
                        }
                        next.objects.push({
                          id: "model-" + uid(),
                          name: a.name,
                          kind: "model",
                          position: [0, 0, 0],
                          rotation: [0, 0, 0],
                          scale: 1,
                          color: "#ffffff",
                          opacity: 1,
                          visible: true,
                          assetId: a.id,
                          text: "",
                          motion: {
                            preset: "none",
                            start: 0,
                            end: next.duration,
                            amount: 1,
                          },
                        });
                      }
                      w.updateShot({
                        nativeDraft: {
                          baseTakeId: w.shot.viewingTakeId,
                          scene: next,
                        },
                      });
                      w.openScene(w.shot.id);
                      w.notify("3D model attached to this scene.");
                    }
                  }}
                >
                  <Icon name="plus" size={18} />
                </button>
              </section>
              {["video", "image"].includes(a.kind) && (
                <button
                  className="mw-asset-insert"
                  onClick={() => {
                    if (
                      w.execute([{ tool: "clip.add", args: { assetId: a.id } }])
                    ) {
                      w.setSection("create");
                      w.setView("timeline");
                      w.setSceneOpen(false);
                      w.setInspectorTab("edit");
                    }
                  }}
                >
                  <Icon name="plus" size={14} />
                  Add to sequence
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="search"
          title="No assets found"
          description="Try another search or import your first asset."
        />
      )}
      <input
        type="file"
        multiple
        hidden
        ref={input}
        accept="image/*,video/*,audio/*,.glb"
        onChange={(e) => {
          if (e.target.files) void w.upload(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
export function CharactersPage() {
  const w = useWorkspace();
  return (
    <div className="mw-resource-page">
      <header>
        <div>
          <span className="mw-eyebrow">MEET YOUR CAST</span>
          <h1>Familiar faces. Consistent stories.</h1>
          <p>Give every character a place in your creative world.</p>
        </div>
        <button className="mw-primary" onClick={() => w.setModal("character")}>
          <Icon name="plus" size={16} />
          New character
        </button>
      </header>
      <div className="mw-character-grid">
        {w.project.characters.map((c) => (
          <article key={c.id}>
            <Photo media={c.image} />
            <div>
              <Badge>{c.role}</Badge>
              <h2>{c.name}</h2>
              <p>{c.description}</p>
              <footer>
                <span>
                  {w.project.shots.filter((s) => s.characterId === c.id).length}{" "}
                  shots
                </span>
                <button
                  className="mw-secondary"
                  onClick={() => {
                    w.updateShot({ characterId: c.id });
                    w.setSection("create");
                    w.setInspectorTab("reference");
                    w.notify(c.name + " selected for this shot.");
                  }}
                >
                  Use character
                  <Icon name="arrow" size={14} />
                </button>
              </footer>
            </div>
          </article>
        ))}
        <button
          className="mw-character-add"
          onClick={() => w.setModal("character")}
        >
          <Icon name="plus" size={32} />
          <h3>A new face, a new story.</h3>
          <p>Add a character reference</p>
        </button>
      </div>
      <div className="mw-resource-note">
        <Icon name="link" size={22} />
        <div>
          <h3>One character, every shot.</h3>
          <p>
            Character references and consistency settings are shared across your
            workspace. Your model receives them through the API adapter.
          </p>
        </div>
      </div>
    </div>
  );
}
export function LibraryPage() {
  const w = useWorkspace();
  const cards = [
    {
      title: "A Day in Paris",
      category: "Cinematic story",
      image: w.project.shots[0].image,
      description: "Golden light, quiet moments and a new beginning.",
    },
    {
      title: "Your project collection",
      category: "Project library",
      image: w.shot.image,
      description: "Save your current storyboard and continue anywhere.",
    },
  ];
  return (
    <div className="mw-resource-page">
      <header>
        <div>
          <span className="mw-eyebrow">MAKE ROOM FOR YOUR NEXT IDEA</span>
          <h1>Your creative library.</h1>
          <p>Project files, favorite references and a place to begin.</p>
        </div>
        <button className="mw-primary" onClick={() => w.setModal("project")}>
          <Icon name="plus" size={16} />
          Manage projects
        </button>
      </header>
      <div className="mw-library-grid">
        {cards.map((c) => (
          <article key={c.title}>
            <Photo media={c.image} />
            <div>
              <span className="mw-eyebrow">{c.category}</span>
              <h2>{c.title}</h2>
              <p>{c.description}</p>
              <button
                className="mw-text-button"
                onClick={() => {
                  if (c.category === "Cinematic story") {
                    w.setSection("create");
                    w.setView("canvas");
                  } else w.setModal("project");
                }}
              >
                {c.category === "Cinematic story"
                  ? "Open workspace"
                  : "Save / import project"}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
