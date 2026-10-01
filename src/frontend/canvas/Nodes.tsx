import { t as tr } from "../i18n";
import { memo, useEffect, useRef, useState } from "react";
import {
  NodeResizer,
  NodeToolbar,
  Position,
  useStore,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useWorkspace } from "../context";
import { CanvasShotNode } from "../CanvasShotNode";
import { Icon, Photo } from "../Primitives";
import { useCanvasActions } from "./context";
import { CanvasPorts } from "./CanvasPorts";
import { ensureCanvas, positionOf } from "./model";
const selectedCount = (state: { nodes: { selected?: boolean }[] }) =>
  state.nodes.reduce((n, item) => n + (item.selected ? 1 : 0), 0);
const ShotNode = memo(function ShotNode({ id, selected }: NodeProps) {
  const w = useWorkspace(),
    count = useStore(selectedCount);
  const shot = w.project.shots.find((s) => s.id === id);
  return shot ? (
    <CanvasShotNode shot={shot} active={!!selected && count === 1} />
  ) : null;
});
const MediaNode = memo(function MediaNode({ id, selected }: NodeProps) {
  const w = useWorkspace(),
    actions = useCanvasActions(),
    count = useStore(selectedCount);
  const item = w.project.canvas?.items.find((n) => n.id === id);
  const asset = w.project.assets.find((a) => a.id === item?.assetId);
  const [busy, setBusy] = useState(false),
    [drop, setDrop] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    importing = useRef(false);
  if (!item) return null;
  const audio = item.kind === "audio",
    active = !!selected && count === 1;
  async function upload(files: File[]) {
    if (importing.current) return;
    const allowed = files.filter((file) =>
      audio ? file.type.startsWith("audio/") : file.type.startsWith("image/"),
    );
    if (!allowed.length) {
      w.notify(audio ? "请选择音频文件。" : "请选择图片文件。");
      return;
    }
    const projectId = w.project.id;
    importing.current = true;
    setBusy(true);
    try {
      const assets = await w.upload(allowed);
      if (!assets.length) return;
      w.update((p) => {
        if (p.id !== projectId) throw new Error("请回到原项目后重新添加素材。");
        const target = ensureCanvas(p).items.find((n) => n.id === id);
        if (target) {
          target.assetId = assets[0].id;
          target.title = assets[0].name.slice(0, 300);
        }
      }, "Upload canvas media");
      const origin = positionOf(w.project, id);
      for (const [index, extra] of assets.slice(1).entries())
        actions.add(
          audio ? "audio" : "image",
          { x: origin.x + (index + 1) * 790, y: origin.y },
          undefined,
          extra.id,
        );
    } catch (e: any) {
      w.notify(e.message);
    } finally {
      importing.current = false;
      setBusy(false);
    }
  }
  function attach(assetId: string) {
    const asset = w.project.assets.find((a) => a.id === assetId);
    if (
      !asset ||
      (audio
        ? asset.kind !== "audio"
        : !["image", "model"].includes(asset.kind))
    ) {
      w.notify("请选择对应类型的素材。");
      return;
    }
    w.update((p) => {
      const target = ensureCanvas(p).items.find((n) => n.id === id);
      if (target) {
        target.assetId = asset.id;
        target.title = asset.name.slice(0, 300);
      }
    });
  }
  const track = w.project.audio.find((a) => a.assetId === asset?.id);
  return (
    <article
      className={
        "mw-flow-media " +
        (audio ? "audio " : "") +
        (active ? "active " : "") +
        (drop ? "dragover" : "")
      }
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes("Files") ||
          e.dataTransfer.types.includes("mouva/asset")
        ) {
          e.preventDefault();
          e.stopPropagation();
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
        if (assetId) attach(assetId);
        else void upload(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="mw-flow-node-label">
        <Icon
          name={audio ? "music" : asset?.kind === "model" ? "box" : "image"}
          size={14}
        />
        <span>{tr(item.title)}</span>
      </header>
      <div className="mw-flow-media-frame">
        {audio && asset?.url ? (
          <div className="mw-flow-audio-preview">
            <svg viewBox="0 0 580 100" aria-label={tr("音频波形")}>
              {(track?.peaks || []).map((peak, i, values) => (
                <path
                  key={i}
                  d={`M${(i * 580) / values.length} ${50 - peak * 45}v${peak * 90}`}
                  stroke="currentColor"
                  strokeWidth="2"
                />
              ))}
            </svg>
            <audio
              className="nodrag nopan"
              controls
              src={asset.url}
              preload="metadata"
            />
          </div>
        ) : asset?.image ? (
          <Photo media={asset.image} label={asset.name} />
        ) : (
          <div className="mw-flow-empty">
            <Icon
              name={audio ? "music" : asset?.kind === "model" ? "box" : "image"}
              size={64}
            />
            <div>
              <span>
                {tr(asset?.kind === "model" ? "3D 模型参考" : "开始创作")}
              </span>
              <button className="nodrag" onClick={() => input.current?.click()}>
                <Icon name="upload" size={17} />
                {tr(busy ? "正在导入…" : audio ? "上传音频" : "上传图片")}
              </button>
              {!audio && (
                <button
                  className="nodrag"
                  onClick={() => actions.add("video", undefined, id)}
                >
                  <Icon name="video" size={17} />
                  {tr("连接到视频生成")}
                </button>
              )}
            </div>
          </div>
        )}
        {drop && (
          <div className="mw-flow-drop">
            <Icon name="upload" size={34} />
            {tr("松开以替换素材")}
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
        <button onClick={() => input.current?.click()}>
          <Icon name="upload" size={16} />
          {tr("替换素材")}
        </button>
        <button onClick={() => actions.duplicate([id])}>
          <Icon name="copy" size={16} />
          {tr("复制")}
        </button>
        {asset?.url && (
          <a href={asset.url} download={asset.name}>
            <Icon name="download" size={16} />
            {tr("下载")}
          </a>
        )}
        <button onClick={() => actions.remove([id])} title={tr("删除节点")}>
          <Icon name="trash" size={16} />
        </button>
      </NodeToolbar>
      <NodeToolbar
        isVisible={active}
        position={Position.Bottom}
        offset={16}
        className="mw-flow-composer mw-flow-reference-composer nodrag nopan nowheel"
      >
        <div className="mw-flow-composer-top">
          <button onClick={() => input.current?.click()}>
            <Icon name="upload" size={15} />
            {tr(audio ? "上传音频" : "上传图片")}
          </button>
          <button onClick={() => actions.showAssets(id)}>
            <Icon name="box" size={15} />
            {tr("素材库")}
          </button>
          <span className="mw-flow-input-count">
            {tr(asset?.name || "可将文件直接拖入节点")}
          </span>
        </div>
        <p>
          {tr(
            audio
              ? "可在音频剪辑器中调整音量、声像与淡入淡出。"
              : "从右侧连接到视频或 3D 节点，让此素材参与生成。",
          )}
        </p>
        <div className="mw-flow-composer-bottom">
          {audio ? (
            <button
              disabled={!track}
              onClick={() => {
                w.setSelectedAudio(track?.id || "");
                w.setModal("audio");
              }}
            >
              <Icon name="sliders" size={16} />
              {tr("音频剪辑")}
            </button>
          ) : (
            <>
              <button onClick={() => actions.add("scene", undefined, id)}>
                <Icon name="box" size={16} />
                {tr("创建 3D 场景")}
              </button>
              <button onClick={() => actions.add("video", undefined, id)}>
                <Icon name="video" size={16} />
                {tr("创建视频节点")}
              </button>
            </>
          )}
        </div>
      </NodeToolbar>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={audio ? "audio/*" : "image/png,image/jpeg,image/webp"}
        onChange={(e) => {
          if (e.target.files) void upload(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </article>
  );
});
const TextNode = memo(function TextNode({ id, selected }: NodeProps) {
  const w = useWorkspace(),
    actions = useCanvasActions(),
    count = useStore(selectedCount);
  const item = w.project.canvas?.items.find((n) => n.id === id);
  const [text, setText] = useState(item?.text || "");
  useEffect(() => setText(item?.text || ""), [item?.text]);
  if (!item) return null;
  return (
    <article className="mw-flow-text">
      <header className="mw-flow-node-label">
        <Icon name={item.kind === "script" ? "stream" : "text"} size={14} />
        <span>{tr(item.title)}</span>
      </header>
      <div className="mw-flow-text-frame">
        <span>{tr(item.kind === "script" ? "分镜脚本" : "文本内容")}</span>
        <textarea
          className="nodrag nopan nowheel"
          aria-label={item.title}
          value={text}
          maxLength={8000}
          placeholder={tr(
            item.kind === "script"
              ? "写下故事、镜头顺序、主体与运镜…"
              : "输入文字，连接到下游节点作为生成描述…",
          )}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text !== item.text)
              w.update((p) => {
                const target = ensureCanvas(p).items.find((n) => n.id === id);
                if (target) target.text = text;
              }, "Edit canvas text");
          }}
        />
      </div>
      <CanvasPorts />
      <NodeToolbar
        isVisible={!!selected && count === 1}
        position={Position.Top}
        offset={40}
        className="mw-flow-toolbar nodrag nopan"
      >
        <button onClick={() => actions.add("video", undefined, id)}>
          <Icon name="video" size={16} />
          {tr("创建视频节点")}
        </button>
        <button onClick={() => actions.duplicate([id])}>
          <Icon name="copy" size={16} />
          {tr("复制")}
        </button>
        <button onClick={() => actions.remove([id])}>
          <Icon name="trash" size={16} />
          {tr("删除")}
        </button>
      </NodeToolbar>
    </article>
  );
});
const GroupNode = memo(function GroupNode({ id, selected }: NodeProps) {
  const w = useWorkspace();
  const item = w.project.canvas?.items.find((n) => n.id === id);
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={150}
        color="#8d8d8d"
        onResizeEnd={(_, size) =>
          w.update((p) => {
            const group = ensureCanvas(p).items.find((n) => n.id === id);
            if (group) {
              group.width = size.width;
              group.height = size.height;
            }
            p.graph[id] = { x: size.x, y: size.y };
          }, "Resize canvas group")
        }
      />
      <div className="mw-flow-group">
        <span className="mw-flow-group-label">{tr(item?.title || "分组")}</span>
      </div>
    </>
  );
});
export const canvasNodeTypes: NodeTypes = {
  shot: ShotNode,
  media: MediaNode,
  text: TextNode,
  canvasGroup: GroupNode,
};
