import { t, text, currentLanguage } from "../i18n";
import { useRef, useState } from "react";
import { canvasInputs } from "../canvas/model";
import { useWorkspace } from "../context";
import type { Shot } from "../types";
import { studioAI, packAssets } from "./api";
import { approveGeneration } from "./billing";
import { createScene, nativeAssets, workingScene } from "./templates";
import {
  candidateRound,
  submitRound,
  type CandidateCount,
  type RoundAttempt,
} from "./rounds";

export type ProductionOptions = {
  mode: "scene" | "reference" | "finish";
  instruction: string;
  reviseScene?: boolean;
  scope?: "scene" | "object";
  objectId?: string;
  duration?: number;
  referenceIds?: string[];
  generateAudio?: boolean;
  count?: CandidateCount;
};

// Both canvas nodes and the detailed director submit the same durable job.
export function useProduction(shot: Shot) {
  const w = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const retry = useRef<RoundAttempt | null>(null);
  async function submitBatch(options: ProductionOptions) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const projectId = w.project.id,
      shotId = shot.id,
      inputs = canvasInputs(w.project, shot.id),
      source = inputs.scene || workingScene(shot);
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
        reviseScene || options.mode === "finish" ? imageIds : [],
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
        responseLanguage: currentLanguage(),
        baseTakeId,
        ...(parent ? { parentJobId: parent.id } : {}),
        scene,
        assets: packed,
        referenceImageIds:
          options.mode === "finish"
            ? imageIds.filter((id) =>
                assets.some((a) => a.id === id && a.kind === "image"),
              )
            : [],
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
      const round = candidateRound(content, options.count || 1, retry.current);
      const remainingCount = round.requestIds.length - round.accepted.length;
      const billingApproval = await approveGeneration(
        {
          kind: "production",
          mode: body.mode,
          seconds: scene.duration,
          resolution: body.resolution,
          ratio: body.ratio,
          reviseScene: body.reviseScene,
        },
        remainingCount,
      );
      if (billingApproval === null) return;
      retry.current = round;
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
      const jobs = await submitRound(
        round,
        (identity) =>
          studioAI.production({
            ...identity,
            ...body,
            ...(billingApproval ? { billingApproval } : {}),
          }),
        w.addJob,
      );
      retry.current = null;
      return jobs;
    } catch (e: any) {
      const accepted = retry.current?.accepted.length || 0;
      setError(
        (accepted
          ? text(
              `已提交 ${accepted} 个候选；其余未完成提交。再次点击会继续本轮。`,
              `${accepted} candidates submitted. Try again to resume the remaining candidates in this round. `,
            )
          : "") + t(e.message || "Could not start generation."),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function submit(options: ProductionOptions) {
    return (await submitBatch({ ...options, count: 1 }))?.[0];
  }
  return { submit, submitBatch, busy, error };
}
