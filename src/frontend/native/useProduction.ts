import { useRef, useState } from "react";
import { canvasInputs } from "../canvas/model";
import { useWorkspace } from "../context";
import type { Shot } from "../types";
import { studioAI, packAssets } from "./api";
import { createScene, nativeAssets, workingScene } from "./templates";

export type ProductionOptions = {
  mode: "scene" | "reference" | "finish";
  instruction: string;
  reviseScene?: boolean;
  scope?: "scene" | "object";
  objectId?: string;
  duration?: number;
  referenceIds?: string[];
  generateAudio?: boolean;
};

// Both canvas nodes and the detailed director submit the same durable job.
export function useProduction(shot: Shot) {
  const w = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const retry = useRef<{ content: string; id: string } | null>(null);
  async function submit(options: ProductionOptions) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const projectId = w.project.id,
      shotId = shot.id,
      inputs = canvasInputs(w.project, shot.id),
      source = workingScene(shot) || inputs.scene;
    const reviseScene = !source || options.reviseScene !== false;
    try {
      const instruction = [inputs.text, options.instruction.trim()]
        .filter(Boolean)
        .join("\n\n");
      if (instruction.length > 8000)
        throw new Error("节点与上游文本合计最多 8000 个字符，请精简后生成。");
      if ((reviseScene || options.mode === "finish") && !instruction)
        throw new Error("Describe the shot you want to create.");
      const seconds =
        options.duration ??
        Math.max(4, Math.min(30, Math.round(shot.duration || 6)));
      const scene = structuredClone(source || createScene("brand", seconds));
      if (
        !Number.isInteger(scene.duration) ||
        scene.duration < 4 ||
        scene.duration > 30
      )
        throw new Error(
          "Use a scene duration of 4–30 whole seconds for generation.",
        );
      const scope = reviseScene ? options.scope || "scene" : "scene";
      if (
        scope === "object" &&
        !scene.objects.some((o) => o.id === options.objectId)
      )
        throw new Error("Choose an object that exists in this scene.");
      const assets = [
        ...w.project.assets,
        ...nativeAssets.filter(
          (a) => !w.project.assets.some((x) => x.id === a.id),
        ),
      ];
      const ids = [
        ...new Set([
          ...(options.referenceIds ?? shot.referenceAssetIds ?? []),
          ...inputs.assetIds,
        ]),
      ];
      const imageIds = ids.filter((id) =>
        assets.some(
          (a) => a.id === id && (a.kind === "image" || a.kind === "model"),
        ),
      );
      const packed = await packAssets(
        scene,
        assets,
        reviseScene ? imageIds : [],
      );
      const baseTakeId = shot.viewingTakeId,
        baseTake = shot.takes.find((t) => t.id === baseTakeId);
      const parent = w.jobs.find(
        (j) =>
          j.provider === "pipeline" &&
          j.projectId === projectId &&
          j.shotId === shotId &&
          (j.id === baseTake?.productionJobId || j.id === baseTakeId),
      );
      const body = {
        projectId,
        shotId,
        baseTakeId,
        ...(parent ? { parentJobId: parent.id } : {}),
        scene,
        assets: packed,
        mode: options.mode,
        reviseScene,
        sceneOrigin: source ? "existing" : "new",
        scope,
        ...(scope === "object" ? { objectId: options.objectId } : {}),
        instruction,
        finishPrompt:
          instruction ||
          "Follow the source scene composition, camera and timing.",
        resolution: shot.resolution,
        ratio: shot.aspectRatio,
        generateAudio: options.generateAudio !== false,
      };
      const content = JSON.stringify(body);
      const requestId =
        retry.current?.content === content
          ? retry.current.id
          : crypto.randomUUID();
      retry.current = { content, id: requestId };
      w.update((p) => {
        if (p.id !== projectId || !p.shots.some((s) => s.id === shotId))
          throw new Error(
            "This shot is no longer open. Reopen it before generating.",
          );
        for (const asset of assets.filter((a) =>
          packed.some((r) => r.id === a.id),
        ))
          if (!p.assets.some((a) => a.id === asset.id))
            p.assets.push(structuredClone(asset));
      }, "Attach scene references");
      const job = await studioAI.production({ requestId, ...body });
      w.addJob(job);
      return job;
    } catch (e: any) {
      setError(e.message || "Could not start generation.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return { submit, busy, error };
}
