import { productionCandidates } from "./native/candidates";
import { ProductionDialog, ServerDialog } from "./native/SceneStudio";
import { NativeViewport } from "./native/NativeViewport";
import {
  createScene,
  templateInfo,
  ensureNativeAssets,
  sceneThumbnail,
} from "./native/templates";
import type { SceneTemplate } from "./native/schema";
import { studioAI } from "./native/api";
import { useRef, useState } from "react";
import { useWorkspace } from "./context";
import {
  Modal,
  Field,
  NumberField,
  Photo,
  Icon,
  IconButton,
  Toggle,
  Badge,
  EmptyState,
} from "./Primitives";
import { duration, uid, demoProject, media } from "./demo";
import { API_BASE, connected, workspaceApi, downloadJson } from "./api";
import { hydrateMedia, validateProject } from "./persistence";
import { AssistantDialog } from "./editor/AssistantDialog";
export function Dialogs() {
  const w = useWorkspace(),
    close = () => w.setModal(null),
    projectJobs = w.jobs.filter((j) => j.projectId === w.project.id);
  switch (w.modal) {
    case "production":
      return <ProductionDialog />;
    case "assistant":
      return <ProductionDialog />;
    case "editing-assistant":
      return <AssistantDialog />;
    case "ai-settings":
      return <ServerDialog />;
    case "project":
      return <ProjectDialog />;
    case "share":
      return <ShareDialog />;
    case "export":
      return <ExportDialog />;
    case "audio":
      return <AudioDialog />;
    case "new-shot":
      return <NewShotDialog />;
    case "compare":
      return <CompareDialog />;
    case "character":
      return <CharacterDialog />;
    case "request":
      return (
        <Modal
          title="Request ready"
          subtitle="Review the payload for your API integration."
          onClose={close}
        >
          <div className="mw-integration-note">
            <Icon name="link" size={23} />
            <div>
              <strong>Frontend preview mode</strong>
              <p>
                No generation, repair or export task has been submitted. Your
                team can connect these actions through the API adapter.
              </p>
            </div>
          </div>
          <pre className="mw-payload">
            {JSON.stringify(w.pendingRequest, null, 2)}
          </pre>
          <div className="mw-dialog-actions">
            <button
              className="mw-secondary"
              onClick={() => {
                void navigator.clipboard
                  .writeText(JSON.stringify(w.pendingRequest, null, 2))
                  .then(() => w.notify("Request copied."))
                  .catch(() =>
                    w.notify("Use Download JSON to save this request."),
                  );
              }}
            >
              Copy payload
            </button>
            <button
              className="mw-primary"
              onClick={() =>
                downloadJson(w.pendingRequest, "mouva-request.json")
              }
            >
              <Icon name="download" size={15} />
              Download JSON
            </button>
          </div>
        </Modal>
      );
    case "connect":
      return (
        <Modal
          title="Connect your workspace"
          subtitle="Your frontend is ready for your services."
          onClose={close}
        >
          <div className="mw-integration-note">
            <Icon name="link" size={23} />
            <div>
              <strong>
                {connected ? "API connected" : "Frontend preview mode"}
              </strong>
              <p>
                {connected
                  ? API_BASE
                  : "All interface controls are available locally. Model calls and remote exports are waiting for your API."}
              </p>
            </div>
          </div>
          <ol className="mw-integration-steps">
            <li>
              <strong>Configure your API base URL</strong>
              <code>VITE_MOUVA_API_URL=https://your-api.example.com</code>
            </li>
            <li>
              <strong>Map your endpoints</strong>
              <code>src/frontend/api.ts</code>
            </li>
            <li>
              <strong>Use the shared request types</strong>
              <code>src/frontend/types.ts</code>
            </li>
          </ol>
          <p className="mw-help">
            Provider API keys stay on your server. This frontend uses your
            application session.
          </p>
          <button className="mw-primary full" onClick={close}>
            Got it
          </button>
        </Modal>
      );
    case "jobs":
      return (
        <Modal
          title="Generation activity"
          subtitle="Server tasks keep your source scene, motion reference and finished video together."
          onClose={close}
        >
          {projectJobs.length ? (
            <div className="mw-job-list">
              {projectJobs.map((j) => (
                <article key={j.id}>
                  <header>
                    <strong>
                      {j.kind === "export"
                        ? "Sequence export"
                        : j.kind === "repair"
                          ? "Repair candidate"
                          : j.mode === "scene"
                            ? "Editable 3D scene"
                            : j.mode === "reference"
                              ? "Motion preview"
                              : "Shot generation"}
                    </strong>
                    <Badge>{j.status}</Badge>
                  </header>
                  <small>
                    {w.project.shots.find((s) => s.id === j.shotId)?.title ||
                      j.id}
                  </small>
                  {j.plan && <p className="mw-job-plan">{j.plan.summary}</p>}
                  {!!j.events?.length && (
                    <details className="mw-job-events">
                      <summary>Production steps</summary>
                      <ol>
                        {j.events.map((event, i) => (
                          <li key={i}>{event.phase}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {j.progress !== undefined && (
                    <div className="mw-job-progress">
                      <i
                        style={{
                          width:
                            Math.round(
                              j.provider === "pipeline" ||
                                j.provider === "editor"
                                ? j.progress
                                : j.progress * 100,
                            ) + "%",
                        }}
                      />
                    </div>
                  )}
                  <p>
                    {j.error || j.phase || "Waiting for an API status update."}
                  </p>
                  {j.scene && (j.sourceReady || j.status === "succeeded") && (
                    <button
                      className="mw-secondary"
                      disabled={!w.project.shots.some((s) => s.id === j.shotId)}
                      onClick={() => {
                        if (!j.shotId) return;
                        w.update((p) => {
                          const s = p.shots.find((x) => x.id === j.shotId);
                          if (!s) return;
                          for (const take of productionCandidates(j, s))
                            if (!s.takes.some((t) => t.id === take.id))
                              s.takes.push(take);
                          const sourceId =
                            j.provider === "pipeline" && j.mode !== "scene"
                              ? j.id + "-source"
                              : j.id;
                          if (s.takes.some((t) => t.id === sourceId))
                            s.viewingTakeId = sourceId;
                        });
                        w.openScene(j.shotId);
                        w.setModal(null);
                      }}
                    >
                      Review editable 3D
                    </button>
                  )}
                  {j.referenceUrl && (
                    <a
                      className="mw-text-button"
                      href={j.referenceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Reference MP4
                    </a>
                  )}
                  {j.outputUrl && (
                    <a className="mw-secondary" href={j.outputUrl} download>
                      Open result
                    </a>
                  )}
                  {["queued", "running"].includes(j.status) && (
                    <button
                      className="mw-text-button"
                      onClick={() => {
                        void (
                          j.provider === "editor"
                            ? studioAI.cancelExport(j.id).then(w.addJob)
                            : j.provider === "pipeline"
                              ? studioAI.cancel(j.id).then(w.addJob)
                              : workspaceApi.cancelJob(j.id)
                        )
                          .then(() => w.notify("Cancellation requested."))
                          .catch((e) => w.notify(e.message));
                      }}
                    >
                      Cancel task
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="history"
              title="A little quiet before the action."
              description="No tasks submitted. When connected, your model and export jobs will appear here."
              action={
                <button
                  className="mw-secondary"
                  onClick={() => w.setModal("ai-settings")}
                >
                  Server connection
                </button>
              }
            />
          )}
        </Modal>
      );
    case "help":
      return (
        <Modal
          title="A workspace that moves with you."
          subtitle="Three views. One story. Always in sync."
          onClose={close}
        >
          <div className="mw-help-grid">
            {[
              [
                "stream",
                "Stream",
                "Shape your narrative, compare takes and direct each shot.",
              ],
              [
                "canvas",
                "Canvas",
                "Explore references, relationships and creative branches.",
              ],
              [
                "timeline",
                "Timeline",
                "Trim, reorder, mix audio and assemble your sequence.",
              ],
            ].map(([icon, title, text]) => (
              <div key={title}>
                <Icon name={icon} size={22} />
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
          <div className="mw-shortcuts">
            <span>
              Play / Pause <kbd>Space</kbd>
            </span>
            <span>
              Undo <kbd>Ctrl Z</kbd>
            </span>
            <span>
              Redo <kbd>Ctrl Shift Z</kbd>
            </span>
            <span>
              Close dialog <kbd>Esc</kbd>
            </span>
          </div>
          <p className="mw-help">
            Demo references come from your supplied design images. Imported
            assets and changes are saved in this browser.
          </p>
        </Modal>
      );
    default:
      return null;
  }
}
function ProjectDialog() {
  const w = useWorkspace(),
    input = useRef<HTMLInputElement>(null),
    [name, setName] = useState(w.project.name),
    [description, setDescription] = useState(w.project.description),
    [tags, setTags] = useState(w.project.tags.join(", "));
  return (
    <Modal
      title="Your project"
      subtitle="One story. All your creative decisions."
      onClose={() => w.setModal(null)}
    >
      <Field label="Project name">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Story brief">
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Tags">
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      <div className="mw-project-stats">
        <span>
          <b>{w.project.shots.length}</b>shots
        </span>
        <span>
          <b>{duration(w.project).toFixed(1)}s</b>sequence
        </span>
        <span>
          <b>{w.project.assets.length}</b>assets
        </span>
      </div>
      <div className="mw-dialog-actions">
        <button className="mw-secondary" onClick={() => input.current?.click()}>
          <Icon name="upload" size={15} />
          Import JSON
        </button>
        <button
          className="mw-secondary"
          onClick={() =>
            downloadJson(w.project, w.project.name + ".mouva.json")
          }
        >
          <Icon name="download" size={15} />
          Save JSON
        </button>
        <button
          className="mw-primary"
          disabled={!name.trim()}
          onClick={() => {
            w.update((p) => {
              p.name = name.trim();
              p.description = description;
              p.tags = tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
            }, "Edit project");
            w.setModal(null);
            w.notify("Project saved.");
          }}
        >
          Save changes
        </button>
      </div>
      <p className="mw-help">
        Project JSON contains your edit data. Imported media remains in this
        browser and should be uploaded through your asset API for sharing.
      </p>
      <input
        ref={input}
        hidden
        type="file"
        accept=".json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const data = JSON.parse(await file.text());
            validateProject(data);
            w.replaceProject(await hydrateMedia(data));
            w.setModal(null);
            w.notify("Project imported.");
          } catch (error: any) {
            w.notify(error.message);
          }
        }}
      />
    </Modal>
  );
}
function ShareDialog() {
  const w = useWorkspace(),
    [role, setRole] = useState<"viewer" | "editor">("viewer"),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Share your story"
      subtitle="Bring someone into your creative world."
      onClose={() => w.setModal(null)}
    >
      <div className="mw-share-project">
        <Photo media={w.project.shots[0].image} />
        <div>
          <h3>{w.project.name}</h3>
          <p>
            {w.project.shots.length} shots · {duration(w.project).toFixed(1)}{" "}
            seconds
          </p>
          <Badge>{connected ? "Connected workspace" : "Local workspace"}</Badge>
        </div>
      </div>
      <Field label="Link access">
        <select value={role} onChange={(e) => setRole(e.target.value as any)}>
          <option value="viewer">Can view and review</option>
          <option value="editor">Can edit this project</option>
        </select>
      </Field>
      {link && (
        <div className="mw-copy-link">
          <input readOnly aria-label="Share link" value={link} />
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => w.notify("Share link copied."))
                .catch(() => w.notify("Select and copy the link."))
            }
          >
            Copy
          </button>
        </div>
      )}
      <p className="mw-help">
        {connected
          ? "Your API creates a share link with the selected access level."
          : "Public sharing requires your API. You can save a project JSON now; no public link has been created."}
      </p>
      <div className="mw-dialog-actions">
        <button
          className="mw-secondary"
          onClick={() =>
            downloadJson(w.project, w.project.name + ".mouva.json")
          }
        >
          Save project JSON
        </button>
        <button
          className="mw-primary"
          disabled={busy}
          onClick={() => {
            if (!connected) {
              w.setModal("connect");
              return;
            }
            setBusy(true);
            void workspaceApi
              .share(w.project.id, role)
              .then((r) => setLink(r.url))
              .catch((e) => w.notify(e.message))
              .finally(() => setBusy(false));
          }}
        >
          <Icon name="link" size={16} />
          {busy ? "Creating…" : "Create share link"}
        </button>
      </div>
    </Modal>
  );
}
function ExportDialog() {
  const w = useWorkspace(),
    [format, setFormat] = useState("mp4"),
    [resolution, setResolution] = useState("1080p"),
    [fps, setFps] = useState(24),
    [aspectRatio, setAspect] = useState("16:9"),
    [includeAudio, setAudio] = useState(true),
    [includeSubtitles, setSubtitles] = useState(true),
    [submitting, setSubmitting] = useState(false);
  return (
    <Modal
      title="Make it a movie."
      subtitle="Your story, ready for its next screen."
      onClose={() => w.setModal(null)}
    >
      <div className="mw-export-preview">
        <Photo media={w.shot.image} />
        <div>
          <Icon name="video" size={20} />
          {w.project.name}
          <small>
            {duration(w.project).toFixed(1)}s · {w.project.shots.length} shots
          </small>
        </div>
      </div>
      <div className="mw-form-grid">
        <Field label="Format">
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="mp4">MP4 · H.264</option>
            <option value="webm">WebM · VP9</option>
          </select>
        </Field>
        <Field label="Resolution">
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          >
            {["720p", "1080p", "4K"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Frame rate">
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
            {[24, 25, 30, 60].map((x) => (
              <option key={x} value={x}>
                {x} fps
              </option>
            ))}
          </select>
        </Field>
        <Field label="Aspect ratio">
          <select
            value={aspectRatio}
            onChange={(e) => setAspect(e.target.value)}
          >
            {["16:9", "9:16", "1:1"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
      </div>
      <Toggle
        checked={includeAudio}
        onChange={setAudio}
        label="Include audio tracks"
      />
      <Toggle
        checked={includeSubtitles}
        onChange={setSubtitles}
        label="Include text & subtitles"
      />
      <p className="mw-help">
        {connected
          ? "Your API will render a frozen snapshot of this sequence."
          : "Render a movie locally from the current sequence, including clip edits, titles and imported audio. Demo audio tracks are silent."}
      </p>
      <button
        className="mw-dark full"
        disabled={submitting}
        onClick={async () => {
          setSubmitting(true);
          try {
            await w.request("export", {
              format,
              resolution,
              fps,
              aspectRatio,
              includeAudio,
              includeSubtitles,
            });
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Icon name="download" size={17} />
        {submitting ? "Preparing export…" : "Export video"}
      </button>
    </Modal>
  );
}
function AudioDialog() {
  const w = useWorkspace(),
    a =
      w.project.audio.find((x) => x.id === w.selectedAudio) ||
      w.project.audio[0],
    input = useRef<HTMLInputElement>(null),
    sourceDuration = w.project.assets.find(
      (x) => x.id === a?.assetId,
    )?.duration,
    set = (patch: any) =>
      a && w.execute([{ tool: "audio.update", targetId: a.id, args: patch }]);
  return (
    <Modal
      title="Sound gives your story a pulse."
      subtitle="Voice, music and all the little details."
      onClose={() => w.setModal(null)}
      wide
    >
      <div className="mw-audio-dialog">
        <nav>
          {w.project.audio.map((c) => (
            <button
              key={c.id}
              className={c.id === a?.id ? "active" : ""}
              onClick={() => w.setSelectedAudio(c.id)}
            >
              <Icon name="music" size={18} />
              <span>
                {c.name}
                <small>
                  {c.kind} {c.demo ? "· demo reference" : ""}
                </small>
              </span>
            </button>
          ))}
          <button className="mw-dashed" onClick={() => input.current?.click()}>
            ＋ Import audio
          </button>
        </nav>
        {a ? (
          <section>
            <h3>{a.name}</h3>
            {a.demo && (
              <p className="mw-help">
                Illustrative reference track. Import an audio file to hear it in
                your sequence.
              </p>
            )}
            <Field label="Track type">
              <select
                value={a.kind}
                onChange={(e) => set({ kind: e.target.value })}
              >
                <option value="voice">Voice</option>
                <option value="music">Music</option>
                <option value="sfx">Sound effects</option>
              </select>
            </Field>
            <div className="mw-form-grid">
              <NumberField
                label="Sequence start (s)"
                value={a.start}
                min={0}
                max={Math.max(0, duration(w.project) - 0.01)}
                onChange={(start) => set({ start })}
              />
              <NumberField
                label="Duration (s)"
                value={a.duration}
                min={0.01}
                max={
                  sourceDuration
                    ? Math.max(0.01, sourceDuration - (a.sourceStart ?? 0))
                    : 3600
                }
                onChange={(duration) => {
                  const fadeIn = Math.min(a.fadeIn, duration);
                  set({
                    duration,
                    fadeIn,
                    fadeOut: Math.min(a.fadeOut, duration - fadeIn),
                  });
                }}
              />
              <NumberField
                label="Source in (s)"
                value={a.sourceStart ?? 0}
                min={0}
                max={sourceDuration ? Math.max(0, sourceDuration - 0.01) : 3600}
                onChange={(sourceStart) => {
                  const length = sourceDuration
                    ? Math.min(a.duration, sourceDuration - sourceStart)
                    : a.duration;
                  set({
                    sourceStart,
                    duration: length,
                    fadeIn: Math.min(a.fadeIn, length),
                    fadeOut: Math.min(a.fadeOut, length),
                  });
                }}
              />
              <NumberField
                label="Volume"
                value={a.gain}
                min={0}
                max={1}
                onChange={(gain) => set({ gain })}
              />
              <NumberField
                label="Pan"
                value={a.pan}
                min={-1}
                max={1}
                step={0.1}
                onChange={(pan) => set({ pan })}
              />
              <NumberField
                label="Fade in (s)"
                value={a.fadeIn}
                min={0}
                max={a.duration - a.fadeOut}
                onChange={(fadeIn) => set({ fadeIn })}
              />
              <NumberField
                label="Fade out (s)"
                value={a.fadeOut}
                min={0}
                max={a.duration - a.fadeIn}
                onChange={(fadeOut) => set({ fadeOut })}
              />
            </div>
            <div className="mw-audio-toggles">
              <Toggle
                label="Mute"
                checked={a.muted}
                onChange={(muted) => set({ muted })}
              />
              <Toggle
                label="Solo"
                checked={a.solo}
                onChange={(solo) => set({ solo })}
              />
            </div>
            <button
              className="mw-text-button danger"
              onClick={() =>
                w.execute([{ tool: "audio.remove", targetId: a.id }])
              }
            >
              <Icon name="trash" size={15} />
              Remove from sequence
            </button>
          </section>
        ) : (
          <EmptyState
            icon="music"
            title="Find your sound."
            description="Import an audio file to create a track."
          />
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void w.upload(e.target.files);
          e.target.value = "";
        }}
      />
    </Modal>
  );
}
function NewShotDialog() {
  const w = useWorkspace(),
    [title, setTitle] = useState("A new moment"),
    [prompt, setPrompt] = useState(""),
    [seconds, setSeconds] = useState(5),
    [source, setSource] = useState<"video" | SceneTemplate>("video");
  return (
    <Modal
      title="Every shot has a story."
      subtitle="Add the next moment to your sequence."
      onClose={() => w.setModal(null)}
    >
      <div className="mw-new-shot-types">
        <button
          className={source === "video" ? "selected" : ""}
          onClick={() => setSource("video")}
        >
          <Icon name="video" size={20} />
          <strong>Video shot</strong>
          <small>Reference-led storytelling</small>
        </button>
        {templateInfo.map((t) => (
          <button
            key={t.id}
            className={source === t.id ? "selected" : ""}
            onClick={() => {
              setSource(t.id);
              setSeconds(6);
            }}
          >
            <Icon name={t.icon} size={20} />
            <strong>{t.name}</strong>
            <small>Editable 3D + AI finish</small>
          </button>
        ))}
      </div>
      <Field label="Shot name">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="What happens in this shot?">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Describe a scene, a feeling, a small detail…"
        />
      </Field>
      <NumberField
        label="Shot duration (seconds)"
        value={seconds}
        min={source === "video" ? 1 : 4}
        max={source === "video" ? 120 : 30}
        step={source === "video" ? 0.1 : 1}
        onChange={setSeconds}
      />
      <button
        className="mw-primary full"
        disabled={!title.trim()}
        onClick={() => {
          const shot = structuredClone(w.shot);
          shot.id = uid();
          shot.title = title.trim();
          shot.description = prompt || "A new moment in your story";
          shot.prompt = prompt;
          shot.duration = seconds;
          shot.trimStart = 0;
          shot.trimEnd = seconds;
          shot.speed = 1;
          shot.status = "idle";
          shot.referenceAssetIds = [];
          delete shot.edit;
          shot.image = {
            url:
              "data:image/svg+xml," +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#eeecf6"/><path d="M285 135h70v65h-70zM285 180l20-20 22 22 12-12 16 18" fill="none" stroke="#b1a8c8" stroke-width="3"/><text x="320" y="236" text-anchor="middle" fill="#8d82a5" font-family="sans-serif" font-size="16">Upload media or generate a shot</text></svg>',
              ),
          };
          const id = uid();
          shot.takes = [
            {
              id,
              label: "Reference",
              image: shot.image,
              status: "succeeded",
              createdAt: new Date().toISOString(),
            },
          ];
          shot.adoptedTakeId = id;
          shot.viewingTakeId = id;
          shot.repair = {
            start: 0,
            end: Math.min(1, seconds),
            tool: "range",
            prompt: "",
          };
          shot.layers = [];
          delete shot.nativeDraft;
          shot.kind = source === "video" ? "video" : "hybrid";
          shot.model = "Seedance 2.5";
          if (source !== "video") {
            const scene = createScene(
              source,
              Math.max(4, Math.min(30, Math.round(seconds))),
            );
            shot.duration = scene.duration;
            shot.trimEnd = scene.duration;
            shot.image = sceneThumbnail(scene);
            shot.takes[0] = {
              ...shot.takes[0],
              label: "Editable source",
              image: shot.image,
              scene,
            };
          }
          w.update((p) => {
            if (source !== "video") ensureNativeAssets(p);
            p.shots.push(shot);
          }, "Add shot");
          if (source !== "video") w.openScene(shot.id);
          else w.select(shot.id);
          w.setModal(null);
          w.notify(
            source === "video"
              ? "Shot added. Set a reference and make it yours."
              : "Editable scene ready. Shape the shot, then create its video.",
          );
        }}
      >
        <Icon name="plus" size={16} />
        Add to story
      </button>
    </Modal>
  );
}
function CompareDialog() {
  const w = useWorkspace(),
    s = w.shot,
    [right, setRight] = useState(s.viewingTakeId),
    a = s.takes.find((t) => t.id === s.adoptedTakeId) || s.takes[0],
    b = s.takes.find((t) => t.id === right) || s.takes.at(-1)!;
  return (
    <Modal
      title="A little perspective."
      subtitle={"Compare takes · " + s.title}
      onClose={() => w.setModal(null)}
      wide
    >
      <div className="mw-compare">
        <section>
          <header>
            <strong>{a.label}</strong>
            <Badge tone="green">In sequence</Badge>
          </header>
          {a.videoUrl ? (
            <video key={a.id} src={a.videoUrl} controls playsInline />
          ) : a.scene ? (
            <NativeViewport
              scene={a.scene}
              assets={w.project.assets}
              time={Math.min(3, a.scene.duration)}
            />
          ) : (
            <Photo media={a.image} />
          )}
        </section>
        <section>
          <header>
            <select
              aria-label="Compare candidate"
              value={b.id}
              onChange={(e) => setRight(e.target.value)}
            >
              {s.takes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <Badge>Candidate</Badge>
          </header>
          {b.videoUrl ? (
            <video key={b.id} src={b.videoUrl} controls playsInline />
          ) : b.scene ? (
            <NativeViewport
              scene={b.scene}
              assets={w.project.assets}
              time={Math.min(3, b.scene.duration)}
            />
          ) : (
            <Photo media={b.image} />
          )}
        </section>
      </div>
      <p className="mw-help">
        Review the editable source or finished video before adopting a take. The
        adopted take is used in your sequence.
      </p>
      <div className="mw-dialog-actions">
        <button
          className="mw-secondary"
          onClick={() => {
            w.updateShot({ viewingTakeId: b.id });
            w.setModal(null);
          }}
        >
          Preview this take
        </button>
        <button
          className="mw-primary"
          disabled={a.id === b.id}
          onClick={() => {
            if (
              w.execute([
                { tool: "take.adopt", targetId: s.id, args: { takeId: b.id } },
              ])
            ) {
              w.setModal(null);
              w.notify("Take adopted. Undo is available.");
            }
          }}
        >
          Use in sequence <Icon name="check" size={15} />
        </button>
      </div>
    </Modal>
  );
}
function CharacterDialog() {
  const w = useWorkspace(),
    [name, setName] = useState(""),
    [role, setRole] = useState("Supporting character"),
    [description, setDescription] = useState(""),
    [assetId, setAsset] = useState("reference-5"),
    images = w.project.assets.filter((a) => a.kind === "image" && a.image);
  return (
    <Modal
      title="Meet your next character."
      subtitle="A consistent reference starts here."
      onClose={() => w.setModal(null)}
    >
      <Field label="Character name">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Role">
        <input value={role} onChange={(e) => setRole(e.target.value)} />
      </Field>
      <Field label="Character description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Reference image">
        <select value={assetId} onChange={(e) => setAsset(e.target.value)}>
          {images.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <button
        className="mw-primary full"
        disabled={!name.trim()}
        onClick={() => {
          w.update(
            (p) =>
              p.characters.push({
                id: uid(),
                name: name.trim(),
                role,
                description,
                image:
                  images.find((a) => a.id === assetId)?.image || media.lily,
                strength: 0.8,
              }),
            "Add character",
          );
          w.setModal(null);
          w.notify("Character added.");
        }}
      >
        Create character
      </button>
    </Modal>
  );
}
