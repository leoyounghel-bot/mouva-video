import type { Asset, Project } from "../types";

export function attachShotAssets(
  project: Project,
  shotId: string,
  assets: Asset[],
) {
  const shot = project.shots.find((s) => s.id === shotId);
  if (!shot) throw new Error("The target shot no longer exists.");
  const usable = assets.filter(
    (a) => a.url && (a.kind === "image" || a.kind === "video"),
  );
  if (!usable.length)
    throw new Error("Choose an image or video for this shot.");
  shot.referenceAssetIds = [
    ...new Set([...(shot.referenceAssetIds || []), ...usable.map((a) => a.id)]),
  ];
  const keepScene =
    usable.every((a) => a.kind === "image") &&
    (shot.takes.find((t) => t.id === shot.viewingTakeId)?.scene ||
      shot.nativeDraft?.baseTakeId === shot.viewingTakeId);
  let previewId = "";
  for (const asset of usable) {
    if (asset.kind === "video" && (!asset.duration || !asset.image))
      throw new Error(
        "Re-import this video so its duration and preview can be read.",
      );
    let take = shot.takes.find((t) => t.assetId === asset.id);
    if (!take) {
      take = {
        id: crypto.randomUUID(),
        assetId: asset.id,
        label: asset.name,
        image: asset.image || { url: asset.url! },
        status: "succeeded",
        createdAt: new Date().toISOString(),
        duration: asset.duration || shot.duration,
        ...(asset.kind === "video" ? { videoUrl: asset.url } : {}),
      };
      shot.takes.push(take);
    }
    previewId ||= take.id;
  }
  if (previewId && !keepScene) shot.viewingTakeId = previewId;
}
