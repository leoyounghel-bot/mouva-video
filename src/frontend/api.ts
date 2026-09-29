import type {
  Project,
  GenerateRequest,
  RepairRequest,
  ExportRequest,
  RemoteJob,
  Asset,
} from "./types";
// Workspace API adapter. Connected 3D production uses native/api.ts. No provider keys belong in this frontend.
export const API_BASE = (import.meta.env.VITE_MOUVA_API_URL || "").replace(
  /\/$/,
  "",
);
export const connected = !!API_BASE;
async function request<T>(
  route: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(API_BASE + route, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.message || data.error || `Request failed (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}
const post = <T>(route: string, body: unknown) =>
  request<T>(route, { method: "POST", body: JSON.stringify(body) });
export interface WorkspaceApi {
  loadProject: (id: string) => Promise<Project>;
  saveProject: (project: Project) => Promise<Project>;
  upload: (projectId: string, file: File) => Promise<Asset>;
  generate: (input: GenerateRequest) => Promise<RemoteJob>;
  repair: (input: RepairRequest) => Promise<RemoteJob>;
  export: (input: ExportRequest) => Promise<RemoteJob>;
  getJob: (id: string) => Promise<RemoteJob>;
  cancelJob: (id: string) => Promise<RemoteJob>;
  share: (
    projectId: string,
    role: "viewer" | "editor",
  ) => Promise<{ url: string }>;
}
export const workspaceApi: WorkspaceApi = {
  loadProject: (id) => request("/projects/" + encodeURIComponent(id)),
  saveProject: (p) =>
    request("/projects/" + encodeURIComponent(p.id), {
      method: "PUT",
      body: JSON.stringify(p),
    }),
  upload: async (id, file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/projects/" + encodeURIComponent(id) + "/assets", {
      method: "POST",
      body: form,
    });
  },
  generate: (p) => post("/generations", p),
  repair: (p) => post("/repairs", p),
  export: (p) => post("/exports", p),
  getJob: (id) => request("/jobs/" + encodeURIComponent(id)),
  cancelJob: (id) => post("/jobs/" + encodeURIComponent(id) + "/cancel", {}),
  share: (id, role) =>
    post("/projects/" + encodeURIComponent(id) + "/shares", { role }),
};
export function downloadJson(value: unknown, name: string) {
  const a = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
