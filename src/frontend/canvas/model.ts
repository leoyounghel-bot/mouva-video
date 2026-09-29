import type { CanvasItem, Project, Shot } from "../types";
import { runCommands } from "../editor/commands";
import { nativeAssets, workingScene } from "../native/templates";
export type Point = { x: number; y: number };
export type AddKind = CanvasItem["kind"] | "video" | "scene";
export const EMPTY_IMAGE = {
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="620" height="350"><rect width="620" height="350" fill="#262626"/></svg>',
    ),
};
export function positionOf(p: Project, id: string): Point {
  const i = Math.max(
    0,
    p.shots.findIndex((s) => s.id === id),
  );
  const fallback = { x: (i % 3) * 790, y: Math.floor(i / 3) * 720 };
  if (p.canvas?.version === 1) return p.graph[id] || fallback;
  const old = p.graph[id] || { x: 0, y: 0 };
  return { x: fallback.x + old.x, y: fallback.y + old.y };
}
export function ensureCanvas(p: Project) {
  if (!p.canvas) {
    const positions = Object.fromEntries(
      p.shots.map((s) => [s.id, positionOf(p, s.id)]),
    );
    p.graph = { ...p.graph, ...positions };
    p.canvas = { version: 1, items: [], edges: [] };
  }
  return p.canvas;
}
export function addCanvasItem(
  p: Project,
  kind: AddKind,
  position: Point,
  source?: string,
  assetId?: string,
) {
  const canvas = ensureCanvas(p);
  if (p.shots.length + canvas.items.length >= 250)
    throw new Error("画布最多支持 250 个节点。");
  let id: string;
  if (kind === "video" || kind === "scene") {
    if (kind === "scene")
      for (const asset of nativeAssets)
        if (!p.assets.some((a) => a.id === asset.id))
          p.assets.push(structuredClone(asset));
    const next = runCommands(p, [
      {
        tool: "clip.add",
        args: {
          ...(assetId ? { assetId } : {}),
          ...(kind === "scene" ? { template: "brand" } : {}),
          title:
            (kind === "scene" ? "3D 场景 " : "视频节点 ") +
            (p.shots.length + 1),
        },
      },
    ]);
    Object.assign(p, next);
    const shot = p.shots.at(-1)!;
    id = shot.id;
    if (!assetId && kind === "video") {
      shot.status = "idle";
      shot.image = EMPTY_IMAGE;
      shot.takes[0].image = EMPTY_IMAGE;
      shot.takes[0].label = "等待上传或生成";
    }
  } else {
    id = crypto.randomUUID();
    const names = {
      image: "图片节点",
      audio: "音频节点",
      text: "文本节点",
      script: "脚本节点",
      group: "分组",
    };
    p.canvas!.items.push({
      id,
      kind,
      title: names[kind] + " " + (canvas.items.length + 1),
      ...(assetId ? { assetId } : {}),
      ...(["text", "script"].includes(kind) ? { text: "" } : {}),
    });
  }
  p.graph[id] = position;
  if (source) connectNodes(p, source, id);
  return id;
}
export function connectNodes(p: Project, source: string, target: string) {
  const canvas = ensureCanvas(p);
  if (source === target) throw new Error("不能连接节点自身。");
  const exists = (id: string) =>
    p.shots.some((s) => s.id === id) ||
    canvas.items.some((n) => n.id === id && n.kind !== "group");
  if (!exists(source) || !exists(target))
    throw new Error("连接的节点已不存在。");
  if (canvas.edges.some((e) => e.source === source && e.target === target))
    return;
  if (canvas.edges.length >= 5000) throw new Error("已达到画布连线数量上限。");
  const visited = new Set<string>();
  function reaches(id: string): boolean {
    if (id === source) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return canvas.edges
      .filter((e) => e.source === id)
      .some((e) => reaches(e.target));
  }
  if (reaches(target)) throw new Error("请保持工作流单向流动，避免循环连接。");
  canvas.edges.push({ id: crypto.randomUUID(), source, target });
}
export function canvasInputs(p: Project, shotId: string) {
  const assetIds = new Set<string>(),
    texts: string[] = [],
    visited = new Set<string>([shotId]);
  let sourceScene: ReturnType<typeof workingScene>;
  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const item = p.canvas?.items.find((n) => n.id === id);
    if (item?.assetId) assetIds.add(item.assetId);
    if (item?.text?.trim()) texts.push(item.text.trim());
    const shot = p.shots.find((s) => s.id === id);
    if (shot) {
      const take = shot.takes.find((t) => t.id === shot.viewingTakeId);
      if (take?.assetId) assetIds.add(take.assetId);
      for (const assetId of shot.referenceAssetIds || []) assetIds.add(assetId);
      sourceScene ||= workingScene(shot);
    }
    for (const edge of p.canvas?.edges.filter((e) => e.target === id) || [])
      visit(edge.source);
  }
  for (const edge of p.canvas?.edges.filter((e) => e.target === shotId) || [])
    visit(edge.source);
  return {
    assetIds: [...assetIds],
    text: texts.join("\n\n"),
    scene: sourceScene,
    count: visited.size - 1,
  };
}
export function cleanCanvas(p: Project) {
  if (!p.canvas) return;
  const ids = new Set([
    ...p.shots.map((s) => s.id),
    ...p.canvas.items.map((n) => n.id),
  ]);
  p.canvas.edges = p.canvas.edges.filter(
    (e) => ids.has(e.source) && ids.has(e.target),
  );
  for (const item of p.canvas.items)
    if (item.members) item.members = item.members.filter((id) => ids.has(id));
}
