import { text } from "../i18n";
import type { Asset, RemoteJob } from "../types";
import type { SceneSpec } from "./schema";
import { workspaceHeaders, requireSignIn, workspaceKey } from "../auth/session";
const base = (import.meta.env.VITE_MOUVA_AI_URL || "/api/ai").replace(
  /\/$/,
  "",
);
export type ImageRound = {
  id: string;
  projectId: string;
  prompt: string;
  width: number;
  height: number;
  model: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
  error?: string;
  candidates: {
    index: number;
    status: ImageRound["status"];
    url?: string;
    error?: string;
  }[];
};
export type AIStatus = {
  billingEnabled?: boolean;
  billingReady?: boolean;
  imageReady: boolean;
  imageModel: string;
  orchestratorReady: boolean;
  orchestratorModel: string;
  sceneProvider: string;
  sceneModel: string;
  sceneReady: boolean;
  videoModel: string;
  videoReady: boolean;
  publisherReady: boolean;
  service: string;
};
async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...workspaceHeaders(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error(
      "The video service is temporarily unavailable. Please try again.",
    );
  }
  const data = await res
    .json()
    .catch(() => ({ message: "AI service did not return JSON." }));
  if (!res.ok) {
    if (res.status === 401) requireSignIn();
    throw new Error(data.message || "AI request failed.");
  }
  return data;
}
export const studioAI = {
  billingQuote: (spec: unknown) =>
    request<{ version: string; credits: number }>("/billing/quote", spec),
  billingBalance: () =>
    request<{
      credits: number;
      reservedCredits: number;
      activity?: {
        operationId: string;
        product: 'design' | 'studio';
        kind: string;
        reservedCredits: number;
        chargedCredits: number | null;
        createdAt: string;
        settledAt: string | null;
      }[];
      history: {
        operationId: string;
        spec: { kind: string };
        reservedCredits: number;
        chargedCredits: number | null;
        createdAt: string;
        settledAt: string | null;
      }[];
    }>("/billing"),
  status: () => request<AIStatus>("/status"),
  images: (projectId: string) =>
    request<ImageRound[]>("/images?projectId=" + encodeURIComponent(projectId)),
  generateImages: (body: unknown) => request<ImageRound>("/images", body),
  cancelImages: (id: string) =>
    request<ImageRound>("/images/" + encodeURIComponent(id) + "/cancel", {}),
  editorExport: (body: unknown) => request<RemoteJob>("/editor/exports", body),
  editorJobs: (projectId: string) =>
    request<RemoteJob[]>(
      "/editor/jobs?projectId=" + encodeURIComponent(projectId),
    ),
  editorJob: (id: string) =>
    request<RemoteJob>("/editor/jobs/" + encodeURIComponent(id)),
  cancelExport: (id: string) =>
    request<RemoteJob>(
      "/editor/jobs/" + encodeURIComponent(id) + "/cancel",
      {},
    ),
  editorPlan: async (body: unknown, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const { agentOperation } = await import("./agent-operation");
    let storage: Storage | undefined;
    try {
      storage = localStorage;
    } catch {}
    let operation = await agentOperation(workspaceKey("editor"), body, storage);
    type Result = {
      summary: string;
      commands: import("../editor/commands").EditCommand[];
    };
    if (operation.previous) {
      const saved = await request<{
        status: string;
        settled?: boolean;
        result?: Result;
      }>("/editor/plans/" + operation.requestId, undefined, signal).catch(
        () => undefined,
      );
      signal?.throwIfAborted();
      if (saved?.status === "succeeded" && saved.result) {
        operation.finish();
        return saved.result;
      }
      if (
        saved &&
        ["unknown", "failed"].includes(saved.status) &&
        saved.settled
      ) {
        operation.finish();
        operation = await agentOperation(workspaceKey("editor"), body, storage);
      } else if (
        saved &&
        ["unknown", "running", "failed"].includes(saved.status)
      )
        throw new Error(
          text(
            "本次编辑请求尚未确认，请先查看积分与账单，等待恢复或对账后再提交。",
            "This editing request needs recovery before another paid submission. Check Credits and billing.",
          ),
        );
    }
    const { approveGeneration } = await import("./billing");
    const billingApproval = await approveGeneration(
      { kind: "agent" },
      1,
      signal,
    );
    signal?.throwIfAborted();
    if (billingApproval === null) {
      if (!operation.previous) operation.finish();
      throw new Error(text("已取消生成。", "Generation cancelled."));
    }
    const input = body as Record<string, unknown>;
    const result = await request<Result>(
      "/editor/plan",
      billingApproval
        ? { ...input, requestId: operation.requestId, billingApproval }
        : body,
      signal,
    );
    operation.finish();
    return result;
  },
  scene: (body: unknown, signal?: AbortSignal) =>
    request<{ scene: SceneSpec; model: string }>("/scenes", body, signal),
  production: (body: unknown) => request<RemoteJob>("/productions", body),
  jobs: (projectId: string) =>
    request<RemoteJob[]>(
      "/productions?projectId=" + encodeURIComponent(projectId),
    ),
  job: (id: string) =>
    request<RemoteJob>("/productions/" + encodeURIComponent(id)),
  cancel: (id: string) =>
    request<RemoteJob>(
      "/productions/" + encodeURIComponent(id) + "/cancel",
      {},
    ),
};
export async function packAssets(
  scene: SceneSpec,
  assets: Asset[],
  additionalIds: string[] = [],
) {
  const ids = new Set([
    ...scene.objects.map((o) => o.assetId).filter((id): id is string => !!id),
    ...additionalIds,
  ]);
  if (ids.size > 32) throw new Error("Choose at most 32 scene references.");
  let bytes = 0;
  return Promise.all(
    [...ids].map(async (id) => {
      const a = assets.find((x) => x.id === id);
      if (!a?.url) throw new Error("Missing scene asset: " + id);
      const res = await fetch(a.url);
      if (!res.ok) throw new Error("Could not load " + a.name);
      const blob = await res.blob();
      bytes += blob.size;
      if (bytes > 20 * 1024 * 1024)
        throw new Error("Scene references exceed the 20 MB reference limit.");
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return { id: a.id, name: a.name.slice(0, 160), kind: a.kind, url };
    }),
  );
}
