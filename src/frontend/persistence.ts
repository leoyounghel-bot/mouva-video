import { validateCanvas } from "./canvas/validation";
import { validateScene } from "./native/schema";
import { inspectVideo } from "./editor/media";
import { effects } from "./editor/commands";
import type { Project } from "./types";
import { demoProject } from "./demo";
import { workspaceKey } from "./auth/session";
const KEY = () => workspaceKey("mouva-ui-project-v1");
export const initialProject = (): Project => {
  try {
    const p = JSON.parse(localStorage.getItem(KEY()) || "null");
    if (p?.schemaVersion === 1 && Array.isArray(p.shots) && p.shots.length) {
      for (const s of p.shots)
        if (["Kling 2.1", "Wan 2.1", "Runway Gen-4"].includes(s.model))
          s.model = "Seedance 2.5";
      validateCanvas(p);
      return p;
    }
  } catch {}
  return structuredClone(demoProject);
};
export const persistProject = (p: Project) =>
  localStorage.setItem(KEY(), JSON.stringify(p));
function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(workspaceKey("mouva-ui-media"), 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function storeFile(key: string, file: File) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
export async function getFile(key: string) {
  const db = await database();
  const file = await new Promise<File | undefined>((resolve, reject) => {
    const req = db.transaction("files").objectStore("files").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return file;
}
export async function hydrateMedia(p: Project) {
  const copy = structuredClone(p);
  for (const a of copy.assets) {
    if (!a.fileKey) continue;
    const file = await getFile(a.fileKey);
    if (!file) continue;
    const old = a.url,
      url = URL.createObjectURL(file);
    a.url = url;
    if (a.image && "url" in a.image && a.image.url === old) a.image.url = url;
    if (a.kind === "video" && !a.duration) {
      try {
        const meta = await inspectVideo(file);
        a.duration = meta.duration;
        a.image = { url: meta.poster };
      } catch {
        /* Retain the original clip when browser metadata is unavailable. */
      }
    }
    for (const shot of copy.shots) {
      if ("url" in shot.image && shot.image.url === old) shot.image.url = url;
      for (const take of shot.takes) {
        if ("url" in take.image && take.image.url === old) take.image.url = url;
        if (take.videoUrl === old) take.videoUrl = url;
      }
    }
    for (const c of copy.characters)
      if ("url" in c.image && c.image.url === old) c.image.url = url;
  }
  return copy;
}
export function mergeRestoredMedia(
  current: Project,
  original: Project,
  restored: Project,
): Project {
  const copy = structuredClone(current),
    media = new Map<string, Project["assets"][number]>();
  for (const asset of copy.assets) {
    const before = original.assets.find((a) => a.id === asset.id),
      after = restored.assets.find((a) => a.id === asset.id);
    if (
      !before?.url ||
      !after?.url ||
      before.fileKey !== asset.fileKey ||
      before.url !== asset.url
    )
      continue;
    media.set(before.url, after);
    asset.url = after.url;
    if (after.duration) asset.duration = after.duration;
    if (JSON.stringify(asset.image) === JSON.stringify(before.image))
      asset.image = after.image;
  }
  const image = (ref: Project["shots"][number]["image"]) => {
    if (!ref || !("url" in ref)) return ref;
    const after = media.get(ref.url);
    return after ? after.image || { url: after.url! } : ref;
  };
  for (const shot of copy.shots) {
    shot.image = image(shot.image);
    for (const take of shot.takes) {
      take.image = image(take.image);
      const after = take.videoUrl ? media.get(take.videoUrl) : undefined;
      if (!after) continue;
      take.videoUrl = after.url;
      take.assetId = after.id;
      take.duration = after.duration;
      if (take.id === shot.adoptedTakeId && after.duration) {
        shot.duration = after.duration;
        shot.trimEnd = Math.min(shot.trimEnd, after.duration);
        shot.trimStart = Math.min(
          shot.trimStart,
          Math.max(0, shot.trimEnd - 0.04),
        );
        shot.layers = shot.layers
          .filter((l) => l.start < after.duration!)
          .map((l) => ({ ...l, end: Math.min(l.end, after.duration!) }));
        const e = effects(shot),
          length = (shot.trimEnd - shot.trimStart) / shot.speed;
        shot.edit = {
          ...e,
          fadeIn: Math.min(e.fadeIn, length),
          fadeOut: Math.min(e.fadeOut, length),
        };
      }
    }
  }
  for (const character of copy.characters)
    character.image = image(character.image);
  return copy;
}
export async function audioPeaks(file: File) {
  const context = new AudioContext();
  try {
    const data = await context.decodeAudioData(await file.arrayBuffer()),
      samples = data.getChannelData(0),
      peaks = Array.from({ length: 180 }, (_, i) => {
        const start = Math.floor((i * samples.length) / 180),
          end = Math.floor(((i + 1) * samples.length) / 180);
        let max = 0;
        for (
          let j = start;
          j < end;
          j += Math.max(1, Math.floor((end - start) / 300))
        )
          max = Math.max(max, Math.abs(samples[j]));
        return max;
      });
    return { peaks, duration: data.duration };
  } finally {
    await context.close();
  }
}
export function validateProject(value: unknown): asserts value is Project {
  const p = value as Project;
  if (
    !p ||
    p.schemaVersion !== 1 ||
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    !Array.isArray(p.shots) ||
    !p.shots.length ||
    p.shots.length > 100 ||
    !Array.isArray(p.assets) ||
    !Array.isArray(p.audio) ||
    !Array.isArray(p.characters)
  )
    throw new Error("This is not a Mouva UI project file.");
  const ids = new Set<string>();
  for (const s of p.shots) {
    if (
      typeof s.id !== "string" ||
      ids.has(s.id) ||
      !Number.isFinite(s.duration) ||
      s.duration <= 0 ||
      s.duration > 3600 ||
      !Number.isFinite(s.speed) ||
      s.speed <= 0 ||
      !Number.isFinite(s.trimStart) ||
      !Number.isFinite(s.trimEnd) ||
      s.trimStart < 0 ||
      s.trimEnd > s.duration ||
      s.trimEnd <= s.trimStart ||
      !Array.isArray(s.takes) ||
      !s.takes.length ||
      !Array.isArray(s.layers)
    )
      throw new Error("Invalid shot in project file.");
    ids.add(s.id);
    if (
      s.referenceAssetIds !== undefined &&
      (!Array.isArray(s.referenceAssetIds) ||
        s.referenceAssetIds.some(
          (id) => typeof id !== "string" || !p.assets.some((a) => a.id === id),
        ))
    )
      throw new Error("Invalid shot media reference.");
    for (const t of s.takes)
      if (t.scene) validateScene(t.scene, new Set(p.assets.map((a) => a.id)));
    if (s.nativeDraft)
      validateScene(s.nativeDraft.scene, new Set(p.assets.map((a) => a.id)));
    const refs = [s.image, ...s.takes.map((t) => t.image)];
    for (const ref of refs)
      if (
        !ref ||
        ("url" in ref && !/^(blob:|https?:|data:image\/)/.test(ref.url))
      )
        throw new Error("Invalid image reference.");
  }
  validateCanvas(p);
}
