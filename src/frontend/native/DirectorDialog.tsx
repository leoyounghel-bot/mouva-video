import { t as tr, text } from "../i18n";
import { canvasInputs } from "../canvas/model";
import { useProduction } from "./useProduction";
import { useEffect, useState } from "react";
import { useWorkspace } from "../context";
import { Field, Icon, Modal, NumberField, Toggle } from "../Primitives";
import { studioAI, type AIStatus } from "./api";
import { nativeAssets, workingScene } from "./templates";
import type { CandidateCount } from "./rounds";

const outputs = [
  {
    id: "scene",
    title: "可编辑 3D",
    detail: "先确定主体、构图和运镜",
    icon: "box",
  },
  {
    id: "reference",
    title: "运动预览",
    detail: "先看动作和节奏，再生成成片",
    icon: "play",
  },
  {
    id: "finish",
    title: "视频候选",
    detail: "固定源场景，探索不同的视频表现",
    icon: "video",
  },
] as const;

export function DirectorDialog() {
  const w = useWorkspace();
  const inputs = canvasInputs(w.project, w.shot.id);
  const source = inputs.scene || workingScene(w.shot);
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
  const [revise, setRevise] = useState(intent?.reviseScene ?? !source);
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
  const [count, setCount] = useState<CandidateCount>(
    intent?.candidateCount || 1,
  );
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
  const reviseScene = !source || mode === "scene" || revise;
  const needsBrief = reviseScene || mode === "finish";
  const missing: string[] = [];
  if (status) {
    if ((reviseScene || mode === "finish") && !status.orchestratorReady)
      missing.push("场景 AI 连接");
    if (reviseScene && !status.sceneReady && status.orchestratorReady)
      missing.push("场景模型");
    if (mode === "finish" && !status.videoReady) missing.push("视频模型");
    if (mode === "finish" && !status.publisherReady)
      missing.push("运动参考发布服务");
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
    const jobs = await production.submitBatch({
      instruction,
      mode,
      reviseScene,
      scope,
      objectId,
      duration: seconds,
      referenceIds,
      generateAudio: audio,
      count: mode === "finish" ? count : 1,
    });
    if (jobs) {
      w.setModal("takes");
      w.notify(`已提交 ${jobs.length} 个候选，完成后在卡组中挑选。`);
    }
  }

  return (
    <Modal
      title={tr("导演工作台")}
      subtitle={w.shot.title + tr(" · 描述这一轮想创造或改善的画面。")}
      onClose={() => {
        if (!busy) w.setModal(null);
      }}
      wide
    >
      <div className="mw-director-path" aria-label={tr("Production workflow")}>
        <span>{tr("描述镜头")}</span>
        <b>→</b>
        <span>{tr("可编辑 3D")}</span>
        <b>→</b>
        <span>{tr("运动预览")}</span>
        <b>→</b>
        <span>{tr("挑选视频")}</span>
      </div>
      <p className="mw-help">
        {tr(
          source
            ? "从正在查看的版本继续创作。每次生成都会保存为新版本，采用前不会替换当前剪辑。"
            : "先按描述创建可编辑 3D 源场景，用它控制后续视频的构图、动作和运镜。",
        )}
      </p>
      <fieldset className="mw-director-form" disabled={busy}>
        <Field label={tr("这一轮，画面应该怎样变化？")}>
          <textarea
            className="mw-ai-prompt"
            aria-label={tr("导演描述")}
            value={instruction}
            maxLength={8000}
            rows={5}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={tr(
              "例如：创建一个悬浮的银色球体，镜头缓慢环绕，球体从第 2 秒开始旋转。保留标题 Mouva，最后生成电影感视频。",
            )}
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
              {tr(brief)}
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
              <span>{tr(output.detail)}</span>
            </button>
          ))}
        </div>
        {source && mode !== "scene" ? (
          <Toggle
            label={tr("根据描述修改 3D 源场景（关闭可固定构图与运镜）")}
            checked={revise}
            onChange={setRevise}
          />
        ) : !source ? (
          <NumberField
            label={tr("镜头时长（秒）")}
            value={seconds}
            min={4}
            max={30}
            step={1}
            onChange={(n) => setSeconds(Math.round(n))}
          />
        ) : null}
        {source && reviseScene && (
          <Field label={tr("允许修改的范围")}>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="scene">{tr("场景、主体与相机")}</option>
              <option value="object">{tr("仅修改一个指定物体")}</option>
            </select>
          </Field>
        )}
        {source && reviseScene && scope === "object" && (
          <Field label={tr("指定物体")}>
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
        {(reviseScene || mode === "finish") && (
          <details className="mw-director-references">
            <summary>
              {tr("图片与 3D 参考 ·")}
              {tr(new Set([...requiredIds, ...referenceIds]).size)}
              {tr(" ")}
              {tr("已选择")}
            </summary>
            <p className="mw-help">
              {tr(
                mode === "finish" ? "图片提供主体外观与风格，3D 运动参考确定构图和运镜。GLB 模型用于编辑源场景。" : "选择场景可用的图片或 GLB 模型，也可以从素材库导入更多。",
              )}
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
                  <small>{tr(a.kind === "model" ? "3D 模型" : "图片")}</small>
                </label>
              ))}
            </div>
          </details>
        )}
        {mode === "finish" && (
          <Toggle
            label={tr("同时生成视频声音")}
            checked={audio}
            onChange={setAudio}
          />
        )}
      </fieldset>
      <p className="mw-help">
        {tr("3D 源场景会在渲染前保存，之后仍可编辑。")}
        {tr(" ")}
        {tr(
          mode === "finish"
            ? "源场景用于引导模型；成片仍可能出现偏差，可以在卡组中比较和继续修正。"
            : mode === "reference" && !reviseScene
              ? "直接预览现有场景不会调用生成模型。"
              : "在候选卡组中查看结果，再继续完善同一镜头。",
        )}
      </p>
      {mode === "finish" && (
        <div className="mw-director-round">
          <div>
            <strong>{tr("这一轮，探索几种可能？")}</strong>
            <p>
              {tr(
                "保留所有候选，比较后再采用。每张独立生成，可能产生模型费用。",
              )}
            </p>
          </div>
          <div role="group" aria-label={tr("候选数量")}>
            {([1, 2, 4] as const).map((n) => (
              <button
                key={n}
                aria-pressed={count === n}
                disabled={busy}
                onClick={() => setCount(n)}
              >
                <Icon name="layers" size={16} />
                <strong>
                  {text(`${n}张`, `${n} ${n === 1 ? "card" : "cards"}`)}
                </strong>
                <small>
                  {tr(n === 1 ? "专注尝试" : n === 2 ? "两版对比" : "探索更多")}
                </small>
              </button>
            ))}
          </div>
          {source && (
            <p>
              {tr(
                reviseScene
                  ? "每张都会分别修改源场景。关闭上方的场景修改，可固定构图和运镜。"
                  : "已固定当前 3D 源场景；视频效果仍可能有所变化。",
              )}
            </p>
          )}
        </div>
      )}
      {!!missing.length && (
        <div className="mw-ai-notice">
          {tr("该输出需要配置：")}
          {missing.map((item) => tr(item)).join(", ")}.
          <button
            className="mw-text-button"
            onClick={() => w.setModal("ai-settings")}
          >
            {tr("服务设置 →")}
          </button>
          {mode === "finish" &&
            status?.sceneReady &&
            status.orchestratorReady && (
              <button
                className="mw-text-button"
                onClick={() => setMode("scene")}
              >
                {tr("先创建可编辑 3D 场景 →")}
              </button>
            )}
        </div>
      )}
      {!status && error && (
        <button
          className="mw-text-button"
          onClick={() => w.setModal("ai-settings")}
        >
          {tr("服务设置 →")}
        </button>
      )}
      {(error || production.error) && (
        <p className="mw-form-error" role="alert">
          {tr(error || production.error)}
        </p>
      )}
      <div className="mw-dialog-actions">
        <button
          className="mw-text-button"
          disabled={busy}
          onClick={() => w.setModal("editing-assistant")}
        >
          {tr("时间线编辑工具")}
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
          {tr(
            busy
              ? "正在提交候选…"
              : mode === "scene"
                ? "创建 3D 源场景"
                : mode === "reference"
                  ? "创建运动预览"
                  : `抽取 ${count} 张视频候选`,
          )}
        </button>
      </div>
    </Modal>
  );
}
