import { t as tr } from "./i18n";
import { memo, useEffect, useRef, useState } from "react";
import type { Shot } from "./types";
import { useWorkspace } from "./context";
import { Icon, Photo } from "./Primitives";
import { CanvasTakePreview } from "./CanvasTakePreview";
import { workingScene } from "./native/templates";
import { useProduction } from "./native/useProduction";
import { CanvasPorts } from "./canvas/CanvasPorts";
import { useCanvasActions } from "./canvas/context";
import { canvasInputs } from "./canvas/model";
import type { CandidateCount } from "./native/rounds";
import { studioAI, type AIStatus } from "./native/api";
import { CanvasComposer } from "./canvas/CanvasComposer";

export const CanvasShotNode = memo(function CanvasShotNode({
  shot,
  active,
}: {
  shot: Shot;
  active: boolean;
}) {
  const w = useWorkspace(),
    actions = useCanvasActions();
  const take =
    shot.takes.find((t) => t.id === shot.viewingTakeId) || shot.takes[0];
  const adopted = take.id === shot.adoptedTakeId;
  const inputs = canvasInputs(w.project, shot.id);
  const localScene = workingScene(shot);
  const scene = localScene || inputs.scene;
  const [prompt, setPrompt] = useState(shot.prompt),
    [title, setTitle] = useState(shot.title);
  const [mode, setMode] = useState<"scene" | "reference" | "finish">(
    scene ? "scene" : "finish",
  );
  const [revise, setRevise] = useState(false),
    [count, setCount] = useState<CandidateCount>(1),
    [uploading, setUploading] = useState(false),
    [drop, setDrop] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null),
    videoInput = useRef<HTMLInputElement>(null),
    importing = useRef(false);
  const production = useProduction(shot);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusRevision, setStatusRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    let live = true;
    setStatusError("");
    studioAI
      .status()
      .then((value) => {
        if (live) setStatus(value);
      })
      .catch((error) => {
        if (live) {
          setStatus(null);
          setStatusError(error.message);
        }
      });
    return () => {
      live = false;
    };
  }, [active, w.modal, statusRevision]);
  const attached = w.project.assets.filter((a) =>
    shot.referenceAssetIds?.includes(a.id),
  );
  const jobs = w.jobs.filter(
    (j) =>
      j.projectId === w.project.id &&
      j.shotId === shot.id &&
      j.provider === "pipeline",
  );
  const runningJob = jobs.find(
      (j) => j.status === "running" || j.status === "queued",
    ),
    job = runningJob || jobs[0];
  const running = !!runningJob;
  const result =
    job &&
    (shot.takes.find((t) => t.id === job.id) ||
      shot.takes.find((t) => t.id === job.id + "-source"));
  const reviseScene = !scene || mode === "scene" || revise;
  const needsBrief = reviseScene || mode === "finish";
  const missing: string[] = [];
  if (status) {
    if ((reviseScene || mode === "finish") && !status.orchestratorReady)
      missing.push("AI 连接");
    if (reviseScene && !status.sceneReady) missing.push("场景模型");
    if (mode === "finish" && !status.videoReady) missing.push("视频模型");
    if (mode === "finish" && !status.publisherReady)
      missing.push("运动参考发布服务");
  }
  const canGenerate =
    !!status &&
    !statusError &&
    !missing.length &&
    !production.busy &&
    !running &&
    !uploading &&
    (!needsBrief || !!(prompt.trim() || inputs.text));
  const empty =
    !take.scene &&
    !take.videoUrl &&
    !take.assetId &&
    (take.label === "等待上传或生成" || take.label === "Reference");
  useEffect(() => setPrompt(shot.prompt), [shot.prompt]);
  useEffect(() => setTitle(shot.title), [shot.title]);
  function select() {
    if (w.selected !== shot.id) w.select(shot.id);
  }
  function savePrompt() {
    if (prompt === shot.prompt) return;
    w.update((p) => {
      const target = p.shots.find((s) => s.id === shot.id);
      if (target) target.prompt = prompt;
    }, "Edit node prompt");
  }
  function viewTake(id: string) {
    select();
    w.execute([
      { tool: "take.preview", targetId: shot.id, args: { takeId: id } },
    ]);
  }
  async function upload(files: FileList | File[]) {
    if (importing.current) return;
    const media = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    if (!media.length) {
      w.notify("请选择图片或视频文件。");
      return;
    }
    importing.current = true;
    setUploading(true);
    select();
    try {
      await w.upload(media, shot.id);
    } finally {
      importing.current = false;
      setUploading(false);
    }
  }
  async function generate() {
    if (!canGenerate) return;
    savePrompt();
    const submitted = await production.submitBatch({
      instruction: prompt,
      mode,
      reviseScene,
      referenceIds: shot.referenceAssetIds,
      count: mode === "finish" ? count : 1,
    });
    if (submitted)
      w.notify(
        "已提交 " + submitted.length + " 个候选，完成后到候选卡组挑选。",
      );
  }
  function edit(tab: string) {
    select();
    w.setSceneOpen(false);
    w.setInspectorTab(tab);
    w.setInspectorOpen(true);
  }
  function options() {
    savePrompt();
    w.openDirector({
      shotId: shot.id,
      instruction: prompt,
      mode,
      reviseScene,
      candidateCount: count,
      referenceAssetIds: shot.referenceAssetIds,
    });
  }
  return (
    <article
      className={
        "mw-flow-shot " + (active ? "active " : "") + (drop ? "dragover" : "")
      }
      data-shot={shot.id}
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes("Files") ||
          e.dataTransfer.types.includes("mouva/asset")
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
          setDrop(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrop(false);
        const assetId = e.dataTransfer.getData("mouva/asset");
        if (assetId) {
          select();
          w.attachAssets(shot.id, [assetId]);
        } else void upload(e.dataTransfer.files);
      }}
    >
      <header className="mw-flow-node-label">
        <Icon name={take.scene ? "box" : "video"} size={14} />
        <input
          className="nodrag"
          aria-label={tr("节点名称")}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title !== shot.title)
              w.execute([
                {
                  tool: "clip.update",
                  targetId: shot.id,
                  args: { title: title.trim() },
                },
              ]);
            else if (!title.trim()) setTitle(shot.title);
          }}
        />
      </header>
      <div className="mw-flow-media-frame">
        {empty ? (
          <div className="mw-flow-empty">
            <Icon name="video" size={64} />
            <div>
              <span>{tr("开始创作")}</span>
              <button
                className="nodrag"
                onClick={() => videoInput.current?.click()}
              >
                <Icon name="upload" size={17} />
                {tr("上传视频素材")}
              </button>
              <button
                className="nodrag"
                onClick={() => imageInput.current?.click()}
              >
                <Icon name="image" size={17} />
                {tr("上传图片作为参考")}
              </button>
            </div>
          </div>
        ) : active ? (
          <div>
            <CanvasTakePreview key={take.id} shot={shot} />
          </div>
        ) : (
          <Photo media={take.image || shot.image} label={shot.title} />
        )}
        {!empty && (
          <div className="mw-flow-takes nodrag nopan">
            <Icon name="layers" size={13} />
            <select
              aria-label={tr("镜头版本 · ") + shot.title}
              value={take.id}
              onChange={(e) => viewTake(e.target.value)}
            >
              {shot.takes.map((t) => (
                <option key={t.id} value={t.id}>
                  {tr(t.label)}
                  {tr(t.id === shot.adoptedTakeId ? " · 已采用" : "")}
                </option>
              ))}
            </select>
            <span>
              {(take.duration ?? take.scene?.duration ?? shot.duration).toFixed(
                1,
              )}
              {tr("s")}
            </span>
          </div>
        )}
        {drop && (
          <div className="mw-flow-drop">
            <Icon name="upload" size={34} />
            {tr("松开以添加到此节点")}
          </div>
        )}
      </div>
      <CanvasPorts />

      {active && (
        <CanvasComposer
          nodeId={shot.id}
          toolbar={
            <>
              <button onClick={options} title={tr("在 Agent 中继续生成")}>
                <Icon name="spark" size={16} />
                {tr("生成新版本")}
              </button>
              <button
                disabled={!adopted}
                onClick={() => edit("edit")}
                title={tr("裁剪、变速、调色与画面变换")}
              >
                <Icon name="scissors" size={16} />
                {tr("剪辑")}
              </button>
              <button
                disabled={!adopted}
                onClick={() => {
                  select();
                  w.execute([
                    {
                      tool: "text.add",
                      targetId: shot.id,
                      args: { text: "添加字幕" },
                    },
                  ]);
                  edit("settings");
                }}
              >
                <Icon name="text" size={16} />
                {tr("字幕")}
              </button>
              {localScene && (
                <button onClick={() => w.openScene(shot.id)}>
                  <Icon name="box" size={16} />
                  {tr("编辑 3D")}
                </button>
              )}
              {!adopted && (
                <button
                  className="accent"
                  onClick={() =>
                    w.execute([
                      {
                        tool: "take.adopt",
                        targetId: shot.id,
                        args: { takeId: take.id, fitDuration: true },
                      },
                    ])
                  }
                >
                  <Icon name="check" size={16} />
                  {tr("采用此版本")}
                </button>
              )}
              <button
                onClick={() => {
                  select();
                  w.setModal("compare");
                }}
                title={tr("比较版本")}
              >
                <Icon name="layers" size={16} />
              </button>
              <button
                onClick={() => {
                  select();
                  w.setModal("takes");
                }}
                title={tr("收藏、比较与重抽")}
              >
                <Icon name="spark" size={16} />
                {tr("候选卡组")}
              </button>
              <button
                onClick={() => actions.duplicate([shot.id])}
                title={tr("复制节点")}
              >
                <Icon name="copy" size={16} />
              </button>
              <button
                onClick={() => actions.remove([shot.id])}
                title={tr("删除节点")}
              >
                <Icon name="trash" size={16} />
              </button>
            </>
          }
        >
          <div className="mw-flow-composer-top">
            <button onClick={() => actions.showAssets(shot.id)}>
              <Icon name="plus" size={14} />
              {tr("参考")}
            </button>
            <button
              disabled={uploading}
              onClick={() => imageInput.current?.click()}
            >
              <Icon name="image" size={14} />
              {tr("上传图片")}
            </button>
            <button
              disabled={uploading}
              onClick={() => videoInput.current?.click()}
            >
              <Icon name="video" size={14} />
              {tr("上传视频")}
            </button>
            {inputs.count > 0 && (
              <span className="mw-flow-input-count">
                <Icon name="link" size={12} />
                {tr(inputs.count)}
                {tr("个上游输入")}
              </span>
            )}
            <button
              className="mw-flow-expand"
              onClick={options}
              aria-label={tr("展开生成设置")}
            >
              <Icon name="expand" size={15} />
            </button>
          </div>
          <div className="mw-flow-composer-body">
            {!!attached.length && (
              <div className="mw-flow-reference-strip">
                {attached.map((a) => (
                  <div key={a.id} title={a.name}>
                    <button
                      onClick={() => {
                        const candidate = shot.takes.find(
                          (t) => t.assetId === a.id,
                        );
                        if (candidate) viewTake(candidate.id);
                      }}
                    >
                      {a.image ? (
                        <Photo media={a.image} />
                      ) : (
                        <Icon name="video" size={22} />
                      )}
                      <span>{a.name}</span>
                    </button>
                    <button
                      className="mw-flow-reference-remove"
                      aria-label={tr("移除参考 ") + a.name}
                      onClick={() =>
                        w.update((p) => {
                          const s = p.shots.find((s) => s.id === shot.id);
                          if (s)
                            s.referenceAssetIds = s.referenceAssetIds?.filter(
                              (id) => id !== a.id,
                            );
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              aria-label={tr("生成描述 · ") + shot.title}
              value={prompt}
              maxLength={8000}
              onChange={(e) => setPrompt(e.target.value)}
              onBlur={savePrompt}
              placeholder={tr(
                "描述你想生成的画面、主体动作和运镜；可连接文本与参考图片节点。",
              )}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void generate();
                }
              }}
            />
            {scene && mode !== "scene" && (
              <label className="mw-flow-revise">
                <input
                  type="checkbox"
                  checked={revise}
                  onChange={(e) => setRevise(e.target.checked)}
                />
                {tr("同时根据描述修改 3D 场景")}
              </label>
            )}
            {mode === "finish" && (
              <div className="mw-flow-round-options">
                <span>
                  <Icon name="layers" size={14} />
                  {tr("本轮候选")}
                </span>
                <div role="group" aria-label={tr("本轮候选数量")}>
                  {([1, 2, 4] as const).map((n) => (
                    <button
                      key={n}
                      aria-pressed={count === n}
                      disabled={production.busy || running}
                      onClick={() => setCount(n)}
                    >
                      {tr(n)}
                      {tr("张")}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    select();
                    w.setModal("takes");
                  }}
                >
                  {tr("挑选版本")}
                  <Icon name="arrow" size={13} />
                </button>
                {count > 1 && (
                  <small>
                    {tr("每张独立生成与计费 · 沿用同一源场景")}
                    {tr(reviseScene ? "，每张分别修改" : "")}
                  </small>
                )}
              </div>
            )}
          </div>
          <div className="mw-flow-composer-bottom">
            <Icon
              name={
                mode === "scene"
                  ? "box"
                  : mode === "reference"
                    ? "play"
                    : "spark"
              }
              size={16}
            />
            <select
              aria-label={tr("生成输出")}
              value={mode}
              disabled={production.busy || running}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="scene">{tr("可编辑 3D 场景")}</option>
              <option value="reference">{tr("运动预览")}</option>
              <option value="finish">{tr("Seedance · 视频成片")}</option>
            </select>
            <i />
            <button
              onClick={() => edit("prompt")}
              title={tr("设置画幅与分辨率")}
            >
              <Icon name="video" size={14} />
              {tr(shot.aspectRatio)} · {tr(shot.resolution)}
            </button>
            <button onClick={options} title={tr("时长与生成设置")}>
              {tr(
                scene?.duration ??
                  Math.max(4, Math.min(30, Math.round(shot.duration))),
              )}
              {tr("s")}
              <Icon name="sliders" size={14} />
            </button>
            <button
              className="mw-flow-generate"
              onClick={() => void generate()}
              disabled={!canGenerate}
              aria-label={tr("生成当前节点")}
              title={tr("生成 · Ctrl + Enter")}
            >
              {running || production.busy ? (
                <span className="mw-flow-spinner" />
              ) : (
                <Icon name="arrow" size={21} />
              )}
            </button>
          </div>
          <div className="mw-flow-composer-notices">
            {(!!missing.length || !!statusError) && (
              <div className="mw-flow-error" role="status">
                {statusError ? (
                  tr(statusError)
                ) : (
                  <>
                    {tr("需要配置：")}{" "}
                    {missing.map((item) => tr(item)).join(" / ")}
                  </>
                )}
                <button onClick={() => w.setModal("ai-settings")}>
                  {tr("服务设置")}
                </button>
                <button onClick={() => setStatusRevision((value) => value + 1)}>
                  {tr("重新检查")}
                </button>
              </div>
            )}
            {uploading && (
              <p className="mw-flow-status">{tr("正在导入素材…")}</p>
            )}
            {job && (
              <div className={"mw-flow-status " + job.status}>
                <button onClick={() => w.setModal("jobs")}>
                  {tr(running ? "正在生成 · " : "")}
                  {tr(
                    job.status === "failed"
                      ? "生成遇到问题，点击查看"
                      : job.phase || job.status,
                  )}
                </button>
                {result && (
                  <button onClick={() => viewTake(result.id)}>
                    {tr(result.videoUrl ? "查看视频" : "查看 3D 场景")} →
                  </button>
                )}
              </div>
            )}
            {(attached.some((a) => a.kind === "video") ||
              inputs.assetIds.some((id) =>
                w.project.assets.some((a) => a.id === id && a.kind === "video"),
              )) && (
              <p className="mw-flow-status">
                {tr("上传视频用于预览和剪辑；AI 成片由 3D 运动参考驱动。")}
              </p>
            )}
            {production.error && (
              <div className="mw-flow-error" role="alert">
                {tr(production.error)}
                <button onClick={() => w.setModal("ai-settings")}>
                  {tr("服务设置")}
                </button>
              </div>
            )}
          </div>
        </CanvasComposer>
      )}
      <input
        ref={imageInput}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInput}
        type="file"
        hidden
        multiple
        accept="video/*"
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />
    </article>
  );
});
