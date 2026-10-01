import { t as tr } from "../i18n";
import { useRef, type PointerEvent } from "react";
import type { Shot } from "../types";
export type TrimDraft = { shotId: string; start: number; end: number };
export function TrimHandle({
  shot,
  edge,
  total,
  onPreview,
  onCommit,
  onStart,
}: {
  shot: Shot;
  edge: "in" | "out";
  total: number;
  onPreview: (draft: TrimDraft | null) => void;
  onCommit: (draft: TrimDraft) => void;
  onStart: () => void;
}) {
  const drag = useRef<{
    x: number;
    ratio: number;
    start: number;
    end: number;
    duration: number;
    draft: TrimDraft;
    changed: boolean;
  } | null>(null);
  const value = edge === "in" ? shot.trimStart : shot.trimEnd;
  const begin = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const width = e.currentTarget
      .closest(".mw-video-track")!
      .getBoundingClientRect().width;
    drag.current = {
      x: e.clientX,
      ratio: (total / width) * shot.speed,
      start: shot.trimStart,
      end: shot.trimEnd,
      duration: shot.duration,
      draft: { shotId: shot.id, start: shot.trimStart, end: shot.trimEnd },
      changed: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    onStart();
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const delta = (e.clientX - d.x) * d.ratio;
    const start =
      edge === "in"
        ? Math.max(0, Math.min(d.end - 0.04, d.start + delta))
        : d.start;
    const end =
      edge === "out"
        ? Math.max(d.start + 0.04, Math.min(d.duration, d.end + delta))
        : d.end;
    d.draft = { shotId: shot.id, start, end };
    d.changed = Math.abs(e.clientX - d.x) > 1;
    onPreview(d.draft);
  };
  const finish = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    onPreview(null);
    if (commit && d?.changed) onCommit(d.draft);
  };
  return (
    <button
      type="button"
      className={"mw-trim-handle " + edge}
      aria-label={
        (edge === "in" ? tr("Trim start ") : tr("Trim end ")) + shot.title
      }
      title={
        (edge === "in" ? tr("In ") : tr("Out ")) +
        value.toFixed(3) +
        tr("s · drag or use arrow keys")
      }
      onClick={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={(e) => {
        e.stopPropagation();
        finish(true);
      }}
      onPointerCancel={() => finish(false)}
      onLostPointerCapture={() => {
        if (drag.current) finish(false);
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        e.stopPropagation();
        onStart();
        const delta =
          (e.key === "ArrowRight" ? 1 : -1) *
          shot.speed *
          (e.shiftKey ? 1 : 1 / 24);
        onCommit({
          shotId: shot.id,
          start:
            edge === "in"
              ? Math.max(
                  0,
                  Math.min(shot.trimEnd - 0.04, shot.trimStart + delta),
                )
              : shot.trimStart,
          end:
            edge === "out"
              ? Math.max(
                  shot.trimStart + 0.04,
                  Math.min(shot.duration, shot.trimEnd + delta),
                )
              : shot.trimEnd,
        });
      }}
    >
      <span />
    </button>
  );
}
