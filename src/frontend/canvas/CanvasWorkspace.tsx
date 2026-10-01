import { t as tr, text } from "../i18n";
import { useLearning } from "../learning/LearningContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  SelectionMode,
  applyNodeChanges,
  useReactFlow,
  useStore,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Viewport,
} from "@xyflow/react";
import { useWorkspace } from "../context";
import type { Project, CanvasItem } from "../types";
import { Icon, Photo } from "../Primitives";
import { ClipToolbar } from "../editor/EditingTools";
import { MiniTimeline } from "../Timeline";
import { CanvasActionsContext, type CanvasActions } from "./context";
import {
  addCanvasItem,
  cleanCanvas,
  connectNodes,
  ensureCanvas,
  positionOf,
  type AddKind,
  type Point,
} from "./model";
import { canvasNodeTypes } from "./Nodes";
import {
  canvasWheelAction,
  createPanFrame,
  wheelPanDelta,
  zoomAtPoint,
  type MouseMode,
} from "./wheel";

const edgeOptions = {
  type: "default",
  style: { stroke: "#9aabb5", strokeWidth: 1.6 },
  interactionWidth: 18,
};
const snapGrid: [number, number] = [20, 20];
const proOptions = { hideAttribution: true };
const selectorZoom = (s: { transform: [number, number, number] }) =>
  s.transform[2];
function ZoomValue() {
  const zoom = useStore(selectorZoom);
  return <>{tr(Math.round(zoom * 100))}%</>;
}
function graphNodes(
  project: Project,
  previous: Node[] = [],
  selected?: string,
  dragging = false,
): Node[] {
  const before = new Map(previous.map((n) => [n.id, n]));
  const items = project.canvas?.items || [];
  const groups = items.filter((n) => n.kind === "group");
  const parent = new Map(
    groups.flatMap((g) => (g.members || []).map((id) => [id, g.id] as const)),
  );
  const nodes = [
    ...groups.map((item) => ({ id: item.id, type: "canvasGroup", item })),
    ...project.shots.map((shot) => ({
      id: shot.id,
      type: "shot",
      item: undefined,
    })),
    ...items
      .filter((n) => n.kind !== "group")
      .map((item) => ({
        id: item.id,
        type: ["text", "script"].includes(item.kind) ? "text" : "media",
        item,
      })),
  ];
  return nodes.map(({ id, type, item }) => {
    const old = before.get(id),
      parentId = type === "canvasGroup" ? undefined : parent.get(id),
      absolute = positionOf(project, id),
      origin = parentId ? positionOf(project, parentId) : { x: 0, y: 0 };
    return {
      ...old,
      id,
      type,
      parentId,
      position:
        dragging && old
          ? old.position
          : { x: absolute.x - origin.x, y: absolute.y - origin.y },
      data: old?.data || {},
      selected: old?.selected ?? id === selected,
      deletable: false,
      ...(type === "canvasGroup"
        ? {
            style: { width: item?.width || 800, height: item?.height || 500 },
            zIndex: -1,
            connectable: false,
          }
        : { style: undefined, connectable: true }),
    };
  });
}
function worldPosition(node: Node, all: Node[]): Point {
  if (!node.parentId) return node.position;
  const parent = all.find((n) => n.id === node.parentId);
  const origin = parent ? worldPosition(parent, all) : { x: 0, y: 0 };
  return { x: origin.x + node.position.x, y: origin.y + node.position.y };
}
type Menu = {
  x: number;
  y: number;
  point: Point;
  nodeId?: string;
  sourceId?: string;
  targetId?: string;
};
type CopyBundle = {
  projectId: string;
  shots: Project["shots"];
  items: CanvasItem[];
  positions: Project["graph"];
  edges: NonNullable<Project["canvas"]>["edges"];
};

