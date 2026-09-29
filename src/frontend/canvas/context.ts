import { createContext, useContext } from "react";
import type { AddKind, Point } from "./model";
export type CanvasActions = {
  add: (
    kind: AddKind,
    at?: Point,
    source?: string,
    assetId?: string,
    target?: string,
  ) => void;
  remove: (ids: string[], edgeIds?: string[]) => void;
  duplicate: (ids: string[]) => void;
  group: () => void;
  openMenu: (
    x: number,
    y: number,
    nodeId?: string,
    sourceId?: string,
    targetId?: string,
  ) => void;
  showAssets: (targetId?: string) => void;
  upload: (files: File[], at?: Point) => Promise<void>;
};
export const CanvasActionsContext = createContext<CanvasActions | null>(null);
export function useCanvasActions() {
  const value = useContext(CanvasActionsContext);
  if (!value) throw new Error("Canvas actions missing");
  return value;
}
