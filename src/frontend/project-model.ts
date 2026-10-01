import type { Project, Shot } from "./types.ts";

export const EMPTY_IMAGE = {
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="620" height="350"><rect width="620" height="350" fill="#262626"/></svg>',
    ),
};

export function createVideoProject(
  name: string,
  aspectRatio = "16:9",
): Project {
  if (!name.trim() || name.trim().length > 100)
    throw new Error("请输入 1–100 字的项目名称。");
  if (!["16:9", "9:16", "1:1"].includes(aspectRatio))
    throw new Error("请选择支持的画面比例。");
  const id = crypto.randomUUID(),
    takeId = crypto.randomUUID();
  const shot: Shot = {
    id,
    title: "视频节点 1",
    kind: "video",
    description: "",
    prompt: "",
    duration: 6,
    trimStart: 0,
    trimEnd: 6,
    speed: 1,
    image: { ...EMPTY_IMAGE },
    model: "Seedance 2.5",
    resolution: "720p",
    aspectRatio,
    status: "idle",
    characterId: null,
    characterStrength: 0.8,
    preserveCharacter: false,
    location: "",
    tags: [],
    referenceAssetIds: [],
    adoptedTakeId: takeId,
    viewingTakeId: takeId,
    binding: "follow",
    takes: [
      {
        id: takeId,
        label: "等待上传或生成",
        image: { ...EMPTY_IMAGE },
        status: "idle",
        duration: 6,
        createdAt: new Date().toISOString(),
      },
    ],
    repair: { start: 0, end: 1, tool: "range", prompt: "" },
    layers: [],
  };
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: name.trim(),
    description: "",
    tags: [],
    shots: [shot],
    audio: [],
    assets: [],
    characters: [],
    canvas: { version: 1, items: [], edges: [] },
    graph: { [id]: { x: 0, y: 0 } },
    updatedAt: new Date().toISOString(),
  };
}
