import type { SceneObject, SceneSpec, SceneTemplate } from "./schema";
import type { Shot, Project, Asset } from "../types";
export const templateInfo = [
  {
    id: "cards" as const,
    name: "Interface showcase",
    caption: "Layered screens. One seamless story.",
    icon: "layers",
  },
  {
    id: "brand" as const,
    name: "Brand opening",
    caption: "Make your first frame memorable.",
    icon: "text",
  },
  {
    id: "product" as const,
    name: "Product orbit",
    caption: "Every angle, thoughtfully composed.",
    icon: "box",
  },
];
export const nativeAssets: Asset[] = [
  {
    id: "native-ui-unified",
    name: "Mouva unified workspace",
    kind: "image",
    url: "/native/workspace.png",
    image: { url: "/native/workspace.png" },
    folder: "project",
  },
  {
    id: "native-ui-timeline",
    name: "Mouva timeline",
    kind: "image",
    url: "/native/timeline.png",
    image: { url: "/native/timeline.png" },
    folder: "project",
  },
  {
    id: "native-product",
    name: "Studio ceramic cup.glb",
    kind: "model",
    url: "/native/product.glb",
    folder: "project",
  },
];
export function ensureNativeAssets(p: Project) {
  for (const a of nativeAssets)
    if (!p.assets.some((x) => x.id === a.id)) p.assets.push(structuredClone(a));
}
function object(
  id: string,
  kind: SceneObject["kind"],
  extra: Partial<SceneObject> = {},
): SceneObject {
  return {
    id,
    name: id,
    kind,
    geometry: "torusKnot",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
    color: "#ffffff",
    opacity: 1,
    visible: true,
    assetId: null,
    text: "",
    motion: { preset: "none", start: 0, end: 6, amount: 1 },
    ...extra,
  };
}
export function createScene(template: SceneTemplate, duration = 6): SceneSpec {
  const s: SceneSpec = {
    schemaVersion: 1,
    engine: "three",
    template,
    title: templateInfo.find((t) => t.id === template)!.name,
    duration,
    fps: 30,
    seed: 42,
    background: "#171626",
    accent: "#a493ff",
    light: 1.4,
    camera: { azimuth: 0, elevation: 5, distance: 9, fov: 38, orbit: 0 },
    objects: [],
  };
  if (template === "cards")
    s.objects = [
      object("screen-left", "card", {
        name: "Timeline screen",
        position: [-2.3, 0.15, -0.5],
        rotation: [0, 22, -4],
        scale: 0.78,
        assetId: "native-ui-timeline",
        motion: { preset: "rise", start: 0, end: 1.8, amount: 1.4 },
      }),
      object("screen-right", "card", {
        name: "Second screen",
        position: [2.3, 0.15, -0.5],
        rotation: [0, -22, 4],
        scale: 0.78,
        assetId: "native-ui-timeline",
        motion: { preset: "rise", start: 0.3, end: 2.1, amount: 1.4 },
      }),
      object("screen-main", "card", {
        name: "Hero screen",
        position: [0, 0.3, 0.4],
        assetId: "native-ui-unified",
        motion: { preset: "rise", start: 0.6, end: 2.4, amount: 1.3 },
      }),
      object("headline", "text", {
        name: "Headline",
        position: [0, 2.05, 0],
        scale: 0.75,
        text: "One idea. Every possibility.",
        color: "#eeeaff",
        motion: { preset: "rise", start: 1, end: 2.5, amount: 0.3 },
      }),
      object("caption", "text", {
        name: "Caption",
        position: [0, -1.6, 0.1],
        scale: 0.38,
        text: "STREAM  /  CANVAS  /  TIMELINE",
        color: "#a493ff",
      }),
    ];
  if (template === "brand") {
    s.camera.distance = 8;
    s.objects = [
      object("brand-orbit", "shape", {
        name: "Orbit sculpture",
        position: [0, 0.25, -1],
        scale: 1.5,
        color: "#a493ff",
        motion: { preset: "spin", start: 0, end: duration, amount: 0.4 },
      }),
      object("brand-name", "text", {
        name: "Brand name",
        position: [0, 0.25, 1],
        scale: 1.6,
        text: "mouva",
        motion: { preset: "rise", start: 0, end: 1.8, amount: 0.5 },
      }),
      object("brand-line", "text", {
        name: "Tagline",
        position: [0, -0.85, 1],
        scale: 0.44,
        text: "A little idea becomes a movie.",
        color: "#ccc4f5",
        motion: { preset: "rise", start: 0.6, end: 2.5, amount: 0.3 },
      }),
    ];
  }
  if (template === "product") {
    s.background = "#e8e5ef";
    s.accent = "#9981e8";
    s.camera = {
      azimuth: 25,
      elevation: 13,
      distance: 8.5,
      fov: 38,
      orbit: 75,
    };
    s.objects = [
      object("product-model", "model", {
        name: "Ceramic cup",
        assetId: "native-product",
        position: [0, 0.1, 0],
        color: "#c5b9e9",
      }),
      object("product-title", "text", {
        name: "Product title",
        position: [0, 2, 0],
        scale: 0.6,
        text: "Made for everyday moments.",
        color: "#393145",
      }),
      object("product-caption", "text", {
        name: "Product caption",
        position: [0, -1.65, 0],
        scale: 0.32,
        text: "FORM  /  TEXTURE  /  LIGHT",
        color: "#736483",
      }),
    ];
  }
  for (const o of s.objects) {
    o.motion.start = Math.min(o.motion.start, duration * 0.6);
    o.motion.end = Math.max(
      o.motion.start + 0.05,
      Math.min(o.motion.end, duration),
    );
  }
  return s;
}
export function workingScene(s: Shot) {
  return s.nativeDraft?.baseTakeId === s.viewingTakeId
    ? s.nativeDraft.scene
    : s.takes.find((t) => t.id === s.viewingTakeId)?.scene;
}
export function adoptedScene(s: Shot) {
  return s.takes.find((t) => t.id === s.adoptedTakeId)?.scene;
}
export function sceneThumbnail(scene: SceneSpec) {
  const title = scene.title.replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="${scene.background}"/><circle cx="320" cy="163" r="92" fill="none" stroke="${scene.accent}" stroke-width="22" opacity=".5"/><rect x="196" y="94" width="248" height="144" rx="15" fill="${scene.accent}" opacity=".18"/><text x="320" y="175" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="36" fill="${scene.accent}">${scene.template === "brand" ? "mouva" : scene.template === "product" ? "3D" : "mouva studio"}</text><text x="320" y="294" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="22" fill="${scene.accent}">${title}</text></svg>`;
  return { url: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) };
}
export function addNativeTake(s: Shot, scene: SceneSpec, label: string) {
  const id = crypto.randomUUID();
  const parent = s.takes.find((t) => t.id === s.viewingTakeId);
  s.takes.push({
    id,
    label,
    image: sceneThumbnail(scene),
    status: "succeeded",
    createdAt: new Date().toISOString(),
    duration: scene.duration,
    productionJobId: parent?.productionJobId,
    parentTakeId: s.viewingTakeId,
    instruction: parent?.instruction,
    scene: structuredClone(scene),
  });
  s.viewingTakeId = id;
  delete s.nativeDraft;
  return id;
}
