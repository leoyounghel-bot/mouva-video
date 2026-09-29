import type { Asset, RemoteJob } from "../types";
import type { SceneSpec } from "./schema";
import { workspaceHeaders, requireSignIn } from "../auth/session";
const base = (import.meta.env.VITE_MOUVA_AI_URL || "/api/ai").replace(
  /\/$/,
  "",
);
export type AIStatus = {
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
  if (!res.ok) { if (res.status === 401) requireSignIn(); throw new Error(data.message || "AI request failed."); }
  return data;
}
export const studioAI = {
  status: () => request<AIStatus>("/status"),
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
  editorPlan: (body: unknown) =>
    request<{
      summary: string;
      commands: import("../editor/commands").EditCommand[];
    }>("/editor/plan", body),
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