export function CanvasWorkspace() {
  const learning = useLearning();
  const w = useWorkspace(),
    flow = useReactFlow(),
    live = useRef(w);
  live.current = w;
  const root = useRef<HTMLElement>(null),
    uploadInput = useRef<HTMLInputElement>(null),
    dragging = useRef(false),
    importing = useRef(false);
  const wheelScrolling = useRef(false);
  const previewGesture = useRef(false);
  const [mouseMode, setMouseMode] = useState<MouseMode>(() => {
    try {
      const saved = localStorage.getItem(workspaceKey("mouva-canvas-mouse"));
      if (saved === "touch" || saved === "wheel") return saved;
    } catch {
      /* Mouse preferences are optional. */
    }
    return /Mac|iPhone|iPad/.test(navigator.platform) ? "touch" : "wheel";
  });
  const cameraSize = useRef({ width: 0, height: 0 });
  const clipboard = useRef<CopyBundle | null>(null);
  const [nodes, setNodes] = useState<Node[]>(() =>
    graphNodes(w.project, [], w.selected),
  );
  const [hand, setHand] = useState(false),
    [snap, setSnap] = useState(false),
    [minimap, setMinimap] = useState(false),
    [links, setLinks] = useState(true);
  const [menu, setMenu] = useState<Menu | null>(null),
    [zoomMenu, setZoomMenu] = useState(false);
  const [panel, setPanel] = useState<"assets" | "history" | "keys" | null>(
      null,
    ),
    [assetTarget, setAssetTarget] = useState<string | undefined>();
  const [timeline, setTimeline] = useState(false),
    [busy, setBusy] = useState(false);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const edgeIds = useRef(new Set<string>());
  edgeIds.current = new Set(selectedEdges);
  const pendingSelection = useRef<string[] | null>(null);
  useEffect(() => {
    setNodes((old) => {
      const next = graphNodes(w.project, old, w.selected, dragging.current);
      const pending = pendingSelection.current;
      if (!pending) return next;
      pendingSelection.current = null;
      return next.map((node) => ({
        ...node,
        selected: pending.includes(node.id),
      }));
    });
  }, [w.project]);
  useEffect(() => {
    setNodes((old) => {
      if (old.filter((node) => node.selected).length > 1) return old;
      return old.map((node) => ({ ...node, selected: node.id === w.selected }));
    });
  }, [w.selected]);
  const edges = useMemo<Edge[]>(() => {
    const ids = new Set([
      ...w.project.shots.map((s) => s.id),
      ...(w.project.canvas?.items || []).map((n) => n.id),
    ]);
    return (w.project.canvas?.edges || [])
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        ...e,
        ...edgeOptions,
        hidden: !links,
        selected: edgeIds.current.has(e.id),
      }));
  }, [w.project.canvas?.edges, w.project.shots, links, selectedEdges]);
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((old) =>
        applyNodeChanges(
          changes.filter((c) => c.type !== "remove"),
          old,
        ),
      ),
    [],
  );
  const centerPoint = useCallback(() => {
    const rect = root.current?.getBoundingClientRect();
    return flow.screenToFlowPosition({
      x: rect ? rect.left + rect.width / 2 - 200 : 500,
      y: rect ? rect.top + rect.height / 2 - 180 : 300,
    });
  }, [flow]);
  const add = useCallback(
    (
      kind: AddKind,
      at?: Point,
      source?: string,
      assetId?: string,
      target?: string,
    ) => {
      const current = live.current;
      const origin =
        source || target
          ? positionOf(current.project, (source || target)!)
          : centerPoint();
      let id = "";
      const position =
        at ||
        (source || target
          ? { x: origin.x + (source ? 810 : -810), y: origin.y }
          : { ...origin });
      if (!at && !source && !target) {
        const occupied = Object.values(current.project.graph);
        let offset = 0;
        while (
          occupied.some(
            (p) =>
              Math.abs(p.x - position.x) < 700 &&
              Math.abs(p.y - position.y) < 450,
          )
        ) {
          offset++;
          position.x = origin.x + (offset % 3) * 790;
          position.y = origin.y + Math.floor(offset / 3) * 720;
        }
      }
      try {
        current.update((p) => {
          id = addCanvasItem(p, kind, position, source, assetId);
          if (target) connectNodes(p, id, target);
        }, "Add canvas node");
        setMenu(null);
        pendingSelection.current = [id];
        if (kind === "video" || kind === "scene") current.select(id);
        requestAnimationFrame(
          () =>
            void flow.setCenter(position.x + 310, position.y + 250, {
              zoom: Math.min(flow.getZoom(), 0.8),
              duration: 220,
            }),
        );
      } catch (e: any) {
        current.notify(e.message);
      }
    },
    [centerPoint, flow],
  );
  const selectedIds = useCallback(
    () =>
      flow
        .getNodes()
        .filter((n) => n.selected)
        .map((n) => n.id),
    [flow],
  );
  const remove = useCallback((ids: string[], selectedEdges: string[] = []) => {
    const current = live.current;
    try {
      current.update((p) => {
        const canvas = ensureCanvas(p),
          deleting = new Set(ids);
        for (const item of canvas.items)
          if (item.kind === "group" && deleting.has(item.id))
            for (const child of item.members || []) deleting.add(child);
        const remaining = p.shots.filter((s) => !deleting.has(s.id));
        if (!remaining.length)
          throw new Error("项目至少保留一个镜头；可以先新建镜头再删除。");
        p.shots = remaining;
        canvas.items = canvas.items.filter((n) => !deleting.has(n.id));
        canvas.edges = canvas.edges.filter(
          (e) =>
            !deleting.has(e.source) &&
            !deleting.has(e.target) &&
            !selectedEdges.includes(e.id),
        );
        for (const id of deleting) delete p.graph[id];
        cleanCanvas(p);
      }, "Remove canvas selection");
      setSelectedEdges([]);
      setMenu(null);
    } catch (e: any) {
      current.notify(e.message);
    }
  }, []);
  const copy = useCallback((ids: string[]) => {
    const p = live.current.project,
      selected = new Set(ids);
    for (const group of p.canvas?.items || [])
      if (group.kind === "group" && selected.has(group.id))
        for (const id of group.members || []) selected.add(id);
    return structuredClone({
      projectId: p.id,
      shots: p.shots.filter((s) => selected.has(s.id)),
      items: (p.canvas?.items || []).filter((n) => selected.has(n.id)),
      positions: Object.fromEntries(
        [...selected].map((id) => [id, positionOf(p, id)]),
      ),
      edges: (p.canvas?.edges || []).filter((e) => selected.has(e.target)),
    });
  }, []);
  const paste = useCallback((bundle: CopyBundle) => {
    const current = live.current;
    if (bundle.projectId !== current.project.id) {
      current.notify("请在原项目中粘贴节点，避免素材引用丢失。");
      return;
    }
    const ids = [
        ...bundle.shots.map((s) => s.id),
        ...bundle.items.map((n) => n.id),
      ],
      mapping = new Map(ids.map((id) => [id, crypto.randomUUID()]));
    try {
      current.update((p) => {
        const canvas = ensureCanvas(p);
        if (
          p.shots.length + bundle.shots.length > 100 ||
          p.shots.length + canvas.items.length + ids.length > 250
        )
          throw new Error("已达到项目节点数量上限。");
        for (const shot of bundle.shots)
          p.shots.push({
            ...structuredClone(shot),
            id: mapping.get(shot.id)!,
            title: shot.title + " 副本",
          });
        for (const item of bundle.items)
          canvas.items.push({
            ...structuredClone(item),
            id: mapping.get(item.id)!,
            title: (item.title + " 副本").slice(0, 300),
            ...(item.members
              ? {
                  members: item.members
                    .map((id) => mapping.get(id)!)
                    .filter(Boolean),
                }
              : {}),
          });
        for (const id of ids) {
          const pos = bundle.positions[id];
          p.graph[mapping.get(id)!] = { x: pos.x + 70, y: pos.y + 70 };
        }
        for (const edge of bundle.edges) {
          const source = mapping.get(edge.source) || edge.source;
          const target = mapping.get(edge.target)!;
          if (
            p.shots.some((s) => s.id === source) ||
            canvas.items.some((n) => n.id === source)
          )
            canvas.edges.push({ id: crypto.randomUUID(), source, target });
        }
      }, "Duplicate canvas nodes");
      pendingSelection.current = [...mapping.values()];
      setMenu(null);
    } catch (e: any) {
      current.notify(e.message);
    }
  }, []);
  const duplicate = useCallback(
    (ids: string[]) => paste(copy(ids)),
    [copy, paste],
  );
  const group = useCallback(() => {
    const selected = flow
      .getNodes()
      .filter((n) => n.selected && n.type !== "canvasGroup");
    if (selected.length < 2) {
      live.current.notify("按住 Shift 选择至少两个节点，或在空白处拖出选框。");
      return;
    }
    const all = flow.getNodes(),
      positions = selected.map((n) => ({
        node: n,
        point: worldPosition(n, all),
      }));
    const x = Math.min(...positions.map((n) => n.point.x)) - 35,
      y = Math.min(...positions.map((n) => n.point.y)) - 60;
    const width =
      Math.max(
        ...positions.map((n) => n.point.x + (n.node.measured?.width || 620)),
      ) -
      x +
      35;
    const height =
      Math.max(
        ...positions.map((n) => n.point.y + (n.node.measured?.height || 350)),
      ) -
      y +
      35;
    try {
      live.current.update((p) => {
        const canvas = ensureCanvas(p),
          id = addCanvasItem(p, "group", { x, y });
        for (const existing of canvas.items)
          if (existing.members)
            existing.members = existing.members.filter(
              (member) => !selected.some((n) => n.id === member),
            );
        const item = canvas.items.find((n) => n.id === id)!;
        Object.assign(item, {
          members: selected.map((n) => n.id),
          width,
          height,
        });
      }, "Group canvas nodes");
      setMenu(null);
    } catch (e: any) {
      live.current.notify(e.message);
    }
  }, [flow]);
  const ungroup = useCallback((id: string) => {
    live.current.update((p) => {
      const canvas = ensureCanvas(p);
      canvas.items = canvas.items.filter((item) => item.id !== id);
      delete p.graph[id];
      cleanCanvas(p);
    }, "Ungroup canvas nodes");
    setMenu(null);
  }, []);
  const openMenu = useCallback(
    (
      x: number,
      y: number,
      nodeId?: string,
      sourceId?: string,
      targetId?: string,
    ) => {
      const rect = root.current?.getBoundingClientRect();
      setMenu({
        x: Math.min(
          (rect?.width || innerWidth) - 245,
          Math.max(8, x - (rect?.left || 0)),
        ),
        y: Math.min(
          (rect?.height || innerHeight) - 370,
          Math.max(55, y - (rect?.top || 0)),
        ),
        point: flow.screenToFlowPosition({ x, y }),
        nodeId,
        sourceId,
        targetId,
      });
      setZoomMenu(false);
    },
    [flow],
  );
  const showAssets = useCallback((targetId?: string) => {
    setAssetTarget(targetId);
    setPanel("assets");
  }, []);
  const upload = useCallback(
    async (files: File[], at?: Point, targetId?: string) => {
      if (importing.current || !files.length) return;
      const current = live.current,
        projectId = current.project.id;
      const targetShot = current.project.shots.find(
        (shot) => shot.id === targetId,
      );
      const targetItem = current.project.canvas?.items.find(
        (item) => item.id === targetId,
      );
      if (targetId) {
        files = files.filter((file) =>
          targetShot
            ? /^(image|video)\//.test(file.type)
            : targetItem?.kind === "audio"
              ? file.type.startsWith("audio/")
              : file.type.startsWith("image/") || /\.glb$/i.test(file.name),
        );
        if (!files.length) {
          current.notify("请选择此节点对应类型的素材。");
          return;
        }
      }
      importing.current = true;
      setBusy(true);
      try {
        const assets = await current.upload(files, targetShot?.id, null),
          point =
            at ||
            (targetId ? positionOf(current.project, targetId) : centerPoint());
        if (!assets.length || targetShot) return;
        current.update((p) => {
          if (p.id !== projectId)
            throw new Error("请回到原项目后重新添加节点。");
          const target = p.canvas?.items.find((item) => item.id === targetId);
          if (targetItem && !target)
            throw new Error("素材节点已不存在，请从素材库重新添加。");
          if (target) {
            target.assetId = assets[0].id;
            target.title = assets[0].name.slice(0, 300);
          }
          (target ? assets.slice(1) : assets).forEach((asset, i) =>
            addCanvasItem(
              p,
              asset.kind === "video"
                ? "video"
                : asset.kind === "audio"
                  ? "audio"
                  : "image",
              {
                x: point.x + ((i + (target ? 1 : 0)) % 3) * 790,
                y: point.y + Math.floor((i + (target ? 1 : 0)) / 3) * 600,
              },
              undefined,
              asset.id,
            ),
          );
        }, "Import media nodes");
      } catch (e: any) {
        current.notify(e.message);
      } finally {
        importing.current = false;
        setBusy(false);
      }
    },
    [centerPoint],
  );
  const actions = useMemo<CanvasActions>(
    () => ({
      add,
      remove,
      duplicate,
      group,
      openMenu,
      showAssets,
      upload,
      composerBottomInset: timeline ? 300 : 84,
    }),
    [add, remove, duplicate, group, openMenu, showAssets, upload, timeline],
  );
  const savePositions = useCallback(() => {
    const current = live.current,
      all = flow.getNodes();
    current.update((p) => {
      ensureCanvas(p);
      const ids = new Set([
        ...p.shots.map((s) => s.id),
        ...p.canvas!.items.map((n) => n.id),
      ]);
      for (const n of all)
        if (ids.has(n.id)) p.graph[n.id] = worldPosition(n, all);
    }, "Move canvas nodes");
    dragging.current = false;
  }, [flow]);
  const onConnect = useCallback((connection: Connection) => {
    try {
      live.current.update(
        (p) => connectNodes(p, connection.source, connection.target),
        "Connect canvas inputs",
      );
    } catch (e: any) {
      live.current.notify(e.message);
    }
  }, []);
  const arrange = useCallback(() => {
    const current = live.current;
    current.update((p) => {
      const canvas = ensureCanvas(p);
      const groups = canvas.items.filter((n) => n.kind === "group");
      const grouped = new Set(groups.flatMap((n) => n.members || []));
      const ids = [
        ...canvas.items.map((n) => n.id),
        ...p.shots.map((n) => n.id),
      ].filter((id) => !grouped.has(id));
      let x = 0,
        y = 0,
        rowHeight = 0;
      ids.forEach((id, i) => {
        if (i && i % 3 === 0) {
          x = 0;
          y += rowHeight + 300;
          rowHeight = 0;
        }
        const group = groups.find((n) => n.id === id),
          before = positionOf(p, id);
        p.graph[id] = { x, y };
        for (const member of group?.members || []) {
          const pos = positionOf(p, member);
          p.graph[member] = {
            x: pos.x + x - before.x,
            y: pos.y + y - before.y,
          };
        }
        x += (group?.width || 620) + 170;
        rowHeight = Math.max(rowHeight, group?.height || 350);
      });
    }, "Arrange canvas");
    requestAnimationFrame(
      () => void flow.fitView({ duration: 260, padding: 0.18, maxZoom: 1 }),
    );
    setMenu(null);
  }, [flow]);
  const onInit = useCallback(() => {
    const width = root.current?.clientWidth || innerWidth;
    const height = root.current?.clientHeight || innerHeight;
    cameraSize.current = { width, height };
    try {
      const saved = JSON.parse(
        localStorage.getItem(
          workspaceKey("mouva-canvas-camera:" + live.current.project.id),
        ) || "null",
      );
      if (
        saved &&
        [saved.x, saved.y, saved.zoom].every(Number.isFinite) &&
        saved.zoom >= 0.1 &&
        saved.zoom <= 8
      ) {
        void flow.setViewport({
          x:
            saved.x +
            (width - (saved.width > 0 ? saved.width : innerWidth)) / 2,
          y:
            saved.y +
            (height - (saved.height > 0 ? saved.height : innerHeight)) / 2,
          zoom: saved.zoom,
        });
        return;
      }
    } catch {
      /* A damaged viewport preference does not affect the project. */
    }
    const pos = positionOf(live.current.project, live.current.selected);
    void flow.setCenter(pos.x + 310, pos.y + 300, {
      zoom: Math.min(
        1,
        Math.max(0.3, Math.min((height - 210) / 570, (width - 100) / 660)),
      ),
    });
  }, [flow]);
  const onMoveEnd = useCallback((_: unknown, viewport: Viewport) => {
    if (wheelScrolling.current || previewGesture.current) return;
    try {
      localStorage.setItem(
        workspaceKey("mouva-canvas-camera:" + live.current.project.id),
        JSON.stringify({
          ...viewport,
          width: root.current?.clientWidth,
          height: root.current?.clientHeight,
        }),
      );
    } catch {
      /* Camera state is optional. */
    }
  }, []);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const observer = new ResizeObserver(() => {
      const next = { width: host.clientWidth, height: host.clientHeight };
      const previous = cameraSize.current;
      if (!next.width || !next.height || !previous.width || !previous.height)
        return;
      cameraSize.current = next;
      if (next.width === previous.width && next.height === previous.height)
        return;
      const viewport = flow.getViewport();
      void flow.setViewport({
        ...viewport,
        x: viewport.x + (next.width - previous.width) / 2,
        y: viewport.y + (next.height - previous.height) / 2,
      });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [flow]);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    const pan = createPanFrame({
      read: () => flow.getViewport(),
      write: (viewport) => {
        void flow.setViewport(viewport);
      },
      requestFrame: requestAnimationFrame,
      cancelFrame: cancelAnimationFrame,
    });
    const wheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        live.current.modal ||
        dragging.current ||
        previewGesture.current ||
        (!event.deltaX && !event.deltaY) ||
        !target?.closest(".react-flow")
      )
        return;
      if (
        target.closest(
          ".nowheel,input,textarea,select,audio,video,[contenteditable]",
        )
      ) {
        // Keep native control scrolling, without letting it zoom the canvas.
        event.stopPropagation();
        return;
      }
      if (!event.metaKey && canvasWheelAction(event, mouseMode) === "zoom") {
        pan.flush();
        clearTimeout(endTimer);
        wheelScrolling.current = false;
        return; // Preserve React Flow's original wheel zoom around the pointer.
      }
      event.preventDefault();
      event.stopPropagation();
      // Modified gestures must not turn into large pan movements.
      if (event.ctrlKey || event.metaKey) return;
      wheelScrolling.current = true;
      pan.push(
        wheelPanDelta(event, {
          width: host.clientWidth,
          height: host.clientHeight,
        }),
      );
      clearTimeout(endTimer);
      endTimer = setTimeout(() => {
        pan.flush();
        wheelScrolling.current = false;
        onMoveEnd(null, flow.getViewport());
      }, 150);
    };
    // A non-passive capture listener can suppress browser back/forward swipes
    // and handle horizontal input before the library interprets it as zoom.
    host.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => {
      host.removeEventListener("wheel", wheel, { capture: true });
      pan.flush();
      clearTimeout(endTimer);
      const wasScrolling = wheelScrolling.current;
      wheelScrolling.current = false;
      if (wasScrolling) onMoveEnd(null, flow.getViewport());
      pan.dispose();
    };
  }, [flow, onMoveEnd, mouseMode]);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let gesture: {
      id: number;
      startX: number;
      startY: number;
      moved: boolean;
      camera: Viewport;
      anchor: { x: number; y: number };
    } | null = null;
    let suppressClick = false;
    let zoomFrame = 0;
    let pendingZoom: Viewport | null = null;
    const flushZoom = () => {
      cancelAnimationFrame(zoomFrame);
      zoomFrame = 0;
      if (pendingZoom) {
        void flow.setViewport(pendingZoom);
        pendingZoom = null;
      }
    };
    const down = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const zoom = mouseMode === "touch" && event.ctrlKey;
      suppressClick = false;
      if (
        !zoom ||
        !event.isPrimary ||
        (event.button !== 0 && !(zoom && event.button === 2)) ||
        event.shiftKey ||
        live.current.modal ||
        dragging.current ||
        !(
          target?.closest(".mw-flow-media-frame") ||
          (zoom && target?.closest(".react-flow__pane"))
        ) ||
        target.closest(
          "button,input,textarea,select,a,label,audio,video,[contenteditable]",
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      gesture = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        camera: flow.getViewport(),
        anchor: {
          x: event.clientX - host.getBoundingClientRect().left,
          y: event.clientY - host.getBoundingClientRect().top,
        },
      };
      host.setPointerCapture(event.pointerId);
      previewGesture.current = true;
      host.classList.add("preview-zooming");
    };
    const move = (event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const moved =
        Math.hypot(
          event.clientX - gesture.startX,
          event.clientY - gesture.startY,
        ) > 3;
      if (!gesture.moved && !moved) return;
      gesture.moved = true;
      pendingZoom = zoomAtPoint(
        gesture.camera,
        gesture.anchor,
        Math.pow(2, (gesture.startY - event.clientY) * 0.006),
      );
      if (!zoomFrame) zoomFrame = requestAnimationFrame(flushZoom);
    };
    const end = (event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const finished = gesture;
      gesture = null;
      flushZoom();
      previewGesture.current = false;
      host.classList.remove("preview-zooming");
      if (host.hasPointerCapture(event.pointerId))
        host.releasePointerCapture(event.pointerId);
      onMoveEnd(null, flow.getViewport());
      suppressClick = finished.moved;
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const context = (event: MouseEvent) => {
      if (
        mouseMode === "touch" &&
        event.ctrlKey &&
        (event.target as Element)?.closest(".react-flow")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    host.addEventListener("pointerdown", down, true);
    host.addEventListener("pointermove", move, true);
    host.addEventListener("pointerup", end, true);
    host.addEventListener("pointercancel", end, true);
    host.addEventListener("lostpointercapture", end, true);
    host.addEventListener("click", click, true);
    host.addEventListener("contextmenu", context, true);
    return () => {
      host.removeEventListener("pointerdown", down, true);
      host.removeEventListener("pointermove", move, true);
      host.removeEventListener("pointerup", end, true);
      host.removeEventListener("pointercancel", end, true);
      host.removeEventListener("lostpointercapture", end, true);
      host.removeEventListener("click", click, true);
      host.removeEventListener("contextmenu", context, true);
      cancelAnimationFrame(zoomFrame);
      if (gesture) {
        if (host.hasPointerCapture(gesture.id))
          host.releasePointerCapture(gesture.id);
        previewGesture.current = false;
        host.classList.remove("preview-zooming");
      }
    };
  }, [flow, onMoveEnd, mouseMode]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        live.current.modal ||
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      const mod = e.ctrlKey || e.metaKey,
        name = e.key.toLowerCase();
      if (name === "escape") {
        setMenu(null);
        setPanel(null);
        setZoomMenu(false);
      }
      if (!mod && name === "v") setHand(false);
      if (!mod && name === "h") setHand(true);
      if (mod && name === "g") {
        e.preventDefault();
        group();
      }
      if (mod && name === "d") {
        e.preventDefault();
        duplicate(selectedIds());
      }
      if (mod && name === "c") {
        const ids = selectedIds();
        if (ids.length) {
          e.preventDefault();
          clipboard.current = copy(ids);
        }
      }
      if (
        (name === "delete" || name === "backspace") &&
        (selectedIds().length || edgeIds.current.size)
      ) {
        e.preventDefault();
        remove(selectedIds(), [...edgeIds.current]);
      }
      if (mod && name === "0") {
        e.preventDefault();
        void flow.fitView({ duration: 220, padding: 0.18, maxZoom: 1 });
      }
      if (mod && (name === "+" || name === "=")) {
        e.preventDefault();
        void flow.zoomIn({ duration: 150 });
      }
      if (mod && name === "-") {
        e.preventDefault();
        void flow.zoomOut({ duration: 150 });
      }
      if (e.altKey && e.shiftKey && name === "f") {
        e.preventDefault();
        arrange();
      }
    };
    const pasteFiles = (e: ClipboardEvent) => {
      if (
        live.current.modal ||
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) {
        e.preventDefault();
        void upload(files);
      } else if (clipboard.current) {
        e.preventDefault();
        paste(clipboard.current);
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("paste", pasteFiles);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("paste", pasteFiles);
    };
  }, [
    arrange,
    copy,
    duplicate,
    flow,
    group,
    paste,
    remove,
    selectedIds,
    upload,
  ]);
  function useAsset(assetId: string) {
    try {
      w.update((p) => {
        const asset = p.assets.find((a) => a.id === assetId);
        if (!asset) return;
        const item = ensureCanvas(p).items.find((n) => n.id === assetTarget);
        if (
          item &&
          ((item.kind === "audio" && asset.kind === "audio") ||
            (item.kind === "image" && ["image", "model"].includes(asset.kind)))
        ) {
          item.assetId = asset.id;
          item.title = asset.name.slice(0, 300);
          return;
        }
        if (item) throw new Error("请选择此节点对应类型的素材。");
        const at = assetTarget ? positionOf(p, assetTarget) : centerPoint();
        const id = addCanvasItem(
          p,
          asset.kind === "video"
            ? "video"
            : asset.kind === "audio"
              ? "audio"
              : "image",
          { x: at.x - (assetTarget ? 790 : 0), y: at.y },
          undefined,
          asset.id,
        );
        if (assetTarget) connectNodes(p, id, assetTarget);
      }, "Use canvas asset");
      setPanel(null);
    } catch (e: any) {
      w.notify(e.message);
    }
  }
  const addItems: [AddKind, string, string][] = [
    ["text", "text", "文本"],
    ["image", "image", "图片"],
    ["video", "video", "视频"],
    ["scene", "box", "3D 场景"],
    ["audio", "music", "音频"],
    ["script", "stream", "脚本"],
  ];
  return (
    <CanvasActionsContext.Provider value={actions}>
      <section
        ref={root}
        className={"mw-lib-canvas " + (hand ? "hand-mode" : "")}
        aria-label={tr("无限创作画布")}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={canvasNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={(changes: EdgeChange[]) => {
            setSelectedEdges((previous) => {
              const next = new Set(previous);
              for (const change of changes)
                if (change.type === "select") {
                  if (change.selected) next.add(change.id);
                  else next.delete(change.id);
                }
              return [...next];
            });
          }}
          onConnect={onConnect}
          defaultEdgeOptions={edgeOptions}
          proOptions={proOptions}
          onInit={onInit}
          onMoveEnd={onMoveEnd}
          onNodeDragStart={() => {
            dragging.current = true;
          }}
          onNodeDragStop={savePositions}
          onSelectionDragStart={() => {
            dragging.current = true;
          }}
          onSelectionDragStop={savePositions}
          onNodeClick={(_, node) => {
            setMenu(null);
            if (node.type === "shot" && w.selected !== node.id)
              w.select(node.id);
          }}
          onPaneClick={() => {
            setMenu(null);
            setZoomMenu(false);
          }}
          onPaneContextMenu={(e) => {
            e.preventDefault();
            openMenu(e.clientX, e.clientY);
          }}
          onNodeContextMenu={(e, node) => {
            e.preventDefault();
            openMenu(e.clientX, e.clientY, node.id);
          }}
          onEdgeClick={(e, edge) => {
            e.stopPropagation();
            setSelectedEdges([edge.id]);
            setNodes((old) => old.map((n) => ({ ...n, selected: false })));
            openMenu(e.clientX, e.clientY, "edge:" + edge.id);
          }}
          onConnectEnd={(e, state) => {
            if (
              state.isValid ||
              !state.fromNode ||
              (e.target as HTMLElement).closest(".react-flow__node") ||
              !(e.target as HTMLElement).closest(".react-flow__pane")
            )
              return;
            const point = "changedTouches" in e ? e.changedTouches[0] : e;
            openMenu(
              point.clientX,
              point.clientY,
              undefined,
              state.fromHandle?.type === "source"
                ? state.fromNode.id
                : undefined,
              state.fromHandle?.type === "target"
                ? state.fromNode.id
                : undefined,
            );
          }}
          onDragOver={(e) => {
            if (
              e.dataTransfer.types.includes("Files") ||
              e.dataTransfer.types.includes("mouva/asset")
            ) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const point = flow.screenToFlowPosition({
              x: e.clientX,
              y: e.clientY,
            });
            const assetId = e.dataTransfer.getData("mouva/asset");
            if (assetId) {
              const asset = w.project.assets.find((a) => a.id === assetId);
              if (asset)
                add(
                  asset.kind === "video"
                    ? "video"
                    : asset.kind === "audio"
                      ? "audio"
                      : "image",
                  point,
                  undefined,
                  asset.id,
                );
            } else void upload(Array.from(e.dataTransfer.files), point);
          }}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest(".react-flow__pane"))
              openMenu(e.clientX, e.clientY);
          }}
          minZoom={0.1}
          maxZoom={8}
          zoomOnDoubleClick={false}
          panOnDrag={[0, 1, 2]}
          panOnScroll={false}
          zoomOnScroll={mouseMode === "wheel"}
          zoomOnPinch={mouseMode === "touch"}
          zoomActivationKeyCode={null}
          nodesDraggable={!hand}
          nodesConnectable={!hand}
          elementsSelectable={!hand}
          selectionOnDrag={false}
          selectionKeyCode={hand ? null : "Shift"}
          selectionMode={SelectionMode.Partial}
          panActivationKeyCode="Space"
          multiSelectionKeyCode="Shift"
          deleteKeyCode={null}
          snapToGrid={snap}
          snapGrid={snapGrid}
          nodeDragThreshold={3}
          onlyRenderVisibleElements
          colorMode="dark"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={0.55}
            color="#3b3b3b"
            bgColor="#141414"
          />
          {minimap && (
            <MiniMap
              pannable
              zoomable={false}
              position="bottom-right"
              nodeColor="#454545"
              nodeStrokeColor="#737373"
              maskColor="#0008"
              style={{
                bottom: timeline ? 230 : 60,
                background: "#222",
                borderRadius: 10,
              }}
            />
          )}
        </ReactFlow>
        <div className="mw-flow-corner-tools">
          <button
            className={panel === "assets" ? "active" : ""}
            onClick={() => (panel === "assets" ? setPanel(null) : showAssets())}
          >
            <Icon name="box" size={16} />
            <span>{tr("资产管理")}</span>
          </button>
          <button onClick={arrange} title={tr("整理画布 Alt+Shift+F")}>
            <Icon name="canvas" size={16} />
          </button>
          <button
            className={minimap ? "active" : ""}
            onClick={() => setMinimap(!minimap)}
            title={tr("切换小地图")}
          >
            <Icon name="target" size={16} />
          </button>
          <button
            className={!links ? "active" : ""}
            onClick={() => setLinks(!links)}
            title={tr(links ? "隐藏连线" : "显示连线")}
          >
            <Icon name="link" size={16} />
          </button>
          <button
            className={snap ? "active" : ""}
            onClick={() => setSnap(!snap)}
            title={tr("网格吸附")}
          >
            <Icon name="move" size={16} />
          </button>
          <button
            onClick={() => void flow.zoomOut({ duration: 160 })}
            aria-label={tr("缩小画布")}
            title={tr("缩小画布")}
          >
            <Icon name="minus" size={16} />
          </button>
          <button
            onClick={() => {
              setZoomMenu(!zoomMenu);
              setMenu(null);
            }}
            title={tr("缩放选项")}
          >
            <ZoomValue />
          </button>
          <button
            onClick={() => void flow.zoomIn({ duration: 160 })}
            aria-label={tr("放大画布")}
            title={tr("放大画布")}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
        <div className="mw-flow-bottom-dock">
          <div className="mw-flow-dock-tools">
            <button
              className="mw-flow-add"
              aria-label={tr("添加节点")}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                if (menu) setMenu(null);
                else {
                  openMenu(rect.left, rect.top - 350);
                  setMenu(
                    (value) => value && { ...value, point: centerPoint() },
                  );
                }
              }}
            >
              <Icon name="plus" size={23} />
            </button>
            <button
              className={!hand ? "active" : ""}
              title={tr("选择 V")}
              onClick={() => setHand(false)}
            >
              <Icon name="cursor" size={20} />
            </button>
            <button
              className={hand ? "active" : ""}
              title={tr("移动 H / 空格")}
              onClick={() => setHand(true)}
            >
              <Icon name="hand" size={20} />
            </button>
            <button title={tr("素材库")} onClick={() => showAssets()}>
              <Icon name="box" size={20} />
            </button>
            <button
              title={tr("生成历史")}
              onClick={() => setPanel(panel === "history" ? null : "history")}
            >
              <Icon name="history" size={20} />
            </button>
            <button
              className={timeline ? "active" : ""}
              title={tr("展开剪辑时间线")}
              onClick={() => setTimeline(!timeline)}
            >
              <Icon name="timeline" size={20} />
            </button>
            <button
              title={text("画布教程", "Canvas lessons")}
              aria-label={text("画布教程", "Canvas lessons")}
              aria-pressed={learning.centerOpen || learning.state.open}
              onClick={learning.showCenter}
            >
              <Icon name="book" size={20} />
            </button>
            <button
              title={tr("快捷键")}
              onClick={() => setPanel(panel === "keys" ? null : "keys")}
            >
              <Icon name="more" size={20} />
            </button>
          </div>
        </div>
        {busy && (
          <div className="mw-flow-import-status">
            <span className="mw-flow-spinner" />
            {tr("正在导入素材…")}
          </div>
        )}
        {menu && (
          <div
            className="mw-flow-menu"
            style={{ left: Math.max(8, menu.x), top: Math.max(55, menu.y) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {menu.nodeId?.startsWith("edge:") ? (
              <button onClick={() => remove([], [menu.nodeId!.slice(5)])}>
                <Icon name="close" size={16} />
                {tr("断开连接")}
              </button>
            ) : menu.nodeId ? (
              <>
                <h4>{tr("节点操作")}</h4>
                <button onClick={() => duplicate([menu.nodeId!])}>
                  <Icon name="copy" size={16} />
                  {tr("复制节点")}
                  <span>{tr("Ctrl D")}</span>
                </button>
                <button
                  onClick={() => {
                    clipboard.current = copy([menu.nodeId!]);
                    setMenu(null);
                  }}
                >
                  <Icon name="copy" size={16} />
                  {tr("复制到剪贴板")}
                  <span>{tr("Ctrl C")}</span>
                </button>
                {w.project.canvas?.items.some(
                  (item) => item.id === menu.nodeId && item.kind === "group",
                ) ? (
                  <button onClick={() => ungroup(menu.nodeId!)}>
                    <Icon name="layers" size={16} />
                    {tr("解散分组")}
                  </button>
                ) : (
                  <button onClick={group}>
                    <Icon name="layers" size={16} />
                    {tr("选中节点编组")}
                    <span>{tr("Ctrl G")}</span>
                  </button>
                )}
                <button onClick={() => remove([menu.nodeId!])}>
                  <Icon name="trash" size={16} />
                  {tr("删除节点")}
                  <span>{tr("Delete")}</span>
                </button>
                <hr />
                <button
                  onClick={() => {
                    const node = flow.getNode(menu.nodeId!);
                    if (node)
                      void flow.fitView({
                        nodes: [node],
                        maxZoom: 1,
                        duration: 220,
                        padding: 0.3,
                      });
                    setMenu(null);
                  }}
                >
                  <Icon name="target" size={16} />
                  {tr("聚焦节点")}
                </button>
              </>
            ) : (
              <>
                <h4>
                  {tr(
                    menu.sourceId
                      ? "连接到新节点"
                      : menu.targetId
                        ? "添加上游输入"
                        : "添加节点",
                  )}
                </h4>
                {addItems.map(([kind, icon, label]) => (
                  <button
                    key={kind}
                    onClick={() =>
                      add(
                        kind,
                        menu.point,
                        menu.sourceId,
                        undefined,
                        menu.targetId,
                      )
                    }
                  >
                    <Icon name={icon} size={17} />
                    {tr(label)}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setTimeline(true);
                    setMenu(null);
                  }}
                >
                  <Icon name="scissors" size={17} />
                  {tr("视频剪辑")}
                </button>
                <hr />
                <button
                  onClick={() => {
                    setAssetTarget(undefined);
                    uploadInput.current?.click();
                    setMenu(null);
                  }}
                >
                  <Icon name="upload" size={17} />
                  {tr("上传素材")}
                </button>
                <button
                  onClick={() => {
                    showAssets();
                    setMenu(null);
                  }}
                >
                  <Icon name="box" size={17} />
                  {tr("从素材库选择")}
                </button>
              </>
            )}
          </div>
        )}
        {zoomMenu && (
          <div className="mw-flow-zoom-menu mw-flow-menu">
            <h4>
              {tr("画布缩放 ·")}
              <ZoomValue />
            </h4>
            <label className="mw-flow-mouse-mode">
              <span>{tr("鼠标类型")}</span>
              <select
                aria-label={tr("鼠标类型")}
                value={mouseMode}
                onChange={(event) => {
                  const mode = event.target.value as MouseMode;
                  setMouseMode(mode);
                  try {
                    localStorage.setItem(
                      workspaceKey("mouva-canvas-mouse"),
                      mode,
                    );
                  } catch {
                    /* Optional preference. */
                  }
                }}
              >
                <option value="touch">{tr("苹果鼠标 / 触控板")}</option>
                <option value="wheel">{tr("普通鼠标")}</option>
              </select>
            </label>
            <hr />
            <button onClick={() => void flow.zoomIn({ duration: 160 })}>
              {tr("放大")}
              <span>{tr("Ctrl +")}</span>
            </button>
            <button onClick={() => void flow.zoomOut({ duration: 160 })}>
              {tr("缩小")}
              <span>{tr("Ctrl −")}</span>
            </button>
            <button
              onClick={() => {
                void flow.fitView({ duration: 220, padding: 0.18, maxZoom: 1 });
                setZoomMenu(false);
              }}
            >
              {tr("适合屏幕")}
              <span>{tr("Ctrl 0")}</span>
            </button>
            <hr />
            {[0.5, 1, 2, 8].map((zoom) => (
              <button
                key={zoom}
                onClick={() => {
                  void flow.zoomTo(zoom, { duration: 180 });
                  setZoomMenu(false);
                }}
              >
                {tr("缩放至")}
                {tr(zoom * 100)}%
              </button>
            ))}
          </div>
        )}
        {panel && (
          <aside className="mw-flow-side-panel">
            <header>
              <strong>
                {tr(
                  panel === "assets"
                    ? "素材库"
                    : panel === "history"
                      ? "生成历史"
                      : "画布快捷键",
                )}
              </strong>
              <button
                aria-label={tr("关闭面板")}
                onClick={() => setPanel(null)}
              >
                <Icon name="close" size={18} />
              </button>
            </header>
            {panel === "assets" && (
              <>
                <button
                  className="mw-flow-panel-upload"
                  onClick={() => uploadInput.current?.click()}
                >
                  <Icon name="upload" size={16} />
                  {tr("上传图片、视频或音频")}
                </button>
                <p>
                  {tr(
                    assetTarget
                      ? "选择素材，添加到当前节点。"
                      : "选择或拖动素材，把它放到画布上。",
                  )}
                </p>
                <div className="mw-flow-asset-grid">
                  {w.project.assets
                    .filter((a) => a.url)
                    .map((asset) => (
                      <button
                        key={asset.id}
                        title={asset.name}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("mouva/asset", asset.id);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => useAsset(asset.id)}
                      >
                        {asset.image ? (
                          <Photo media={asset.image} label={asset.name} />
                        ) : (
                          <span>
                            <Icon
                              name={
                                asset.kind === "audio"
                                  ? "music"
                                  : asset.kind === "model"
                                    ? "box"
                                    : "video"
                              }
                              size={28}
                            />
                          </span>
                        )}
                        <strong>{asset.name}</strong>
                        <small>
                          {tr(
                            asset.kind === "image"
                              ? "图片"
                              : asset.kind === "video"
                                ? "视频"
                                : asset.kind === "audio"
                                  ? "音频"
                                  : "3D 模型",
                          )}
                        </small>
                      </button>
                    ))}
                </div>
              </>
            )}
            {panel === "history" && (
              <div className="mw-flow-history">
                {w.jobs.filter((j) => j.projectId === w.project.id).length ? (
                  w.jobs
                    .filter((j) => j.projectId === w.project.id)
                    .map((job) => (
                      <button key={job.id} onClick={() => w.setModal("jobs")}>
                        <Icon
                          name={job.outputUrl ? "video" : "box"}
                          size={20}
                        />
                        <span>
                          <strong>
                            {tr(
                              w.project.shots.find((s) => s.id === job.shotId)
                                ?.title || "生成任务",
                            )}
                          </strong>
                          <small>{tr(job.phase || job.status)}</small>
                        </span>
                        <Icon name="chevron" size={13} />
                      </button>
                    ))
                ) : (
                  <p>
                    {tr("还没有生成任务。选中节点，在下方输入描述开始创作。")}
                  </p>
                )}
              </div>
            )}
            {panel === "keys" && (
              <div className="mw-flow-key-list">
                {[
                  ["移动画布", "空白处拖动 / 空格 + 拖动 / H"],
                  ["移动节点", "拖动卡片画面或标题"],
                  ["上下 / 左右平移", "苹果鼠标任意方向轻扫"],
                  ["苹果鼠标缩放", "Control + 拖动 / Control + 轻扫"],
                  ["普通鼠标", "滚轮缩放 / Shift + 滚轮左右"],
                  ["选择节点", "V"],
                  ["框选", "Shift + 拖动"],
                  ["多选", "Shift + 单击"],
                  ["缩放", "缩放菜单 / Ctrl 或 ⌘ + 加减号"],
                  ["适合屏幕", "Ctrl 0"],
                  ["复制节点", "Ctrl D"],
                  ["复制 / 粘贴", "Ctrl C / V"],
                  ["编组", "Ctrl G"],
                  ["删除", "Delete"],
                  ["撤销 / 重做", "Ctrl Z / Ctrl Shift Z"],
                  ["整理画布", "Alt Shift F"],
                  ["提交生成", "Ctrl Enter"],
                ].map(([label, shortcut]) => (
                  <div key={label}>
                    <span>{tr(label)}</span>
                    <kbd>{tr(shortcut)}</kbd>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
        {timeline && (
          <div className="mw-flow-timeline-drawer">
            <header>
              <strong>
                <Icon name="scissors" size={16} />
                {tr("剪辑工作台")}
              </strong>
              <button
                onClick={() => {
                  w.setInspectorTab("edit");
                  w.setInspectorOpen(true);
                }}
              >
                <Icon name="sliders" size={16} />
                {tr("画面与音频参数")}
              </button>
              <button onClick={() => w.setView("timeline")}>
                <Icon name="expand" size={16} />
                {tr("完整时间线")}
              </button>
              <button
                aria-label={tr("关闭剪辑时间线")}
                onClick={() => setTimeline(false)}
              >
                <Icon name="close" size={17} />
              </button>
            </header>
            <ClipToolbar />
            <MiniTimeline />
          </div>
        )}
        <input
          ref={uploadInput}
          type="file"
          hidden
          multiple
          accept="image/*,video/*,audio/*,.glb"
          onChange={(e) => {
            if (e.target.files)
              void upload(
                Array.from(e.target.files),
                undefined,
                panel === "assets" ? assetTarget : undefined,
              );
            e.target.value = "";
          }}
        />
      </section>
    </CanvasActionsContext.Provider>
  );
}
import { workspaceKey } from "../auth/session";
