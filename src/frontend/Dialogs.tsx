import { t as tr, text } from "./i18n";
import { useLearning } from "./learning/LearningContext";
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
import { ImageDialog } from "./ImageDialog";
import { TakesDialog } from "./TakesDialog";
import { NewProjectDialog, SavedProjectList } from "./ProjectDialogs";
export function Dialogs() {
  const learning = useLearning();
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
    case "new-project":
      return <NewProjectDialog />;
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
    case "images":
      return <ImageDialog key={w.project.id + ":" + w.imageTarget} />;
    case "takes":
      return <TakesDialog key={w.shot.id} />;
    case "character":
      return <CharacterDialog />;
    case "request":
      return (
        <Modal
          title={tr("Request ready")}
          subtitle={tr("Review the payload for your API integration.")}
          onClose={close}
        >
          <div className="mw-integration-note">
            <Icon name="link" size={23} />
            <div>
              <strong>{tr("Frontend preview mode")}</strong>
              <p>
                {tr(
                  "No generation, repair or export task has been submitted. Your team can connect these actions through the API adapter.",
                )}
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
              {tr("Copy payload")}
            </button>
            <button
              className="mw-primary"
              onClick={() =>
                downloadJson(w.pendingRequest, "mouva-request.json")
              }
            >
              <Icon name="download" size={15} />
              {tr("Download JSON")}
            </button>
          </div>
        </Modal>
      );
    case "connect":
      return (
        <Modal
          title={tr("Connect your workspace")}
          subtitle={tr("Your frontend is ready for your services.")}
          onClose={close}
        >
          <div className="mw-integration-note">
            <Icon name="link" size={23} />
            <div>
              <strong>
                {tr(connected ? "API connected" : "Frontend preview mode")}
              </strong>
              <p>
                {tr(
                  connected
                    ? API_BASE
                    : "All interface controls are available locally. Model calls and remote exports are waiting for your API.",
                )}
              </p>
            </div>
          </div>
          <ol className="mw-integration-steps">
            <li>
              <strong>{tr("Configure your API base URL")}</strong>
              <code>
                {tr("VITE_MOUVA_API_URL=https://your-api.example.com")}
              </code>
            </li>
            <li>
              <strong>{tr("Map your endpoints")}</strong>
              <code>{tr("src/frontend/api.ts")}</code>
            </li>
            <li>
              <strong>{tr("Use the shared request types")}</strong>
              <code>{tr("src/frontend/types.ts")}</code>
            </li>
          </ol>
          <p className="mw-help">
            {tr(
              "Provider API keys stay on your server. This frontend uses your application session.",
            )}
          </p>
          <button className="mw-primary full" onClick={close}>
            {tr("Got it")}
          </button>
        </Modal>
      );
    case "jobs":
      return (
        <Modal
          title={tr("Generation activity")}
          subtitle={tr(
            "Server tasks keep your source scene, motion reference and finished video together.",
          )}
          onClose={close}
        >
          {projectJobs.length ? (
            <div className="mw-job-list">
              {projectJobs.map((j) => (
                <article key={j.id}>
                  <header>
                    <strong>
                      {tr(
                        j.kind === "export"
                          ? "Sequence export"
                          : j.kind === "repair"
                            ? "Repair candidate"
                            : j.mode === "scene"
                              ? "Editable 3D scene"
                              : j.mode === "reference"
                                ? "Motion preview"
                                : "Shot generation",
                      )}
                    </strong>
                    <Badge>{tr(j.status)}</Badge>
                  </header>
                  <small>
                    {tr(
                      w.project.shots.find((s) => s.id === j.shotId)?.title ||
                        j.id,
                    )}
                  </small>
                  {j.plan && (
                    <p className="mw-job-plan">{tr(j.plan.summary)}</p>
                  )}
                  {!!j.events?.length && (
                    <details className="mw-job-events">
                      <summary>{tr("Production steps")}</summary>
                      <ol>
                        {j.events.map((event, i) => (
                          <li key={i}>{tr(event.phase)}</li>
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
                    {tr(
                      j.error || j.phase || "Waiting for an API status update.",
                    )}
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
                      {tr("Review editable 3D")}
                    </button>
                  )}
                  {j.referenceUrl && (
                    <a
                      className="mw-text-button"
                      href={j.referenceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tr("Reference MP4")}
                    </a>
                  )}
                  {j.outputUrl && (
                    <a className="mw-secondary" href={j.outputUrl} download>
                      {tr("Open result")}
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
                      {tr("Cancel task")}
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="history"
              title={tr("A little quiet before the action.")}
              description={tr(
                "No tasks submitted. When connected, your model and export jobs will appear here.",
              )}
              action={
                <button
                  className="mw-secondary"
                  onClick={() => w.setModal("ai-settings")}
                >
                  {tr("Server connection")}
                </button>
              }
            />
          )}
        </Modal>
      );
    case "help":
      return (
        <Modal
          title={tr("A workspace that moves with you.")}
          subtitle={tr("Three views. One story. Always in sync.")}
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
                <h3>{tr(title)}</h3>
                <p>{tr(text)}</p>
              </div>
            ))}
          </div>
          <div className="mw-shortcuts">
            <span>
              {tr("Play / Pause")}
              <kbd>{tr("Space")}</kbd>
            </span>
            <span>
              {tr("Undo")}
              <kbd>{tr("Ctrl Z")}</kbd>
            </span>
            <span>
              {tr("Redo")}
              <kbd>{tr("Ctrl Shift Z")}</kbd>
            </span>
            <span>
              {tr("Close dialog")}
              <kbd>{tr("Esc")}</kbd>
            </span>
          </div>
          <button className="mw-primary full" onClick={learning.showCenter}>
            <Icon name="book" size={17} />
            {text("打开学习中心", "Open learning center")}
          </button>
          <p className="mw-help">
            {tr(
              "Demo references come from your supplied design images. Imported assets and changes are saved in this browser.",
            )}
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
      title={tr("Your project")}
      subtitle={tr("One story. All your creative decisions.")}
      onClose={() => w.setModal(null)}
    >
      <SavedProjectList />
      <Field label={tr("Project name")}>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={tr("Story brief")}>
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label={tr("Tags")}>
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      <div className="mw-project-stats">
        <span>
          <b>{tr(w.project.shots.length)}</b>
          {tr("shots")}
        </span>
        <span>
          <b>
            {duration(w.project).toFixed(1)}
            {tr("s")}
          </b>
          {tr("sequence")}
        </span>
        <span>
          <b>{tr(w.project.assets.length)}</b>
          {tr("assets")}
        </span>
      </div>
      <div className="mw-dialog-actions">
        <button className="mw-secondary" onClick={() => input.current?.click()}>
          <Icon name="upload" size={15} />
          {tr("Import JSON")}
        </button>
        <button
          className="mw-secondary"
          onClick={() =>
            downloadJson(w.project, w.project.name + ".mouva.json")
          }
        >
          <Icon name="download" size={15} />
          {tr("Save JSON")}
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
          {tr("Save changes")}
        </button>
      </div>
      <p className="mw-help">
        {tr(
          "Project JSON contains your edit data. Imported media remains in this browser and should be uploaded through your asset API for sharing.",
        )}
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
            await w.switchProject(await hydrateMedia(data));
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
      title={tr("Share your story")}
      subtitle={tr("Bring someone into your creative world.")}
      onClose={() => w.setModal(null)}
    >
      <div className="mw-share-project">
        <Photo media={w.project.shots[0].image} />
        <div>
          <h3>{w.project.name}</h3>
          <p>
            {tr(w.project.shots.length)}
            {tr("shots ·")}
            {duration(w.project).toFixed(1)}
            {tr(" ")}
            {tr("seconds")}
          </p>
          <Badge>
            {tr(connected ? "Connected workspace" : "Local workspace")}
          </Badge>
        </div>
      </div>
      <Field label={tr("Link access")}>
        <select value={role} onChange={(e) => setRole(e.target.value as any)}>
          <option value="viewer">{tr("Can view and review")}</option>
          <option value="editor">{tr("Can edit this project")}</option>
        </select>
      </Field>
      {link && (
        <div className="mw-copy-link">
          <input readOnly aria-label={tr("Share link")} value={link} />
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => w.notify("Share link copied."))
                .catch(() => w.notify("Select and copy the link."))
            }
          >
            {tr("Copy")}
          </button>
        </div>
      )}
      <p className="mw-help">
        {tr(
          connected
            ? "Your API creates a share link with the selected access level."
            : "Public sharing requires your API. You can save a project JSON now; no public link has been created.",
        )}
      </p>
      <div className="mw-dialog-actions">
        <button
          className="mw-secondary"
          onClick={() =>
            downloadJson(w.project, w.project.name + ".mouva.json")
          }
        >
          {tr("Save project JSON")}
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
          {tr(busy ? "Creating…" : "Create share link")}
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
      title={tr("Make it a movie.")}
      subtitle={tr("Your story, ready for its next screen.")}
      onClose={() => w.setModal(null)}
    >
      <div className="mw-export-preview">
        <Photo media={w.shot.image} />
        <div>
          <Icon name="video" size={20} />
          {w.project.name}
          <small>
            {duration(w.project).toFixed(1)}
            {tr("s ·")}
            {tr(w.project.shots.length)}
            {tr("shots")}
          </small>
        </div>
      </div>
      <div className="mw-form-grid">
        <Field label={tr("Format")}>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="mp4">{tr("MP4 · H.264")}</option>
            <option value="webm">{tr("WebM · VP9")}</option>
          </select>
        </Field>
        <Field label={tr("Resolution")}>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          >
            {["720p", "1080p", "4K"].map((x) => (
              <option key={x}>{tr(x)}</option>
            ))}
          </select>
        </Field>
        <Field label={tr("Frame rate")}>
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
            {[24, 25, 30, 60].map((x) => (
              <option key={x} value={x}>
                {tr(x)}
                {tr("fps")}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr("Aspect ratio")}>
          <select
            value={aspectRatio}
            onChange={(e) => setAspect(e.target.value)}
          >
            {["16:9", "9:16", "1:1"].map((x) => (
              <option key={x}>{tr(x)}</option>
            ))}
          </select>
        </Field>
      </div>
      <Toggle
        checked={includeAudio}
        onChange={setAudio}
        label={tr("Include audio tracks")}
      />
      <Toggle
        checked={includeSubtitles}
        onChange={setSubtitles}
        label={tr("Include text & subtitles")}
      />
      <p className="mw-help">
        {tr(
          connected
            ? "Your API will render a frozen snapshot of this sequence."
            : "Render a movie locally from the current sequence, including clip edits, titles and imported audio. Demo audio tracks are silent.",
        )}
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
        {tr(submitting ? "Preparing export…" : "Export video")}
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
      title={tr("Sound gives your story a pulse.")}
      subtitle={tr("Voice, music and all the little details.")}
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
                  {tr(c.kind)} {tr(c.demo ? "· demo reference" : "")}
                </small>
              </span>
            </button>
          ))}
          <button className="mw-dashed" onClick={() => input.current?.click()}>
            {tr("＋ Import audio")}
          </button>
        </nav>
        {a ? (
          <section>
            <h3>{a.name}</h3>
            {a.demo && (
              <p className="mw-help">
                {tr(
                  "Illustrative reference track. Import an audio file to hear it in your sequence.",
                )}
              </p>
            )}
            <Field label={tr("Track type")}>
              <select
                value={a.kind}
                onChange={(e) => set({ kind: e.target.value })}
              >
                <option value="voice">{tr("Voice")}</option>
                <option value="music">{tr("Music")}</option>
                <option value="sfx">{tr("Sound effects")}</option>
              </select>
            </Field>
            <div className="mw-form-grid">
              <NumberField
                label={tr("Sequence start (s)")}
                value={a.start}
                min={0}
                max={Math.max(0, duration(w.project) - 0.01)}
                onChange={(start) => set({ start })}
              />
              <NumberField
                label={tr("Duration (s)")}
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
                label={tr("Source in (s)")}
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
                label={tr("Volume")}
                value={a.gain}
                min={0}
                max={1}
                onChange={(gain) => set({ gain })}
              />
              <NumberField
                label={tr("Pan")}
                value={a.pan}
                min={-1}
                max={1}
                step={0.1}
                onChange={(pan) => set({ pan })}
              />
              <NumberField
                label={tr("Fade in (s)")}
                value={a.fadeIn}
                min={0}
                max={a.duration - a.fadeOut}
                onChange={(fadeIn) => set({ fadeIn })}
              />
              <NumberField
                label={tr("Fade out (s)")}
                value={a.fadeOut}
                min={0}
                max={a.duration - a.fadeIn}
                onChange={(fadeOut) => set({ fadeOut })}
              />
            </div>
            <div className="mw-audio-toggles">
              <Toggle
                label={tr("Mute")}
                checked={a.muted}
                onChange={(muted) => set({ muted })}
              />
              <Toggle
                label={tr("Solo")}
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
              {tr("Remove from sequence")}
            </button>
          </section>
        ) : (
          <EmptyState
            icon="music"
            title={tr("Find your sound.")}
            description={tr("Import an audio file to create a track.")}
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
          if (e.target.files)
            void w.upload(e.target.files, undefined, a?.kind || "music");
          e.target.value = "";
        }}
      />
    </Modal>
  );
}
function NewShotDialog() {
  const w = useWorkspace(),
    [title, setTitle] = useState(tr("A new moment")),
    [prompt, setPrompt] = useState(""),
    [seconds, setSeconds] = useState(5),
    [source, setSource] = useState<"video" | SceneTemplate>("video");
  return (
    <Modal
      title={tr("Every shot has a story.")}
      subtitle={tr("Add the next moment to your sequence.")}
      onClose={() => w.setModal(null)}
    >
      <div className="mw-new-shot-types">
        <button
          className={source === "video" ? "selected" : ""}
          onClick={() => setSource("video")}
        >
          <Icon name="video" size={20} />
          <strong>{tr("Video shot")}</strong>
          <small>{tr("Reference-led storytelling")}</small>
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
            <strong>{tr(t.name)}</strong>
            <small>{tr("Editable 3D + AI finish")}</small>
          </button>
        ))}
      </div>
      <Field label={tr("Shot name")}>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label={tr("What happens in this shot?")}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder={tr("Describe a scene, a feeling, a small detail…")}
        />
      </Field>
      <NumberField
        label={tr("Shot duration (seconds)")}
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
        {tr("Add to story")}
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
      title={tr("A little perspective.")}
      subtitle={tr("Compare takes · ") + s.title}
      onClose={() => w.setModal(null)}
      wide
    >
      <div className="mw-compare">
        <section>
          <header>
            <strong>{tr(a.label)}</strong>
            <Badge tone="green">{tr("In sequence")}</Badge>
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
              aria-label={tr("Compare candidate")}
              value={b.id}
              onChange={(e) => setRight(e.target.value)}
            >
              {s.takes.map((t) => (
                <option key={t.id} value={t.id}>
                  {tr(t.label)}
                </option>
              ))}
            </select>
            <Badge>{tr("Candidate")}</Badge>
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
        {tr(
          "Review the editable source or finished video before adopting a take. The adopted take is used in your sequence.",
        )}
      </p>
      <div className="mw-dialog-actions">
        <button
          className="mw-secondary"
          onClick={() => {
            w.updateShot({ viewingTakeId: b.id });
            w.setModal(null);
          }}
        >
          {tr("Preview this take")}
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
          {tr("Use in sequence")}
          <Icon name="check" size={15} />
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
      title={tr("Meet your next character.")}
      subtitle={tr("A consistent reference starts here.")}
      onClose={() => w.setModal(null)}
    >
      <Field label={tr("Character name")}>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={tr("Role")}>
        <input value={role} onChange={(e) => setRole(e.target.value)} />
      </Field>
      <Field label={tr("Character description")}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label={tr("Reference image")}>
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
        {tr("Create character")}
      </button>
    </Modal>
  );
}
