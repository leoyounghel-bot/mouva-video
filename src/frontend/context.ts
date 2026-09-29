import { createContext, useContext } from "react";
import type { EditCommand } from "./editor/commands";
import type { Asset, Project, Shot, View, Section, RemoteJob } from "./types";
export type ModalKind =
  | "assistant"
  | "editing-assistant"
  | "production"
  | "ai-settings"
  | "project"
  | "share"
  | "export"
  | "jobs"
  | "connect"
  | "request"
  | "audio"
  | "help"
  | "new-shot"
  | "compare"
  | "character"
  | null;
export type DirectorIntent = {
  instruction?: string;
  referenceAssetIds?: string[];
  shotId?: string;
  mode?: "scene" | "reference" | "finish";
  scope?: "scene" | "object";
  objectId?: string;
  reviseScene?: boolean;
};
export type Workspace = {
  directorIntent: DirectorIntent | null;
  openDirector: (intent?: DirectorIntent) => void;
  execute: (commands: EditCommand[], baseRevision?: string) => boolean;
  project: Project;
  shot: Shot;
  selected: string;
  select: (id: string) => void;
  view: View;
  setView: (v: View) => void;
  section: Section;
  setSection: (v: Section) => void;
  time: number;
  setTime: (n: number) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  update: (fn: (p: Project) => void, label?: string) => void;
  updateShot: (patch: Partial<Shot>) => void;
  modal: ModalKind;
  setModal: (m: ModalKind) => void;
  notify: (s: string) => void;
  upload: (files: FileList | File[], shotId?: string) => Promise<Asset[]>;
  attachAssets: (shotId: string, assetIds: string[]) => void;
  request: (
    kind: "generate" | "repair" | "export",
    settings?: any,
  ) => Promise<void>;
  jobs: RemoteJob[];
  selectedAudio: string;
  setSelectedAudio: (id: string) => void;
  inspectorTab: string;
  setInspectorTab: (s: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (v: boolean) => void;
  replaceProject: (p: Project) => void;
  pendingRequest: any;
  sceneOpen: boolean;
  setSceneOpen: (value: boolean) => void;
  openScene: (id: string) => void;
  selectedObject: string;
  setSelectedObject: (id: string) => void;
  addJob: (job: RemoteJob) => void;
};
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace provider missing");
  return context;
}
