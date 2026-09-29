import { canvasInputs } from "../canvas/model";
import { useProduction } from "./useProduction";
import { useEffect, useState } from "react";
import { useWorkspace } from "../context";
import { Field, Icon, Modal, NumberField, Toggle } from "../Primitives";
import { studioAI, type AIStatus } from "./api";
import { nativeAssets, workingScene } from "./templates";

const outputs = [
  {
    id: "scene",
    title: "Editable 3D",
    detail: "Create the scene, camera and animation",
    icon: "box",
  },
  {
    id: "reference",
    title: "Motion preview",
    detail: "Render the scene into a reference video",
    icon: "play",
  },
  {
    id: "finish",
    title: "Finished video",
    detail: "Use the scene's motion to guide the final video",
    icon: "video",
  },
] as const;

export function DirectorDialog() {
  const w = useWorkspace();
  const inputs = canvasInputs(w.project, w.shot.id);
  const source = workingScene(w.shot) || inputs.scene;
  const intent = w.directorIntent;
  const [instruction, setInstruction] = useState(
    intent?.instruction ??
      (intent?.reviseScene === false
        ? w.shot.takes.find((t) => t.id === w.shot.viewingTakeId)
            ?.instruction ||
          w.shot.prompt ||
          "Follow the source scene composition, camera and timing. Refine the lighting and materials."
        : ""),
  );
  const [mode, setMode] = useState<"scene" | "reference" | "finish">(
    intent?.mode || "finish",
  );
  const [revise, setRevise] = useState(intent?.reviseScene ?? true);
  const [scope, setScope] = useState<"scene" | "object">(
    source ? intent?.scope || "scene" : "scene",
  );
  const [objectId, setObjectId] = useState(
    intent?.objectId || w.selectedObject || source?.objects[0]?.id || "",
  );
  const [seconds, setSeconds] = useState(
    Math.max(4, Math.min(30, Math.round(w.shot.duration || 6))),
  );
  const [referenceIds, setReferenceIds] = useState<string[]>(
    (intent?.referenceAssetIds || w.shot.referenceAssetIds || []).filter((id) =>
      [...w.project.assets, ...nativeAssets].some(
        (a) => a.id === id && (a.kind === "image" || a.kind === "model"),
      ),
    ),
  );
  const [audio, setAudio] = useState(true);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [error, setError] = useState("");
  const production = useProduction(w.shot);
  const busy = production.busy;
  const assets = [
    ...w.project.assets,
    ...nativeAssets.filter((a) => !w.project.assets.some((x) => x.id === a.id)),
  ];
  const references = assets.filter(
    (a) => a.url && (a.kind === "image" || a.kind === "model"),
  );
  const requiredIds = new Set([
    ...(source?.objects.map((o) => o.assetId).filter(Boolean) || []),
    ...inputs.assetIds.filter((id) =>
      references.some((asset) => asset.id === id),
    ),
  ]);
  const reviseScene = !source || revise;
  const needsBrief = reviseScene || mode === "finish";
  const missing: string[] = [];
  if (status) {
    if ((reviseScene || mode === "finish") && !status.orchestratorReady)
      missing.push("Scene AI connection");
    if (reviseScene && !status.sceneReady && status.orchestratorReady)
      missing.push("Scene model");
    if (mode === "finish" && !status.videoReady) missing.push("Video model");
    if (mode === "finish" && !status.publisherReady)
      missing.push("Reference video publishing");
  }
  useEffect(() => {
    let active = true;
    studioAI
      .status()
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    if (
      busy ||
      !status ||
      missing.length ||
      (needsBrief && !instruction.trim() && !inputs.text)
    )
      return;
    setError("");
    const job = await production.submit({
      instruction,
      mode,
      reviseScene,
      scope,
      objectId,
      duration: seconds,
      referenceIds,
      generateAudio: audio,
    });
    if (job) {
      w.setModal("jobs");
      w.notify("Director task saved. Follow its progress in Activity.");
    }
  }

  return (
    <Modal
      title="AI director"
      subtitle={
        w.shot.title + " · Describe the shot you want to create or change."
      }
      onClose={() => {
        if (!busy) w.setModal(null);
      }}
      wide
    >
      <div className="mw-director-path" aria-label="Production workflow">
        <span>Describe your shot</span>
        <b>→</b>
        <span>Editable 3D</span>
        <b>→</b>
        <span>Motion preview</span>
        <b>→</b>
        <span>Video</span>
      </div>
      <p className="mw-help">
        {source
          ? "Continue from the scene and take you are viewing. Changes become a new version of this shot."
          : "This shot has no 3D source yet. Your brief will create an editable control scene as a new take."}
      </p>
      <fieldset className="mw-director-form" disabled={busy}>
        <Field label="What should happen in this shot?">
          <textarea
            className="mw-ai-prompt"
            aria-label="Director instruction"
            value={instruction}
            maxLength={8000}
            rows={5}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="例如：创建一个悬浮的银色球体，镜头缓慢环绕，球体从第 2 秒开始旋转。保留标题 Mouva，最后生成电影感视频。"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </Field>
        <div className="mw-ai-examples">
          {(source
            ? [
                "保留当前主体，镜头向右环绕 30 度，主体缓慢上升",
                "只调整选中的物体：改成银色，从第 2 秒开始旋转",
                "保留当前场景布局，让镜头运动更缓慢，背景变成深蓝色",
              ]
            : [
                "创建银色球体和两个圆环，镜头缓慢环绕，标题写 Mouva",
                "用参考图片搭建三张悬浮屏幕，依次进入画面",
                "围绕参考 3D 模型设计产品展示镜头，柔和灯光，缓慢旋转",
              ]
          ).map((brief, i) => (
            <button
              key={brief}
              onClick={() => {
                setInstruction(brief);
                setRevise(true);
                if (source) setScope(i === 1 ? "object" : "scene");
              }}
            >
              {brief}
            </button>
          ))}
        </div>
        <div className="mw-production-choice mw-director-outputs">
          {outputs.map((output) => (
            <button
              key={output.id}
              aria-pressed={mode === output.id}
              className={mode === output.id ? "selected" : ""}
              onClick={() => setMode(output.id)}
            >
              <Icon name={output.icon} size={21} />
              <strong>{output.title}</strong>
              <span>{output.detail}</span>
            </button>
          ))}
        </div>
        {source ? (
          <Toggle
            label="Update the 3D scene from this brief"
            checked={revise}
            onChange={setRevise}
          />
        ) : (
          <NumberField
            label="Shot duration (seconds)"
            value={seconds}
            min={4}
            max={30}
            step={1}
            onChange={(n) => setSeconds(Math.round(n))}
          />
        )}
        {source && reviseScene && (
          <Field label="What can change?">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="scene">Scene, objects and camera</option>
              <option value="object">Only one selected object</option>
            </select>
          </Field>
        )}
        {source && reviseScene && scope === "object" && (
          <Field label="Selected object">
            <select
              value={objectId}
              onChange={(e) => setObjectId(e.target.value)}
            >
              {source.objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {reviseScene && (
          <details className="mw-director-references">
            <summary>
              Image & 3D references ·{" "}
              {new Set([...requiredIds, ...referenceIds]).size} selected
            </summary>
            <p className="mw-help">
              Choose images or GLB models the scene can use. Import more from
              Assets.
            </p>
            <div>
              {references.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={
                      requiredIds.has(a.id) || referenceIds.includes(a.id)
                    }
                    disabled={requiredIds.has(a.id)}
                    onChange={(e) =>
                      setReferenceIds((ids) =>
                        e.target.checked
                          ? [...ids, a.id]
                          : ids.filter((id) => id !== a.id),
                      )
                    }
                  />
                  <span>{a.name}</span>
                  <small>{a.kind === "model" ? "3D model" : "Image"}</small>
                </label>
              ))}
            </div>
          </details>
        )}
        {mode === "finish" && (
          <Toggle
            label="Generate sound with the video"
            checked={audio}
            onChange={setAudio}
          />
        )}
      </fieldset>
      <p className="mw-help">
        The 3D source stays editable and is saved before rendering.{" "}
        {mode === "finish"
          ? "The rendered motion guides the video model; the finished video can vary from the source."
          : mode === "reference" && !reviseScene
            ? "Previewing the current scene does not call an AI model."
            : "Review the result in Takes, then continue this same shot."}
      </p>
      {!!missing.length && (
        <div className="mw-ai-notice">
          Setup needed for this output: {missing.join(", ")}.
          <button
            className="mw-text-button"
            onClick={() => w.setModal("ai-settings")}
          >
            Server connection →
          </button>
          {mode === "finish" &&
            status?.sceneReady &&
            status.orchestratorReady && (
              <button
                className="mw-text-button"
                onClick={() => setMode("scene")}
              >
                Create the editable 3D scene first →
              </button>
            )}
        </div>
      )}
      {!status && error && (
        <button
          className="mw-text-button"
          onClick={() => w.setModal("ai-settings")}
        >
          Server connection →
        </button>
      )}
      {(error || production.error) && (
        <p className="mw-form-error" role="alert">
          {error || production.error}
        </p>
      )}
      <div className="mw-dialog-actions">
        <button
          className="mw-text-button"
          disabled={busy}
          onClick={() => w.setModal("editing-assistant")}
        >
          Timeline editing tools
        </button>
        <button
          className="mw-primary"
          disabled={
            busy ||
            !status ||
            !!missing.length ||
            (needsBrief && !instruction.trim() && !inputs.text)
          }
          onClick={() => void submit()}
        >
          <Icon name="spark" size={17} />
          {busy
            ? "Saving director task…"
            : mode === "scene"
              ? "Create 3D scene"
              : mode === "reference"
                ? "Create motion preview"
                : "Create video from 3D"}
        </button>
      </div>
    </Modal>
  );
}
