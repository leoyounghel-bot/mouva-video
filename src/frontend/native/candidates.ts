import type { RemoteJob, Shot, Take } from "../types";
import { sceneThumbnail } from "./templates";

// A source scene is a separate immutable take while video generation continues.
// Completing the video must never silently replace an adopted source take.
export function productionCandidates(job: RemoteJob, shot: Shot): Take[] {
  const candidates: Take[] = [];
  const sceneReady =
    !!job.scene && (job.sourceReady || job.status === "succeeded");
  const common = {
    status: "succeeded" as const,
    createdAt: job.createdAt || new Date().toISOString(),
    duration: job.scene?.duration,
    image: job.scene ? sceneThumbnail(job.scene) : shot.image,
    scene: job.scene,
    sourceSceneKey: job.sourceSceneKey,
    referenceUrl: job.referenceUrl,
    productionJobId: job.provider === "pipeline" ? job.id : undefined,
    parentTakeId: job.baseTakeId,
    instruction: job.instruction,
  };
  if (sceneReady && job.provider === "pipeline")
    candidates.push({
      ...common,
      id: job.mode === "scene" ? job.id : job.id + "-source",
      label: "Editable 3D scene",
    });
  if (
    job.status === "succeeded" &&
    job.mode !== "scene" &&
    (job.scene || job.outputUrl)
  )
    candidates.push({
      ...common,
      id: job.id,
      label:
        job.mode === "reference"
          ? "Motion reference"
          : job.provider === "pipeline"
            ? "Finished video"
            : "Generated take",
      videoUrl:
        job.outputUrl ||
        (job.mode === "reference" ? job.referenceUrl : undefined),
    });
  return candidates;
}
