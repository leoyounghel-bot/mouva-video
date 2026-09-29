import type { Project } from "../types";

// Validate imported graph data before React Flow consumes parent/child links.
export function validateCanvas(p: Project) {
  const graph = p.canvas;
  if (!graph) return;
  if (
    graph.version !== 1 ||
    !Array.isArray(graph.items) ||
    !Array.isArray(graph.edges) ||
    graph.items.length + p.shots.length > 250 ||
    graph.edges.length > 5000
  )
    throw new Error("Invalid canvas graph.");
  if (!p.graph || typeof p.graph !== "object" || Array.isArray(p.graph))
    throw new Error("Invalid canvas positions.");
  for (const point of Object.values(p.graph))
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
      throw new Error("Invalid canvas node position.");
  const ids = new Set(p.shots.map((shot) => shot.id));
  const groups = new Set<string>();
  for (const item of graph.items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      ids.has(item.id) ||
      !["image", "audio", "text", "script", "group"].includes(item.kind) ||
      typeof item.title !== "string" ||
      item.title.length > 300 ||
      (item.text !== undefined &&
        (typeof item.text !== "string" || item.text.length > 8000)) ||
      (item.assetId !== undefined &&
        !p.assets.some((asset) => asset.id === item.assetId))
    )
      throw new Error("Invalid canvas node.");
    ids.add(item.id);
    if (item.kind === "group") groups.add(item.id);
    for (const size of [item.width, item.height])
      if (size !== undefined && (!Number.isFinite(size) || size <= 0))
        throw new Error("Invalid canvas group size.");
  }
  const grouped = new Set<string>();
  for (const item of graph.items) {
    if (item.members === undefined) continue;
    if (item.kind !== "group" || !Array.isArray(item.members))
      throw new Error("Invalid canvas group.");
    for (const member of item.members) {
      if (!ids.has(member) || groups.has(member) || grouped.has(member))
        throw new Error(
          "Canvas groups cannot overlap or contain other groups.",
        );
      grouped.add(member);
    }
  }
  const edgeIds = new Set<string>(),
    pairs = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (
      !edge ||
      typeof edge.id !== "string" ||
      !edge.id ||
      edgeIds.has(edge.id) ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      groups.has(edge.source) ||
      groups.has(edge.target) ||
      edge.source === edge.target
    )
      throw new Error("Invalid canvas connection.");
    const pair = JSON.stringify([edge.source, edge.target]);
    if (pairs.has(pair)) throw new Error("Duplicate canvas connection.");
    pairs.add(pair);
    edgeIds.add(edge.id);
    outgoing.set(edge.source, [
      ...(outgoing.get(edge.source) || []),
      edge.target,
    ]);
  }
  const visiting = new Set<string>(),
    done = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id))
      throw new Error("Canvas connections cannot form a cycle.");
    if (done.has(id)) return;
    visiting.add(id);
    for (const next of outgoing.get(id) || []) visit(next);
    visiting.delete(id);
    done.add(id);
  }
  for (const id of ids) visit(id);
}
