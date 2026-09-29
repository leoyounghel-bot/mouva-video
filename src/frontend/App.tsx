import { validateCanvas } from "./canvas/validation";
import { attachShotAssets } from "./editor/shotMedia";
import { productionCandidates } from "./native/candidates";
import type { DirectorIntent } from "./context";
import { useEffect, useRef, useState } from "react";
import type { Project, Shot, View, Section, RemoteJob, Asset } from "./types";
import { WorkspaceContext } from "./context";
import type { ModalKind } from "./context";
import { uid, duration, locate, shotLength } from "./demo";
import {
  initialProject,
  persistProject,
  hydrateMedia,
  mergeRestoredMedia,
  storeFile,
  audioPeaks,
} from "./persistence";
import { connected, workspaceApi } from "./api";
import { Icon, IconButton } from "./Primitives";
import { Sidebar } from "./Sidebar";
import { CreativeGraph } from "./CreativeGraph";
import { TimelineView } from "./Timeline";
import { Inspector } from "./Inspector";
import { StreamView, AssetsPage, CharactersPage, LibraryPage } from "./Pages";
import { Dialogs } from "./Dialogs";
import "./styles.css";
import "./native/native.css";
import { SceneStudio, NativeInspector } from "./native/SceneStudio";
import { workingScene } from "./native/templates";
import { studioAI } from "./native/api";
import {
  runCommands,
  projectTools,
  toolCatalog,
  type EditCommand,
} from "./editor/commands";
import "./editor/editor.css";
import "./canvas.css";
import { exportSequence } from "./editor/export";
import { inspectVideo } from "./editor/media";
import { useSequenceAudio } from "./editor/useSequenceAudio";
import { workspaceKey } from "./auth/session";
const sessionKey = () => workspaceKey("mouva-ui-session-v1");
function savedSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey()) || "{}");
  } catch {
    return {};
  }
}
export function App() {
  const session = useRef(savedSession()).current,
    [project, setProject] = useState<Project>(initialProject),
    projectRef = useRef(project);
  projectRef.current = project;
  const [selected, setSelected] = useState(session.selected || "shot-3"),
    [view, setView] = useState<View>(() => {
      const q = new URLSearchParams(location.search).get("view");
      return (
        ["stream", "canvas", "timeline"].includes(q || "")
          ? q
          : ["stream", "canvas", "timeline"].includes(session.view)
            ? session.view
            : "canvas"
      ) as View;
    }),
    [section, setSection] = useState<Section>("create"),
    [time, setTimeValue] = useState(session.time ?? 12.3),
    [playing, setPlaying] = useState(false),
    [modal, setModal] = useState<ModalKind>(null),
    [directorIntent, setDirectorIntent] = useState<DirectorIntent | null>(null),
    [inspectorTab, setInspectorTab] = useState(
      session.inspectorTab || "prompt",
    ),
    [selectedAudio, setSelectedAudio] = useState(""),
    [toast, setToast] = useState(""),
    [saveStatus, setSaveStatus] = useState("Saved locally"),
    [jobs, setJobs] = useState<RemoteJob[]>(() => {
      try {
        return JSON.parse(
          localStorage.getItem(workspaceKey("mouva-production-jobs")) || "[]",
        );
      } catch {
        return [];
      }
    }),
    [sceneOpen, setSceneOpen] = useState(false),
    [selectedObject, setSelectedObject] = useState(""),
    [pendingRequest, setPendingRequest] = useState<any>(null),
    [sidebarOpen, setSidebarOpen] = useState(false),
    [inspectorOpen, setInspectorOpen] = useState(false),
    [history, setHistory] = useState<{ past: Project[]; future: Project[] }>({
      past: [],
      future: [],
    });
  const shot = project.shots.find((s) => s.id === selected) || project.shots[0],
    total = duration(project),
    notify = (message: string) => setToast(message);
  const remoteLoaded = useRef(false);
  const historyRef = useRef(history),
    timeRef = useRef(time),
    selectedRef = useRef(selected);
  const playbackClock = useRef({ time, at: performance.now() });
  const editGroup = useRef<{ key: string; at: number } | null>(null);
  timeRef.current = time;
  selectedRef.current = selected;
  function stamp(next: Project) {
    next.updatedAt = new Date(
      Math.max(Date.now(), (Date.parse(projectRef.current.updatedAt) || 0) + 1),
    ).toISOString();
  }
  function reconcile(next: Project, previous: Project) {
    const oldHit = locate(previous, timeRef.current);
    const oldIndex = previous.shots.findIndex(
      (s) => s.id === selectedRef.current,
    );
    const sameSource =
      oldHit &&
      next.shots.find(
        (s) =>
          s.adoptedTakeId === oldHit.shot.adoptedTakeId &&
          oldHit.local >= s.trimStart &&
          oldHit.local < s.trimEnd,
      );
    const target =
      next.shots.find((s) => s.id === selectedRef.current) ||
      sameSource ||
      next.shots[Math.max(0, Math.min(oldIndex, next.shots.length - 1))];
    const index = next.shots.indexOf(target);
    const start = next.shots
      .slice(0, index)
      .reduce((n, s) => n + shotLength(s), 0);
    const source =
      oldHit &&
      (oldHit.shot.id === target.id ||
        oldHit.shot.adoptedTakeId === target.adoptedTakeId)
        ? oldHit.local
        : target.trimStart;
    const position =
      start +
      (Math.max(target.trimStart, Math.min(target.trimEnd - 0.001, source)) -
        target.trimStart) /
        target.speed;
    selectedRef.current = target.id;
    timeRef.current = position;
    setSelected(target.id);
    setTimeValue(position);
    setPlaying(false);
  }
  function update(
    fn: (p: Project) => void,
    label = "Edit project",
    group?: string,
  ) {
    const current = projectRef.current,
      next = structuredClone(current);
    fn(next);
    validateCanvas(next);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    stamp(next);
    const grouped =
      group &&
      editGroup.current?.key === group &&
      performance.now() - editGroup.current.at < 500;
    historyRef.current = {
      past: grouped
        ? historyRef.current.past
        : [...historyRef.current.past, current].slice(-50),
      future: [],
    };
    editGroup.current = group ? { key: group, at: performance.now() } : null;
    setHistory(historyRef.current);
    reconcile(next, current);
    projectRef.current = next;
    setProject(next);
  }
  const updateShot = (patch: Partial<Shot>) =>
    update((p) => {
      const target = p.shots.find((s) => s.id === shot.id);
      if (target) Object.assign(target, patch);
    });
  const setTime = (n: number, resetClock = true) => {
    if (!Number.isFinite(n)) return;
    const t = Math.max(0, Math.min(duration(projectRef.current) - 0.001, n));
    timeRef.current = t;
    setTimeValue(t);
    if (resetClock) playbackClock.current = { time: t, at: performance.now() };
    const hit = locate(projectRef.current, t);
    if (hit) {
      selectedRef.current = hit.shot.id;
      setSelected(hit.shot.id);
    }
  };
  const select = (id: string) => {
    if (!projectRef.current.shots.some((s) => s.id === id)) return;
    selectedRef.current = id;
    setSelected(id);
    setPlaying(false);
    setSidebarOpen(false);
    let at = 0;
    for (const s of projectRef.current.shots) {
      if (s.id === id) {
        timeRef.current = at;
        setTimeValue(at);
        break;
      }
      at += shotLength(s);
    }
  };
  const openScene = (id: string) => {
    select(id);
    setView("canvas");
    setSection("create");
    setSceneOpen(true);
    setSelectedObject("");
  };
  const addJob = (job: RemoteJob) =>
    setJobs((list) =>
      [job, ...list.filter((j) => j.id !== job.id)].slice(0, 100),
    );
  useEffect(() => {
    localStorage.setItem(workspaceKey("mouva-production-jobs"), JSON.stringify(jobs));
  }, [jobs]);
  useEffect(() => {
    void Promise.all([
      studioAI.jobs(project.id),
      studioAI.editorJobs(project.id),
    ])
      .then((groups) => groups.flat())
      .then((remote) => remote.forEach(addJob))
      .catch(() => {});
  }, [project.id]);
  const undo = () => {
    editGroup.current = null;
    const h = historyRef.current;
    if (!h.past.length) return;
    const current = projectRef.current,
      next = structuredClone(h.past.at(-1)!);
    stamp(next);
    reconcile(next, current);
    historyRef.current = {
      past: h.past.slice(0, -1),
      future: [current, ...h.future],
    };
    projectRef.current = next;
    setProject(next);
    setHistory(historyRef.current);
  };
  const redo = () => {
    editGroup.current = null;
    const h = historyRef.current;
    if (!h.future.length) return;
    const current = projectRef.current,
      next = structuredClone(h.future[0]);
    stamp(next);
    reconcile(next, current);
    historyRef.current = {
      past: [...h.past, current].slice(-50),
      future: h.future.slice(1),
    };
    projectRef.current = next;
    setProject(next);
    setHistory(historyRef.current);
  };
  const replaceProject = (p: Project) => {
    setPlaying(false);
    projectRef.current = p;
    selectedRef.current = p.shots[0].id;
    timeRef.current = 0;
    historyRef.current = { past: [], future: [] };
    setProject(p);
    setSelected(p.shots[0].id);
    setTimeValue(0);
    setHistory(historyRef.current);
  };
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("project");
    if (connected && id) {
      void workspaceApi
        .loadProject(id)
        .then((p) => {
          remoteLoaded.current = true;
          replaceProject(p);
        })
        .catch((e) => notify(e.message));
    } else {
      const original = projectRef.current;
      void hydrateMedia(original)
        .then((restored) => {
          if (projectRef.current.id !== original.id) return;
          const next = mergeRestoredMedia(
            projectRef.current,
            original,
            restored,
          );
          historyRef.current = {
            past: historyRef.current.past.map((p) =>
              mergeRestoredMedia(p, original, restored),
            ),
            future: historyRef.current.future.map((p) =>
              mergeRestoredMedia(p, original, restored),
            ),
          };
          reconcile(next, projectRef.current);
          projectRef.current = next;
          setProject(next);
          setHistory(historyRef.current);
        })
        .catch(() => notify("Some imported assets could not be restored."));
    }
  }, []);
  useEffect(() => {
    if (!connected || !remoteLoaded.current) return;
    let active = true;
    const timer = setTimeout(() => {
      setSaveStatus("Saving to API…");
      void workspaceApi
        .saveProject(project)
        .then(() => {
          if (active) setSaveStatus("Saved to API");
        })
        .catch((e) => {
          if (active) {
            setSaveStatus("API save failed");
            notify(e.message);
          }
        });
    }, 900);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [project]);
  useEffect(() => {
    setSaveStatus("Saving…");
    const timer = setTimeout(() => {
      try {
        persistProject(project);
        setSaveStatus("Saved locally");
      } catch {
        setSaveStatus("Save failed");
        notify("Browser storage is full. Save your project JSON.");
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [project]);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        localStorage.setItem(
          sessionKey(),
          JSON.stringify({ selected, view, time, inspectorTab }),
        ),
      180,
    );
    return () => clearTimeout(timer);
  }, [selected, view, time, inspectorTab]);
  useEffect(() => {
    if (time > total) setTime(total - 0.01);
  }, [total]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!playing) return;
    playbackClock.current = {
      time:
        timeRef.current >= duration(projectRef.current) - 0.01
          ? 0
          : timeRef.current,
      at: performance.now(),
    };
    let frame = 0;
    const tick = (now: number) => {
      const at =
        playbackClock.current.time + (now - playbackClock.current.at) / 1000;
      if (at >= duration(projectRef.current)) {
        setTime(duration(projectRef.current) - 0.001, false);
        setPlaying(false);
      } else {
        setTime(at, false);
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if (e.key === "Escape") {
        setModal(null);
        setSidebarOpen(false);
        setInspectorOpen(false);
      }
      if (modal) return;
      if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) {
        const hit = locate(projectRef.current, time);
        if (hit)
          execute([
            {
              tool: "clip.split",
              targetId: hit.shot.id,
              args: { sourceTime: hit.local },
            },
          ]);
      }
      if (e.code === "Space" && view === "canvas" && !sceneOpen) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal, history, time, view, sceneOpen]);
  useSequenceAudio(project, playing, time);
  function attachAssets(shotId: string, assetIds: string[]) {
    try {
      update(
        (p) =>
          attachShotAssets(
            p,
            shotId,
            p.assets.filter((a) => assetIds.includes(a.id)),
          ),
        "Attach media to shot",
      );
    } catch (e: any) {
      notify(e.message);
    }
  }
  async function upload(
    files: FileList | File[],
    shotId?: string,
  ): Promise<Asset[]> {
    const list = Array.from(files),
      projectId = projectRef.current.id,
      imported: Asset[] = [];
    if (!list.length) return imported;
    notify(
      "Importing " + list.length + " file" + (list.length > 1 ? "s" : "") + "…",
    );
    for (const file of list) {
      let localUrl: string | undefined;
      try {
        if (file.size > 150 * 1024 * 1024)
          throw new Error(file.name + " exceeds 150 MB.");
        const kind = file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("video/")
            ? "video"
            : file.type.startsWith("audio/")
              ? "audio"
              : file.name.toLowerCase().endsWith(".glb")
                ? "model"
                : null;
        if (!kind || (shotId && kind !== "image" && kind !== "video"))
          throw new Error(
            "Choose a supported " +
              (shotId ? "image or video: " : "media file: ") +
              file.name,
          );
        const video = kind === "video" ? await inspectVideo(file) : undefined;
        const sound = kind === "audio" ? await audioPeaks(file) : undefined;
        let asset: Asset;
        if (connected) {
          asset = await workspaceApi.upload(projectId, file);
          if (video) {
            asset.duration = video.duration;
            asset.image = { url: video.poster };
          }
          if (sound) asset.duration = sound.duration;
        } else {
          const id = uid();
          localUrl = URL.createObjectURL(file);
          asset = {
            id,
            name: file.name,
            kind,
            url: localUrl,
            fileKey: id,
            size: file.size,
            folder: "uploads",
            ...(kind === "image" ? { image: { url: localUrl } } : {}),
          };
          if (video) {
            asset.duration = video.duration;
            asset.image = { url: video.poster };
          }
          if (sound) asset.duration = sound.duration;
          await storeFile(id, file);
        }
        update(
          (p) => {
            if (p.id !== projectId)
              throw new Error(
                "The project changed during import. Reopen the original project before importing again.",
              );
            if (shotId && !p.shots.some((s) => s.id === shotId))
              throw new Error("The target shot was removed during import.");
            p.assets.push(asset);
            if (shotId) attachShotAssets(p, shotId, [asset]);
            if (sound)
              p.audio.push({
                id: uid(),
                name: asset.name,
                kind: "music",
                start: 0,
                duration: Math.min(sound.duration, duration(p)),
                gain: 0.7,
                pan: 0,
                fadeIn: 0,
                fadeOut: 0,
                muted: false,
                solo: false,
                peaks: sound.peaks,
                demo: false,
                assetId: asset.id,
              });
          },
          shotId ? "Upload media to shot" : "Import media",
        );
        imported.push(asset);
      } catch (e: any) {
        if (localUrl) URL.revokeObjectURL(localUrl);
        notify(e.message);
        return imported;
      }
    }
    notify(
      shotId
        ? "Media attached to this shot. Choose a take to preview or use in the sequence."
        : "Assets imported.",
    );
    return imported;
  }
  function openDirector(intent?: DirectorIntent) {
    if (intent?.shotId) select(intent.shotId);
    setDirectorIntent(intent || null);
    setModal("production");
  }
  async function request(
    kind: "generate" | "repair" | "export",
    settings: any = {},
  ) {
    if (kind === "export" && !connected) {
      try {
        const job = await exportSequence(projectRef.current, settings, notify);
        addJob(job);
        setModal("jobs");
        notify("Export started.");
      } catch (e: any) {
        notify(e.message);
      }
      return;
    }
    if (kind === "generate" || (workingScene(shot) && kind === "repair")) {
      openDirector({
        instruction:
          settings.prompt ||
          (kind === "repair" ? shot.repair.prompt : shot.prompt),
      });
      return;
    }
    const common = {
      requestId: uid(),
      projectId: project.id,
      shotId: shot.id,
      prompt: shot.prompt,
      model: shot.model,
      duration: shot.duration,
      resolution: shot.resolution,
      aspectRatio: shot.aspectRatio,
      character: shot.characterId
        ? {
            id: shot.characterId,
            strength: shot.characterStrength,
            preserve: shot.preserveCharacter,
          }
        : null,
      referenceAssetIds: project.assets
        .filter(
          (a) =>
            a.image && JSON.stringify(a.image) === JSON.stringify(shot.image),
        )
        .map((a) => a.id),
    };
    const input =
      kind === "export"
        ? { requestId: uid(), projectId: project.id, ...settings }
        : kind === "repair"
          ? {
              ...common,
              prompt: shot.repair.prompt || shot.prompt,
              baseTakeId: shot.adoptedTakeId,
              tool: shot.repair.tool,
              sourceRange: {
                startSeconds: shot.repair.start,
                endSeconds: shot.repair.end,
              },
              mask: shot.repair.mask || null,
            }
          : common;
    if (!connected) {
      setPendingRequest({ operation: kind, ...input });
      setModal("request");
      return;
    }
    try {
      const job = await (kind === "repair"
        ? workspaceApi.repair(input as any)
        : workspaceApi.export(input as any));
      setJobs((list) => [job, ...list.filter((j) => j.id !== job.id)]);
      setModal("jobs");
      notify("Request submitted to your API.");
    } catch (e: any) {
      notify(e.message);
    }
  }
  useEffect(() => {
    const active = jobs.filter(
      (j) => j.status === "queued" || j.status === "running",
    );
    if (!active.length) return;
    let disposed = false;
    const timer = setTimeout(() => {
      void Promise.allSettled(
        active
          .filter(
            (j) =>
              j.provider === "pipeline" || j.provider === "editor" || connected,
          )
          .map((j) =>
            j.provider === "editor"
              ? studioAI.editorJob(j.id)
              : j.provider === "pipeline"
                ? studioAI.job(j.id)
                : workspaceApi.getJob(j.id),
          ),
      ).then((results) => {
        if (disposed) return;
        for (const result of results) {
          if (result.status === "rejected") {
            notify("Could not refresh job status. Check API connection.");
            continue;
          }
          const job = result.value;
          setJobs((list) => list.map((j) => (j.id === job.id ? job : j)));
        }
      });
    }, 2000);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [jobs]);
  useEffect(() => {
    const pending = jobs
      .filter(
        (j) => j.projectId === project.id && j.shotId && j.kind !== "export",
      )
      .flatMap((job) => {
        const target = projectRef.current.shots.find(
          (s) => s.id === job.shotId,
        );
        return target
          ? productionCandidates(job, target)
              .filter(
                (t) => !target.takes.some((existing) => existing.id === t.id),
              )
              .map((take) => ({ shotId: target.id, take }))
          : [];
      });
    if (!pending.length) return;
    update((p) => {
      for (const candidate of pending) {
        const target = p.shots.find((s) => s.id === candidate.shotId);
        if (target && !target.takes.some((t) => t.id === candidate.take.id))
          target.takes.push(candidate.take);
      }
    }, "Director candidate ready");
    notify("New scene or video ready to review in Takes.");
  }, [jobs, project.id]);
  useEffect(() => {
    const resize = () => {
      if (window.innerWidth > 820) setInspectorOpen(false);
      if (window.innerWidth > 1100) setSidebarOpen(false);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  function execute(commands: EditCommand[], baseRevision?: string) {
    try {
      if (baseRevision && baseRevision !== projectRef.current.updatedAt)
        throw new Error(
          "The project changed while AI was planning. Please run the instruction again.",
        );
      for (const c of commands)
        if (!toolCatalog.some((t) => t[0] === c.tool))
          throw new Error("Unknown tool: " + c.tool);
      const changes = commands.filter((c) => projectTools.has(c.tool as any));
      if (changes.length) {
        const position = timeRef.current,
          previous = projectRef.current,
          next = runCommands(previous, changes);
        next.updatedAt = previous.updatedAt;
        const one =
          changes.length === 1 && commands.length === 1 ? changes[0] : null;
        const group =
          one &&
          ["clip.effects", "text.update", "audio.update"].includes(one.tool)
            ? [
                one.tool,
                one.targetId,
                one.args?.id,
                Object.keys(one.args || {})
                  .sort()
                  .join(","),
              ].join(":")
            : undefined;
        update((p) => Object.assign(p, next), "Edit sequence", group);
        if (changes.some((c) => c.tool === "clip.split")) setTime(position);
        else {
          const added = next.shots.find(
            (s) => !previous.shots.some((old) => old.id === s.id),
          );
          if (added) select(added.id);
        }
      }
      for (const c of commands.filter(
        (c) => !projectTools.has(c.tool as any),
      )) {
        const a = c.args || {};
        if (c.tool === "ui.select") select(c.targetId!);
        if (
          c.tool === "ui.view" &&
          ["stream", "canvas", "timeline"].includes(a.view)
        ) {
          setView(a.view);
          setSceneOpen(false);
          setSection("create");
        }
        if (c.tool === "ui.seek") setTime(a.time);
        if (c.tool === "ui.play") setPlaying(a.playing);
        if (c.tool === "history.undo") undo();
        if (c.tool === "history.redo") redo();
        if (c.tool === "render.export") void request("export", a);
        if (c.tool === "ai.generate") {
          if (c.targetId) select(c.targetId);
          openDirector({ instruction: a.prompt });
        }
      }
      return true;
    } catch (e: any) {
      notify(e.message);
      return false;
    }
  }
  const canvasRoom = section === "create" && view === "canvas" && !sceneOpen;
  const context = {
    execute,
    directorIntent,
    openDirector,
    project,
    shot,
    selected: shot.id,
    select,
    view,
    setView,
    section,
    setSection,
    time,
    setTime,
    playing,
    setPlaying,
    update,
    updateShot,
    modal,
    setModal,
    notify,
    upload,
    attachAssets,
    request,
    jobs,
    selectedAudio,
    setSelectedAudio,
    inspectorTab,
    setInspectorTab,
    undo,
    redo,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
    sidebarOpen,
    setSidebarOpen,
    inspectorOpen,
    setInspectorOpen,
    replaceProject,
    pendingRequest,
    sceneOpen,
    setSceneOpen,
    openScene,
    selectedObject,
    setSelectedObject,
    addJob,
  };
  return (
    <WorkspaceContext.Provider value={context}>
      <div className={"mw-app" + (canvasRoom ? " canvas-room" : "")}>
        <header className="mw-header">
          <button
            className="mw-wordmark"
            onClick={() => {
              setSection("create");
              setView("canvas");
            }}
          >
            mouva
          </button>
          <span className="mw-header-divider" />
          <button
            className="mw-project-switch"
            onClick={() => setModal("project")}
          >
            <Icon name="spark" size={18} />
            <span>
              <strong>
                {project.name}
                <Icon name="chevron" size={13} />
              </strong>
              <small>A little idea becomes a movie.</small>
            </span>
          </button>
          <nav className="mw-view-tabs" aria-label="Workspace views">
            {(["stream", "canvas", "timeline"] as View[]).map((v) => (
              <button
                key={v}
                className={view === v && section === "create" ? "active" : ""}
                aria-pressed={view === v && section === "create"}
                onClick={() => {
                  setView(v);
                  setSceneOpen(false);
                  setSection("create");
                }}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </nav>
          <span className="mw-header-caption">
            Three views. One story. Always in sync.
          </span>
          <div className="mw-header-actions">
            <button
              className="mw-secondary mw-ai-header"
              onClick={() => openDirector()}
            >
              <Icon name="spark" size={16} />
              AI director
            </button>
            <button
              className="mw-save-indicator"
              title={saveStatus}
              aria-label={saveStatus}
              onClick={() => setModal("ai-settings")}
            >
              <Icon name="save" size={17} />
              <span>{connected ? "Connected" : "Server"}</span>
            </button>
            <IconButton
              icon="undo"
              label="Undo"
              onClick={undo}
              disabled={!history.past.length}
            />
            <IconButton
              icon="redo"
              label="Redo"
              onClick={redo}
              disabled={!history.future.length}
            />
            <button
              className="mw-secondary mw-share-button"
              aria-label="Share"
              onClick={() => setModal("share")}
            >
              <Icon name="upload" size={16} />
              <span>Share</span>
            </button>
            <button
              className="mw-dark"
              aria-label="Export"
              onClick={() => setModal("export")}
            >
              <Icon name="download" size={17} />
              <span>Export</span>
            </button>
          </div>
        </header>
        <div
          className={"mw-body " + (section !== "create" ? "resource-mode" : "")}
        >
          <nav className="mw-rail" aria-label="Main navigation">
            {[
              ["create", "spark", "Create"],
              ["canvas", "canvas", "Canvas"],
              ["assets", "box", "Assets"],
              ["characters", "camera", "Characters"],
              ["library", "layers", "Library"],
            ].map(([id, icon, label]) => (
              <button
                key={id}
                className={
                  (
                    id === "canvas"
                      ? section === "create" && view === "canvas"
                      : section === id && (id !== "create" || view !== "canvas")
                  )
                    ? "active"
                    : ""
                }
                onClick={() => {
                  if (id === "canvas") {
                    setSection("create");
                    setView("canvas");
                  } else setSection(id as Section);
                }}
              >
                <Icon name={icon} size={21} />
                <span>{label}</span>
              </button>
            ))}
            <button onClick={() => setModal("help")}>
              <Icon name="more" size={21} />
              <span>More</span>
            </button>
            <div className="mw-rail-bottom">
              <button
                className="mw-user"
                aria-label="Workspace help"
                onClick={() => setModal("help")}
              >
                L
              </button>
              <button className="mw-pro" onClick={() => setModal("connect")}>
                <Icon name="spark" size={10} />
                Local
              </button>
            </div>
          </nav>
          {section === "create" ? (
            <>
              {!canvasRoom && <Sidebar />}
              <main className={"mw-main " + view}>
                <div className="mw-mobile-toolbar">
                  <button onClick={() => setSidebarOpen(true)}>
                    <Icon name="stream" size={16} />
                    Shots
                  </button>
                  <span>{shot.title}</span>
                  <button onClick={() => setInspectorOpen(true)}>
                    Edit
                    <Icon name="layers" size={16} />
                  </button>
                </div>
                {sceneOpen && workingScene(shot) ? (
                  <SceneStudio key={shot.id} />
                ) : view === "canvas" ? (
                  <CreativeGraph />
                ) : view === "timeline" ? (
                  <TimelineView />
                ) : (
                  <StreamView />
                )}
              </main>
              {sceneOpen && workingScene(shot) ? (
                <NativeInspector key={shot.id} />
              ) : !canvasRoom || inspectorOpen ? (
                <Inspector />
              ) : null}
            </>
          ) : (
            <main className="mw-resource-main">
              {section === "assets" ? (
                <AssetsPage />
              ) : section === "characters" ? (
                <CharactersPage />
              ) : (
                <LibraryPage />
              )}
            </main>
          )}
        </div>
        {!canvasRoom && (sidebarOpen || inspectorOpen) && (
          <button
            className="mw-drawer-backdrop"
            aria-label="Close side panel"
            onClick={() => {
              setSidebarOpen(false);
              setInspectorOpen(false);
            }}
          />
        )}
        {modal && <Dialogs />}
        {toast && (
          <div className="mw-toast" role="status">
            <Icon name="check" size={17} />
            {toast}
            <IconButton
              icon="close"
              label="Dismiss notification"
              onClick={() => setToast("")}
            />
          </div>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}
