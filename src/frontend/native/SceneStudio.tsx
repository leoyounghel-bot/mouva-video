import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "../context";
import {
  Icon,
  IconButton,
  Badge,
  Field,
  NumberField,
  Toggle,
  Modal,
} from "../Primitives";
import { downloadJson } from "../api";
import { shotLength } from "../demo";
import { NativeViewport } from "./NativeViewport";
import { workingScene, addNativeTake } from "./templates";
import { validateScene, sceneKey, shapeGeometries } from "./schema";
import type { SceneSpec, SceneObject } from "./schema";
import { studioAI } from "./api";
import type { AIStatus } from "./api";
function useScene() {
  const w = useWorkspace(),
    scene = workingScene(w.shot)!;
  return {
    w,
    scene,
    edit: (fn: (s: SceneSpec) => void) =>
      w.update((p) => {
        const s = p.shots.find((x) => x.id === w.shot.id)!;
        const next = structuredClone(workingScene(s)!);
        fn(next);
        validateScene(next);
        s.nativeDraft = { baseTakeId: s.viewingTakeId, scene: next };
      }, "Edit source scene"),
  };
}
export function SceneStudio() {
  const { w, scene } = useScene(),
    s = w.shot,
    [preview, setPreview] = useState<"source" | "reference" | "finish">(
      "source",
    ),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    upload = useRef<HTMLInputElement>(null);
  const take = s.takes.find((t) => t.id === s.viewingTakeId)!,
    job = w.jobs.find(
      (j) => j.shotId === s.id && ["queued", "running"].includes(j.status),
    );
  const stale =
    !!take.sourceSceneKey && take.sourceSceneKey !== sceneKey(scene);
  useEffect(() => {
    setTime(0);
    setPlaying(false);
    setPreview("source");
  }, [s.id, s.viewingTakeId]);
  useEffect(() => {
    if (!playing) return;
    const origin = performance.now(),
      start = time;
    let frame = 0;
    const tick = (n: number) => {
      setTime((start + (n - origin) / 1000) % scene.duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, scene.duration]);
  return (
    <section className="mw-scene-studio">
      <header className="mw-scene-header">
        <div className="mw-scene-heading">
          <IconButton
            icon="arrow"
            label="Back to creative graph"
            onClick={() => w.setSceneOpen(false)}
          />
          <div>
            <small>CONNECTED SHOT</small>
            <h2>{s.title}</h2>
          </div>
        </div>
        <div className="mw-scene-actions">
          <button
            className="mw-secondary"
            onClick={() => downloadJson(scene, "mouva-scene.json")}
          >
            <Icon name="download" size={14} />
            Scene JSON
          </button>
          <IconButton
            icon="upload"
            label="Import scene JSON"
            onClick={() => upload.current?.click()}
          />
          <IconButton
            icon="settings"
            label="Server connection"
            onClick={() => w.setModal("ai-settings")}
          />
        </div>
      </header>
      <input
        hidden
        ref={upload}
        type="file"
        accept=".json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            void f
              .text()
              .then((text) => {
                const data = JSON.parse(text);
                validateScene(data, new Set(w.project.assets.map((a) => a.id)));
                if (data.duration !== s.duration)
                  throw new Error(
                    "Imported scene duration must match this shot.",
                  );
                w.update((p) =>
                  addNativeTake(
                    p.shots.find((x) => x.id === s.id)!,
                    data,
                    "Imported scene",
                  ),
                );
                w.notify("Editable scene imported as a new take.");
              })
              .catch((e) => w.notify(e.message));
          e.target.value = "";
        }}
      />
      <div className="mw-shot-pipeline">
        {[
          ["spark", "Codex + Claude", "Direct the editable scene", "source"],
          ["box", "Three.js", "Render motion reference", "reference"],
          ["video", "Seedance 2.5", "Finish the same shot", "finish"],
        ].map(([icon, title, caption, id], i) => (
          <button
            key={id}
            className={preview === id ? "active" : ""}
            onClick={() => setPreview(id as typeof preview)}
          >
            <span className="mw-pipeline-number">
              <Icon name={icon} size={18} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{caption}</small>
            </span>
            {i < 2 && <Icon name="arrow" size={15} />}
          </button>
        ))}
      </div>
      <div className="mw-scene-preview">
        <div className="mw-scene-preview-bar">
          <div className="mw-scene-tabs">
            {(["source", "reference", "finish"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={preview === v}
                className={preview === v ? "active" : ""}
                onClick={() => setPreview(v)}
              >
                {v === "source"
                  ? "Editable source"
                  : v === "reference"
                    ? "Motion reference"
                    : "Finished shot"}
              </button>
            ))}
          </div>
          <Badge tone={stale ? "gray" : "purple"}>
            {stale
              ? "Source changed"
              : preview === "source"
                ? "Three.js scene"
                : "Linked to source"}
          </Badge>
        </div>
        <div
          className="mw-scene-stage"
          style={{
            aspectRatio: s.aspectRatio.replace(":", "/"),
            maxWidth: `calc(49vh * ${Number(s.aspectRatio.split(":")[0]) / Number(s.aspectRatio.split(":")[1])})`,
          }}
        >
          {preview === "source" ? (
            <NativeViewport
              scene={scene}
              assets={w.project.assets}
              time={time}
              onSelect={w.setSelectedObject}
            />
          ) : (preview === "finish" ? take.videoUrl : take.referenceUrl) ? (
            <video
              key={preview + take.id}
              src={preview === "finish" ? take.videoUrl : take.referenceUrl}
              controls
              playsInline
            />
          ) : (
            <div className="mw-scene-placeholder">
              <Icon name={preview === "finish" ? "video" : "box"} size={35} />
              <h3>
                {preview === "finish"
                  ? "Your scene, brought to life."
                  : "Motion starts with your scene."}
              </h3>
              <p>
                {preview === "finish"
                  ? "Generate a finished shot using this scene’s motion reference."
                  : "Render this editable scene to preview exactly what Seedance will receive."}
              </p>
              <button
                className="mw-secondary"
                onClick={() =>
                  w.openDirector({
                    mode: preview === "finish" ? "finish" : "reference",
                    reviseScene: false,
                  })
                }
              >
                {preview === "finish"
                  ? "Create finished shot"
                  : "Render reference"}
              </button>
            </div>
          )}
        </div>
        <div className="mw-scene-transport">
          <IconButton
            icon={playing ? "pause" : "play"}
            label={playing ? "Pause scene" : "Play scene"}
            onClick={() => setPlaying(!playing)}
          />
          <span>
            {time.toFixed(1)}s <small>/ {scene.duration}s</small>
          </span>
          <input
            aria-label="Scene playhead"
            type="range"
            min="0"
            max={scene.duration}
            step="0.01"
            value={time}
            onChange={(e) => {
              setPlaying(false);
              setTime(Number(e.target.value));
            }}
          />
          <small>{scene.fps} fps</small>
        </div>
      </div>
      {stale && (
        <div className="mw-scene-notice">
          <Icon name="history" size={16} />
          <p>
            This scene has changed. Render a new reference and regenerate to
            update the finished shot.
          </p>
        </div>
      )}
      {job && (
        <button className="mw-scene-job" onClick={() => w.setModal("jobs")}>
          <i className="mw-native-spinner" />
          <span>{job.phase}</span>
          {job.progress !== undefined && <b>{job.progress}%</b>}
          <Icon name="chevron" size={14} />
        </button>
      )}
      <div className="mw-scene-bottom">
        <div>
          <strong>Source and finish, always together.</strong>
          <p>
            Edit an object or camera move. The next render carries your changes
            into Seedance.
          </p>
        </div>
        <button
          className="mw-primary"
          onClick={() => w.openDirector({ mode: "finish", reviseScene: false })}
          disabled={!!job}
        >
          <Icon name="spark" size={15} />
          Generate finished shot
        </button>
      </div>
      <div className="mw-scene-versions">
        <div>
          <Icon name="layers" size={16} />
          <strong>Takes</strong>
          <Badge tone="gray">{s.takes.length}</Badge>
        </div>
        <select
          aria-label="Scene take"
          value={s.viewingTakeId}
          onChange={(e) => w.updateShot({ viewingTakeId: e.target.value })}
        >
          {s.takes
            .filter((t) => t.scene)
            .map((t) => (
              <option value={t.id} key={t.id}>
                {t.label}
                {t.id === s.adoptedTakeId ? " · In sequence" : ""}
              </option>
            ))}
        </select>
        <button
          className="mw-secondary"
          onClick={() => {
            w.update((p) =>
              addNativeTake(
                p.shots.find((x) => x.id === s.id)!,
                scene,
                "Scene " + (s.takes.length + 1),
              ),
            );
            w.notify("Scene saved as a new take.");
          }}
          disabled={!s.nativeDraft}
        >
          Save version
        </button>
        <button
          className="mw-text-button"
          onClick={() => w.setModal("compare")}
        >
          Compare & adopt
        </button>
      </div>
    </section>
  );
}
export function NativeInspector() {
  const { w, scene, edit } = useScene(),
    s = w.shot,
    [tab, setTab] = useState("object"),
    [instruction, setInstruction] = useState(""),
    [scope, setScope] = useState<"scene" | "object">("scene");
  const object =
    scene.objects.find((o) => o.id === w.selectedObject) || scene.objects[0];
  const change = (fn: (o: SceneObject) => void) =>
    edit((next) => {
      const o = next.objects.find((o) => o.id === object.id)!;
      fn(o);
    });
  function direct() {
    w.openDirector({ instruction, mode: "scene", scope, objectId: object.id });
  }
  return (
    <aside
      className={
        "mw-inspector mw-native-inspector " + (w.inspectorOpen ? "open" : "")
      }
    >
      <header className="mw-inspector-heading">
        <div>
          <h2>
            Scene inspector <Icon name="box" size={16} />
          </h2>
          <p>
            <span>{s.title}</span>
          </p>
        </div>
        <IconButton
          icon="close"
          label="Close inspector"
          onClick={() => w.setInspectorOpen(false)}
        />
      </header>
      <nav className="mw-inspector-tabs">
        {["object", "camera", "direct"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t === "object"
              ? "Objects"
              : t === "camera"
                ? "Camera & light"
                : "AI director"}
          </button>
        ))}
      </nav>
      <div className="mw-inspector-scroll">
        {tab === "object" && (
          <>
            <section>
              <h3>
                Scene objects <small>{scene.objects.length}</small>
              </h3>
              <div className="mw-scene-object-list">
                {scene.objects.map((o) => (
                  <button
                    key={o.id}
                    className={object.id === o.id ? "selected" : ""}
                    onClick={() => w.setSelectedObject(o.id)}
                  >
                    <Icon
                      name={
                        o.kind === "text"
                          ? "text"
                          : o.kind === "card"
                            ? "image"
                            : "box"
                      }
                      size={15}
                    />
                    <span>{o.name}</span>
                    <small>{o.kind}</small>
                  </button>
                ))}
              </div>
            </section>
            <section>
              <Field label="Object name">
                <input
                  value={object.name}
                  maxLength={80}
                  onChange={(e) =>
                    change((o) => {
                      o.name = e.target.value;
                    })
                  }
                />
              </Field>
              {object.kind === "shape" && (
                <Field label="Shape geometry">
                  <select
                    value={object.geometry || "torusKnot"}
                    onChange={(e) =>
                      change((o) => {
                        o.geometry = e.target.value as SceneObject["geometry"];
                      })
                    }
                  >
                    {shapeGeometries.map((shape) => (
                      <option key={shape} value={shape}>
                        {shape === "torusKnot"
                          ? "Torus knot"
                          : shape.charAt(0).toUpperCase() + shape.slice(1)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {object.kind === "text" && (
                <Field label="Scene text">
                  <textarea
                    value={object.text}
                    maxLength={500}
                    onChange={(e) =>
                      change((o) => {
                        o.text = e.target.value;
                      })
                    }
                  />
                </Field>
              )}
              {["card", "model"].includes(object.kind) && (
                <Field label="Source asset">
                  <select
                    value={object.assetId || ""}
                    onChange={(e) =>
                      change((o) => {
                        o.assetId = e.target.value || null;
                      })
                    }
                  >
                    {object.kind === "card" && (
                      <option value="">Solid card</option>
                    )}
                    {w.project.assets
                      .filter(
                        (a) =>
                          a.kind ===
                            (object.kind === "model" ? "model" : "image") &&
                          a.url,
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <div className="mw-form-grid">
                <Field label="Object color">
                  <input
                    type="color"
                    value={object.color}
                    onChange={(e) =>
                      change((o) => {
                        o.color = e.target.value;
                      })
                    }
                  />
                </Field>
                <NumberField
                  label="Scale"
                  value={object.scale}
                  min={0.05}
                  max={10}
                  onChange={(n) =>
                    change((o) => {
                      o.scale = n;
                    })
                  }
                />
              </div>
              <h3>Position</h3>
              <div className="mw-vector-fields">
                {["X", "Y", "Z"].map((axis, i) => (
                  <NumberField
                    key={axis}
                    label={"Position " + axis}
                    value={object.position[i]}
                    min={-30}
                    max={30}
                    onChange={(n) =>
                      change((o) => {
                        o.position[i] = n;
                      })
                    }
                  />
                ))}
              </div>
              <h3>Rotation</h3>
              <div className="mw-vector-fields">
                {["X", "Y", "Z"].map((axis, i) => (
                  <NumberField
                    key={axis}
                    label={"Rotation " + axis}
                    value={object.rotation[i]}
                    min={-720}
                    max={720}
                    step={5}
                    onChange={(n) =>
                      change((o) => {
                        o.rotation[i] = n;
                      })
                    }
                  />
                ))}
              </div>
              <Toggle
                label="Visible"
                checked={object.visible}
                onChange={(v) =>
                  change((o) => {
                    o.visible = v;
                  })
                }
              />
            </section>
            <section>
              <h3>Animation</h3>
              <Field label="Motion preset">
                <select
                  value={object.motion.preset}
                  onChange={(e) =>
                    change((o) => {
                      o.motion.preset = e.target
                        .value as typeof o.motion.preset;
                    })
                  }
                >
                  {["none", "rise", "float", "spin"].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="mw-form-grid">
                <NumberField
                  label="Starts at"
                  value={object.motion.start}
                  min={0}
                  max={object.motion.end - 0.05}
                  onChange={(n) =>
                    change((o) => {
                      o.motion.start = n;
                    })
                  }
                />
                <NumberField
                  label="Ends at"
                  value={object.motion.end}
                  min={object.motion.start + 0.05}
                  max={scene.duration}
                  onChange={(n) =>
                    change((o) => {
                      o.motion.end = n;
                    })
                  }
                />
                <NumberField
                  label="Motion amount"
                  value={object.motion.amount}
                  min={-10}
                  max={10}
                  onChange={(n) =>
                    change((o) => {
                      o.motion.amount = n;
                    })
                  }
                />
                <NumberField
                  label="Opacity"
                  value={object.opacity}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(n) =>
                    change((o) => {
                      o.opacity = n;
                    })
                  }
                />
              </div>
            </section>
          </>
        )}
        {tab === "camera" && (
          <>
            <section>
              <h3>Camera</h3>
              <div className="mw-form-grid">
                {(
                  [
                    ["azimuth", "Azimuth", -360, 360],
                    ["elevation", "Elevation", -60, 85],
                    ["distance", "Distance", 2, 40],
                    ["fov", "Field of view", 15, 90],
                    ["orbit", "Orbit over shot", -720, 720],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <NumberField
                    key={key}
                    label={label}
                    value={scene.camera[key]}
                    min={min}
                    max={max}
                    onChange={(n) =>
                      edit((x) => {
                        x.camera[key] = n;
                      })
                    }
                  />
                ))}
              </div>
              <p className="mw-help">
                Orbit describes the camera’s full movement over this shot. Scrub
                the preview to check any frame.
              </p>
            </section>
            <section>
              <h3>Environment</h3>
              <div className="mw-form-grid">
                <Field label="Background">
                  <input
                    type="color"
                    value={scene.background}
                    onChange={(e) =>
                      edit((x) => {
                        x.background = e.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="Accent light">
                  <input
                    type="color"
                    value={scene.accent}
                    onChange={(e) =>
                      edit((x) => {
                        x.accent = e.target.value;
                      })
                    }
                  />
                </Field>
                <NumberField
                  label="Light intensity"
                  value={scene.light}
                  min={0.1}
                  max={5}
                  onChange={(n) =>
                    edit((x) => {
                      x.light = n;
                    })
                  }
                />
              </div>
            </section>
          </>
        )}
        {tab === "direct" && (
          <>
            <section className="mw-director-note">
              <Icon name="spark" size={24} />
              <h3>One brief. A connected shot.</h3>
              <p>
                Codex plans the change. Claude updates your editable scene.
                Review it here before sending its motion to Seedance.
              </p>
            </section>
            <section>
              <Field label="Edit scope">
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as typeof scope)}
                >
                  <option value="scene">Whole scene</option>
                  <option value="object">
                    Selected object · {object.name}
                  </option>
                </select>
              </Field>
              <Field label="Director instruction">
                <textarea
                  rows={6}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Bring the hero screen forward, with a gentle rise and a slower camera orbit…"
                />
              </Field>
              <button
                className="mw-primary full"
                disabled={!instruction.trim()}
                onClick={() => void direct()}
              >
                <Icon name="spark" size={15} />
                Review scene instruction
              </button>
              <p className="mw-help">
                Changes arrive as a new take, preserving the current scene.
              </p>
            </section>
          </>
        )}
      </div>
      <footer className="mw-inspector-footer">
        <button
          className="mw-primary full"
          onClick={() => w.openDirector({ mode: "finish", reviseScene: false })}
        >
          <Icon name="video" size={15} />
          Continue to finished shot
        </button>
        <button
          className="mw-text-button"
          onClick={() => w.setModal("ai-settings")}
        >
          Server connection
        </button>
      </footer>
    </aside>
  );
}
export { DirectorDialog as ProductionDialog } from "./DirectorDialog";
export function ServerDialog() {
  const w = useWorkspace(),
    [token, setToken] = useState(
      sessionStorage.getItem("mouva-ai-token") || "",
    ),
    [status, setStatus] = useState<AIStatus | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    setError("");
    if (!usesMouvaLogin) sessionStorage.setItem("mouva-ai-token", token);
    try {
      setStatus(await studioAI.status());
      const jobs = await studioAI.jobs(w.project.id);
      jobs.forEach(w.addJob);
    } catch (e: any) {
      setStatus(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  return (
    <Modal
      title={usesMouvaLogin ? "Video services" : "Your production server."}
      subtitle="Direction, rendering and video generation."
      onClose={() => w.setModal(null)}
    >
      <div className="mw-server-note">
        <Icon name="link" size={24} />
        <div>
          <strong>
            Codex orchestrates. Claude creates. Seedance finishes.
          </strong>
          <p>{usesMouvaLogin ? "You’re connected with your Mouva account." : "Model API keys live on your server. This workspace uses the server’s access token."}</p>
        </div>
      </div>
      {!usesMouvaLogin && <Field label="Workspace access token">
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Required for a deployed server"
        />
      </Field>}
      {status && (
        <div className="mw-service-list">
          {[
            [
              "Codex orchestrator",
              status.orchestratorReady,
              status.orchestratorModel,
            ],
            ["Claude scene director", status.sceneReady, status.sceneModel],
            ["Seedance video generation", status.videoReady, status.videoModel],
            [
              "Public reference media",
              status.publisherReady,
              "Reachable by Seedance",
            ],
          ].map(([label, ready, detail]) => (
            <div key={String(label)}>
              <Icon name={ready ? "check" : "clock"} size={17} />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              <Badge tone={ready ? "green" : "gray"}>
                {ready ? "Configured" : "Not configured"}
              </Badge>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="mw-form-error" role="alert">
          {error}
        </p>
      )}
      <p className="mw-help">
        Configuration checks do not call the models. Availability is verified
        when a production task runs.
      </p>
      <button
        className="mw-primary full"
        disabled={busy}
        onClick={() => void check()}
      >
        {busy ? "Checking…" : usesMouvaLogin ? "Refresh status" : "Save connection & check status"}
      </button>
    </Modal>
  );
}
import { usesMouvaLogin } from "../auth/session";
