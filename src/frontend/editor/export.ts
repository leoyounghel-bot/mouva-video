import type { Project } from "../types";
import { studioAI } from "../native/api";
import { workspaceHeaders, requireSignIn } from "../auth/session";
export async function exportSequence(
  project: Project,
  settings: Record<string, unknown>,
  notify: (s: string) => void,
) {
  const copy = structuredClone(project),
    urls = new Set<string>(),
    needed = new Set<string>();
  const solo = copy.audio.some(
    (a) =>
      !a.demo &&
      !a.muted &&
      a.solo &&
      copy.assets.some((x) => x.id === a.assetId && x.url),
  );
  copy.audio =
    settings.includeAudio === false
      ? []
      : copy.audio.filter((a) => !a.demo && !a.muted && (!solo || a.solo));
  for (const a of copy.audio) if (a.assetId) needed.add(a.assetId);
  for (const s of copy.shots) {
    const take = s.takes.find((t) => t.id === s.adoptedTakeId);
    if (!take || take.status !== "succeeded")
      throw new Error(s.title + " has no ready adopted take.");
    s.takes = [take];
    s.viewingTakeId = take.id;
    delete s.nativeDraft;
    if (take.videoUrl) {
      urls.add(take.videoUrl);
      delete take.scene;
    } else if (take.scene) {
      for (const object of take.scene.objects)
        if (object.assetId) needed.add(object.assetId);
    } else {
      const image = take.image || s.image;
      if ("url" in image) urls.add(image.url);
    }
  }
  copy.assets = copy.assets.filter((a) => needed.has(a.id));
  for (const a of copy.assets) {
    if (a.url) urls.add(a.url);
    else if (a.image && "url" in a.image) urls.add(a.image.url);
  }
  const replacements = new Map<string, string>();
  let index = 0;
  for (const url of urls) {
    index++;
    if (url.startsWith("/api/ai/editor/media/")) {
      replacements.set(url, url);
      continue;
    }
    notify("Preparing media " + index + " / " + urls.size + "…");
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(
        "A media file used by this sequence could not be read. Re-import the missing file.",
      );
    const blob = await response.blob();
    const upload = await fetch("/api/ai/editor/uploads", {
      method: "POST",
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        ...workspaceHeaders(),
      },
      body: blob,
    });
    const data = await upload.json();
    if (!upload.ok) { if (upload.status === 401) requireSignIn(); throw new Error(data.message || "Media upload failed."); }
    replacements.set(url, data.url);
  }
  for (const a of copy.assets) {
    if (a.url) a.url = replacements.get(a.url) || a.url;
    if (a.image && "url" in a.image)
      a.image.url = replacements.get(a.image.url) || a.image.url;
  }
  for (const s of copy.shots) {
    if ("url" in s.image)
      s.image.url = replacements.get(s.image.url) || s.image.url;
    for (const take of s.takes) {
      if (take.videoUrl)
        take.videoUrl = replacements.get(take.videoUrl) || take.videoUrl;
      if ("url" in take.image)
        take.image.url = replacements.get(take.image.url) || take.image.url;
    }
  }
  notify("Submitting frozen sequence…");
  return studioAI.editorExport({
    requestId: crypto.randomUUID(),
    project: copy,
    settings,
  });
}
