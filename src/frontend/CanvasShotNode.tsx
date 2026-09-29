import { memo, useEffect, useRef, useState } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import type { Shot } from "./types";
import { useWorkspace } from "./context";
import { Icon, Photo } from "./Primitives";
import { CanvasTakePreview } from "./CanvasTakePreview";
import { workingScene } from "./native/templates";
import { useProduction } from "./native/useProduction";
import { CanvasPorts } from "./canvas/CanvasPorts";
import { useCanvasActions } from "./canvas/context";
import { canvasInputs } from "./canvas/model";

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
    [uploading, setUploading] = useState(false),
    [drop, setDrop] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null),
    videoInput = useRef<HTMLInputElement>(null),
    importing = useRef(false);
  const production = useProduction(shot);
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
  const canGenerate =
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
    const submitted = await production.submit({
      instruction: prompt,
      mode,
      reviseScene,
      referenceIds: shot.referenceAssetIds,
    });
    if (submitted)
      w.notify("已开始生成「" + shot.title + "」，结果会保留为新版本。");
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
          aria-label="节点名称"
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
              <span>开始创作</span>
              <button
                className="nodrag"
                onClick={() => videoInput.current?.click()}
              >
                <Icon name="upload" size={17} />
                上传视频素材
              </button>
              <button
                className="nodrag"
                onClick={() => imageInput.current?.click()}
              >
                <Icon name="image" size={17} />
                上传图片作为参考
              </button>
            </div>
          </div>
        ) : active ? (
          <div className="nodrag nopan nowheel">
            <CanvasTakePreview key={take.id} shot={shot} />
          </div>
        ) : (
          <Photo media={take.image || shot.image} label={shot.title} />
        )}
        {!empty && (
          <div className="mw-flow-takes nodrag">
            <Icon name="layers" size={13} />
            <select
              aria-label={"镜头版本 · " + shot.title}
              value={take.id}
              onChange={(e) => viewTake(e.target.value)}
            >
              {shot.takes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {t.id === shot.adoptedTakeId ? " · 已采用" : ""}
                </option>
              ))}
            </select>
            <span>
              {(take.duration ?? take.scene?.duration ?? shot.duration).toFixed(
                1,
              )}
              s
            </span>
          </div>
        )}
        {drop && (
          <div className="mw-flow-drop">
            <Icon name="upload" size={34} />
            松开以添加到此节点
          </div>
        )}
      </div>
      <CanvasPorts />
      <NodeToolbar
        isVisible={active}
        position={Position.Top}
        offset={40}
        className="mw-flow-toolbar nodrag nopan"
      >
        <button
          disabled={!adopted}
          onClick={() => edit("edit")}
          title="裁剪、变速、调色与画面变换"
        >
          <Icon name="scissors" size={16} />
          剪辑
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
          字幕
        </button>
        {localScene && (
          <button onClick={() => w.openScene(shot.id)}>
            <Icon name="box" size={16} />
            编辑 3D
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
            采用此版本
          </button>
        )}
        <button
          onClick={() => {
            select();
            w.setModal("compare");
          }}
          title="比较版本"
        >
          <Icon name="layers" size={16} />
        </button>
        <button onClick={() => actions.duplicate([shot.id])} title="复制节点">
          <Icon name="copy" size={16} />
        </button>
        <button onClick={() => actions.remove([shot.id])} title="删除节点">
          <Icon name="trash" size={16} />
        </button>
      </NodeToolbar>
      <NodeToolbar
        isVisible={active}
        position={Position.Bottom}
        offset={16}
        className="mw-flow-composer nodrag nopan nowheel"
      >
        <div className="mw-flow-composer-top">
          <button onClick={() => actions.showAssets(shot.id)}>
            <Icon name="plus" size={14} />
            参考
          </button>
          <button
            disabled={uploading}
            onClick={() => imageInput.current?.click()}
          >
            <Icon name="image" size={14} />
            上传图片
          </button>
          <button
            disabled={uploading}
            onClick={() => videoInput.current?.click()}
          >
            <Icon name="video" size={14} />
            上传视频
          </button>
          {inputs.count > 0 && (
            <span className="mw-flow-input-count">
              <Icon name="link" size={12} />
              {inputs.count} 个上游输入
            </span>
          )}
          <button
            className="mw-flow-expand"
            onClick={options}
            aria-label="展开生成设置"
          >
            <Icon name="expand" size={15} />
          </button>
        </div>
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
                  aria-label={"移除参考 " + a.name}
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
          aria-label={"生成描述 · " + shot.title}
          value={prompt}
          maxLength={8000}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={savePrompt}
          placeholder="描述你想生成的画面、主体动作和运镜；可连接文本与参考图片节点。"
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
            同时根据描述修改 3D 场景
          </label>
        )}
        <div className="mw-flow-composer-bottom">
          <Icon
            name={
              mode === "scene" ? "box" : mode === "reference" ? "play" : "spark"
            }
            size={16}
          />
          <select
            aria-label="生成输出"
            value={mode}
            disabled={production.busy || running}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="scene">可编辑 3D 场景</option>
            <option value="reference">运动预览</option>
            <option value="finish">Seedance · 视频成片</option>
          </select>
          <i />
          <button onClick={() => edit("prompt")} title="设置画幅与分辨率">
            <Icon name="video" size={14} />
            {shot.aspectRatio} · {shot.resolution}
          </button>
          <button onClick={options} title="时长与生成设置">
            {scene?.duration ??
              Math.max(4, Math.min(30, Math.round(shot.duration)))}
            s<Icon name="sliders" size={14} />
          </button>
          <button
            className="mw-flow-generate"
            onClick={() => void generate()}
            disabled={!canGenerate}
            aria-label="生成当前节点"
            title="生成 · Ctrl + Enter"
          >
            {running || production.busy ? (
              <span className="mw-flow-spinner" />
            ) : (
              <Icon name="arrow" size={21} />
            )}
          </button>
        </div>
        {uploading && <p className="mw-flow-status">正在导入素材…</p>}
        {job && (
          <div className={"mw-flow-status " + job.status}>
            <button onClick={() => w.setModal("jobs")}>
              {running ? "正在生成 · " : ""}
              {job.status === "failed"
                ? "生成遇到问题，点击查看"
                : job.phase || job.status}
            </button>
            {result && (
              <button onClick={() => viewTake(result.id)}>
                {result.videoUrl ? "查看视频" : "查看 3D 场景"} →
              </button>
            )}
          </div>
        )}
        {(attached.some((a) => a.kind === "video") ||
          inputs.assetIds.some((id) =>
            w.project.assets.some((a) => a.id === id && a.kind === "video"),
          )) && (
          <p className="mw-flow-status">
            上传视频用于预览和剪辑；AI 成片由 3D 运动参考驱动。
          </p>
        )}
        {production.error && (
          <div className="mw-flow-error" role="alert">
            {production.error}
            <button onClick={() => w.setModal("ai-settings")}>服务设置</button>
          </div>
        )}
      </NodeToolbar>
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
