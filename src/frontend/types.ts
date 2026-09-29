import type { SceneSpec } from "./native/schema";
export type View = "stream" | "canvas" | "timeline";
export type Section = "create" | "assets" | "characters" | "library";
export type MediaRef =
  | { sheet: "timeline" | "canvas"; rect: [number, number, number, number] }
  | { url: string };
export type Stage =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
export type Shot = {
  referenceAssetIds?: string[];
  edit?: ClipEdit;
  kind?: "video" | "native" | "hybrid";
  nativeDraft?: { baseTakeId: string; scene: SceneSpec };
  id: string;
  title: string;
  description: string;
  prompt: string;
  duration: number;
  image: MediaRef;
  model: string;
  resolution: string;
  aspectRatio: string;
  status: Stage;
  progress?: number;
  characterId: string | null;
  characterStrength: number;
  preserveCharacter: boolean;
  location: string;
  tags: string[];
  trimStart: number;
  trimEnd: number;
  speed: number;
  adoptedTakeId: string;
  viewingTakeId: string;
  binding: "follow" | "pinned";
  takes: Take[];
  repair: {
    start: number;
    end: number;
    tool: "range" | "frame" | "inpaint" | "extend";
    mask?: { x: number; y: number; width: number; height: number };
    prompt: string;
  };
  layers: TextLayer[];
};
export type Take = {
  id: string;
  assetId?: string;
  duration?: number;
  label: string;
  image: MediaRef;
  status: Stage;
  createdAt: string;
  videoUrl?: string;
  scene?: SceneSpec;
  sourceSceneKey?: string;
  referenceUrl?: string;
  productionJobId?: string;
  parentTakeId?: string;
  instruction?: string;
};
export type TextLayer = {
  id: string;
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  opacity: number;
};
export type AudioClip = {
  sourceStart?: number;
  id: string;
  name: string;
  kind: "voice" | "music" | "sfx";
  start: number;
  duration: number;
  gain: number;
  pan: number;
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
  solo: boolean;
  assetId?: string;
  peaks: number[];
  demo: boolean;
};
export type Asset = {
  id: string;
  name: string;
  kind: "image" | "video" | "audio" | "model";
  image?: MediaRef;
  url?: string;
  size?: number;
  duration?: number;
  fileKey?: string;
  folder: "project" | "uploads";
};
export type Character = {
  id: string;
  name: string;
  role: string;
  description: string;
  image: MediaRef;
  strength: number;
};
export type CanvasItem = {
  id: string;
  kind: "image" | "audio" | "text" | "script" | "group";
  title: string;
  assetId?: string;
  text?: string;
  members?: string[];
  width?: number;
  height?: number;
};
export type CanvasLink = { id: string; source: string; target: string };
export type CanvasGraph = {
  version: 1;
  items: CanvasItem[];
  edges: CanvasLink[];
};
export type Project = {
  canvas?: CanvasGraph;
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  tags: string[];
  shots: Shot[];
  audio: AudioClip[];
  assets: Asset[];
  characters: Character[];
  graph: Record<string, { x: number; y: number }>;
  updatedAt: string;
};
export type GenerateRequest = {
  requestId: string;
  projectId: string;
  shotId: string;
  prompt: string;
  model: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  character: { id: string; strength: number; preserve: boolean } | null;
  referenceAssetIds: string[];
};
export type RepairRequest = GenerateRequest & {
  baseTakeId: string;
  tool: Shot["repair"]["tool"];
  sourceRange: { startSeconds: number; endSeconds: number };
  mask: Shot["repair"]["mask"] | null;
};
export type ExportRequest = {
  requestId: string;
  projectId: string;
  format: "mp4" | "webm";
  resolution: string;
  aspectRatio: string;
  fps: 24 | 25 | 30 | 60;
  includeAudio: boolean;
  includeSubtitles: boolean;
};
export type RemoteJob = {
  id: string;
  projectId: string;
  shotId?: string;
  kind: "generate" | "repair" | "export";
  status: Stage;
  phase?: string;
  progress?: number;
  outputUrl?: string;
  provider?: "seedance" | "pipeline" | "editor";
  scene?: SceneSpec;
  sourceSceneKey?: string;
  referenceUrl?: string;
  mode?: "scene" | "reference" | "finish";
  sourceReady?: boolean;
  baseTakeId?: string;
  parentJobId?: string;
  instruction?: string;
  scope?: "scene" | "object";
  objectId?: string;
  createdAt?: string;
  events?: { stage: string; phase: string; at: string }[];
  plan?: { summary: string; continuityNotes: string[]; orchestrator: string };
  stage?:
    | "orchestrate"
    | "scene"
    | "reference"
    | "publish"
    | "video"
    | "complete";
  error?: string;
};
export type ClipEdit = {
  scale: number;
  x: number;
  y: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  opacity: number;
  fadeIn: number;
  fadeOut: number;
  volume: number;
  muted: boolean;
  fit: "contain" | "cover";
};
export type EditorSession = {
  view: View;
  section: Section;
  selectedShotId: string;
  playhead: number;
  graphZoom: number;
  timelineZoom: number;
  inspectorTab: string;
};
