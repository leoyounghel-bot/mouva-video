import { useRef } from "react";
import { useWorkspace } from "./context";
import { Icon, IconButton, Photo } from "./Primitives";
import { shotLength } from "./demo";
import { signOut, usesMouvaLogin } from "./auth/session";
export function Sidebar() {
  const w = useWorkspace(),
    p = w.project,
    input = useRef<HTMLInputElement>(null);
  return (
    <aside className={"mw-sidebar " + (w.sidebarOpen ? "open" : "")}>
      <div className="mw-sidebar-scroll">
        <section className="mw-project-card">
          <header>
            <strong>Project</strong>
            <IconButton
              icon="more"
              label="Edit project"
              onClick={() => w.setModal("project")}
            />
          </header>
          <button
            className="mw-project-description"
            onClick={() => w.setModal("project")}
          >
            {p.description || "Describe your story"}
            <Icon name="text" size={14} />
          </button>
          <div className="mw-tags">
            {p.tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </section>
        <div className="mw-section-label">
          <strong>Shots ({p.shots.length})</strong>
          <IconButton
            icon="plus"
            label="Add scene"
            onClick={() => w.setModal("new-shot")}
          />
        </div>
        <div className="mw-shot-list">
          {p.shots.map((s, i) => (
            <div
              key={s.id}
              className={
                "mw-shot-item " + (w.selected === s.id ? "selected" : "")
              }
              draggable
              onDragStart={(e) => e.dataTransfer.setData("mouva/shot", s.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("mouva/shot");
                if (id && id !== s.id)
                  w.execute([
                    { tool: "clip.move", targetId: id, args: { index: i } },
                  ]);
              }}
            >
              <button className="mw-shot-select" onClick={() => w.select(s.id)}>
                <span className="mw-shot-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Photo media={s.image} label={s.title} />
                <span className="mw-shot-copy">
                  <strong>{s.title}</strong>
                  <span>{s.description}</span>
                  <small>
                    {shotLength(s).toFixed(1)}s{" "}
                    {s.speed !== 1 ? "· " + s.speed + "×" : ""}
                  </small>
                </span>
              </button>
              <button
                className="mw-shot-more"
                aria-label={"Edit " + s.title}
                onClick={() => {
                  w.select(s.id);
                  w.setView("timeline");
                  w.setSceneOpen(false);
                  w.setInspectorTab("edit");
                  w.setInspectorOpen(true);
                }}
              >
                <Icon name="sliders" size={15} />
              </button>
            </div>
          ))}
        </div>
        <button className="mw-dashed" onClick={() => w.setModal("new-shot")}>
          <Icon name="plus" size={15} />
          Add shot
        </button>
        <div className="mw-section-label">
          <strong>Media</strong>
          <IconButton
            icon="upload"
            label="Import media"
            onClick={() => input.current?.click()}
          />
        </div>
        <button
          className="mw-secondary full"
          onClick={() => w.setSection("assets")}
        >
          <Icon name="image" size={16} />
          {p.assets.length} assets in this project
        </button>
        {p.characters.length > 0 && (
          <>
            <div className="mw-section-label">
              <strong>Characters</strong>
              <IconButton
                icon="plus"
                label="Manage characters"
                onClick={() => w.setSection("characters")}
              />
            </div>
            {p.characters.map((c) => (
              <button
                className="mw-character-card"
                key={c.id}
                onClick={() => {
                  w.execute([
                    {
                      tool: "clip.update",
                      targetId: w.shot.id,
                      args: { characterId: c.id },
                    },
                  ]);
                  w.setInspectorTab("reference");
                }}
              >
                <Photo media={c.image} />
                <span>
                  <strong>{c.name}</strong>
                  <small>{c.role}</small>
                </span>
                <Icon name="chevron" size={15} />
              </button>
            ))}
          </>
        )}
      </div>
      <section className="mw-story-prompt mw-assistant-entry">
        <span className="mw-tool-badge">MOUVA AI</span>
        <h3>Direct your next shot</h3>
        <p>
          Describe it. Shape an editable 3D scene. Bring its motion to video.
        </p>
        <button className="mw-primary full" onClick={() => w.openDirector()}>
          <Icon name="spark" size={17} />
          Open AI director
        </button>
        {usesMouvaLogin && <div className="mv-account"><span>Mouva account</span><button onClick={() => void signOut().catch(error => w.notify(error.message))}>Sign out</button></div>}
      </section>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/*,video/*,audio/*,.glb"
        onChange={(e) => {
          if (e.target.files) void w.upload(e.target.files);
          e.target.value = "";
        }}
      />
    </aside>
  );
}
