import { useRef, useState, type PointerEvent } from "react";
import { t as tr } from "../i18n";
import { useWorkspace } from "../context";
import type { AudioClip } from "../types";
import { editAudioRange, snapTime } from "./timelineEditing";
export function AudioTimelineClip({
  clip,
  total,
  row,
  boundaries,
}: {
  clip: AudioClip;
  total: number;
  row: number;
  boundaries: number[];
}) {
  const w = useWorkspace(),
    asset = w.project.assets.find((a) => a.id === clip.assetId);
  const [draft, setDraft] = useState<ReturnType<typeof editAudioRange> | null>(
    null,
  );
  const [offsetY, setOffsetY] = useState(0);
  const drag = useRef<{
    x: number;
    y: number;
    ratio: number;
    action: "move" | "in" | "out";
    clip: AudioClip;
    draft: ReturnType<typeof editAudioRange>;
    changed: boolean;
  } | null>(null);
  const value = { ...clip, ...draft };
  function begin(
    e: PointerEvent<HTMLButtonElement>,
    action: "move" | "in" | "out",
  ) {
    if (e.button !== 0) return;
    e.stopPropagation();
    w.setPlaying(false);
    w.setSelectedAudio(clip.id);
    const width = e.currentTarget
      .closest(".mw-track-lanes")!
      .getBoundingClientRect().width;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      ratio: total / width,
      action,
      clip: structuredClone(clip),
      draft: editAudioRange(clip, action, 0, total, asset?.duration),
      changed: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const base =
      d.action === "out" ? d.clip.start + d.clip.duration : d.clip.start;
    let delta = (e.clientX - d.x) * d.ratio;
    if (!e.shiftKey)
      delta = snapTime(base + delta, boundaries, 8 * d.ratio) - base;
    d.draft = editAudioRange(d.clip, d.action, delta, total, asset?.duration);
    d.changed ||=
      Math.abs(e.clientX - d.x) > 3 ||
      (d.action === "move" && Math.abs(e.clientY - d.y) > 3);
    if (d.action === "move") setOffsetY(e.clientY - d.y);
    if (d.changed) setDraft(d.draft);
  }
  function finish(e: PointerEvent<HTMLButtonElement>, commit: boolean) {
    const d = drag.current;
    drag.current = null;
    setDraft(null);
    setOffsetY(0);
    if (!d?.changed || !commit) return;
    const lane = [
      ...e.currentTarget
        .closest(".mw-track-lanes")!
        .querySelectorAll<HTMLElement>("[data-audio-kind]"),
    ].find((element) => {
      const rect = element.getBoundingClientRect();
      return (
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom &&
        e.clientX >= rect.left &&
        e.clientX <= rect.right
      );
    })?.dataset.audioKind;
    w.execute(
      [
        {
          tool: "audio.update",
          targetId: clip.id,
          args: {
            ...d.draft,
            ...(d.action === "move" &&
            ["voice", "music", "sfx"].includes(lane || "")
              ? { kind: lane }
              : {}),
          },
        },
      ],
      undefined,
      true,
    );
  }
  const gestures = (action: "move" | "in" | "out") => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => begin(e, action),
    onPointerMove: move,
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => finish(e, true),
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => finish(e, false),
    onLostPointerCapture: () => {
      if (drag.current) {
        drag.current = null;
        setDraft(null);
        setOffsetY(0);
      }
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && drag.current) {
        e.preventDefault();
        e.stopPropagation();
        drag.current = null;
        setDraft(null);
        setOffsetY(0);
        return;
      }
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      w.setSelectedAudio(clip.id);
      w.setPlaying(false);
      w.execute([
        {
          tool: "audio.update",
          targetId: clip.id,
          args: editAudioRange(
            clip,
            action,
            (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 1 : 1 / 24),
            total,
            asset?.duration,
          ),
        },
      ]);
    },
  });
  const peaks = clip.peaks.length
    ? clip.peaks
    : clip.demo
      ? Array.from(
          { length: 180 },
          (_, i) =>
            0.15 + Math.abs(Math.sin(i * 1.89) * Math.cos(i * 0.19)) * 0.8,
        )
      : [];
  const sourceDuration =
    asset?.duration || clip.duration + (clip.sourceStart || 0);
  const from = Math.floor(
      ((value.sourceStart || 0) / sourceDuration) * peaks.length,
    ),
    to = Math.ceil(
      (((value.sourceStart || 0) + value.duration) / sourceDuration) *
        peaks.length,
    );
  const shown = peaks.slice(from, Math.max(from + 1, to));
  return (
    <div
      className={
        "mw-audio-clip mw-editable-audio " +
        (clip.muted ? "muted " : "") +
        (w.selectedAudio === clip.id ? "selected " : "") +
        (draft ? "dragging" : "")
      }
      style={{
        left: (value.start / total) * 100 + "%",
        width:
          (Math.min(value.duration, total - value.start) / total) * 100 + "%",
        top: row * 48 + 2,
        transform: offsetY ? `translateY(${offsetY}px)` : undefined,
        height: 44,
      }}
    >
      <button
        className="mw-audio-body"
        aria-label={tr("选择音频 ") + clip.name}
        title={clip.name + tr(" · 拖动移动，双击编辑")}
        {...gestures("move")}
        onClick={() => w.setSelectedAudio(clip.id)}
        onDoubleClick={() => {
          w.setSelectedAudio(clip.id);
          w.setModal("audio");
        }}
      >
        <svg
          className="mw-waveform"
          viewBox="0 0 600 32"
          preserveAspectRatio="none"
          aria-label={tr(
            clip.demo ? "Illustrative waveform · demo track" : "Audio waveform",
          )}
        >
          {shown.map((n, i) => (
            <path
              key={i}
              d={`M${(i * 600) / shown.length} ${16 - n * 14}v${n * 28}`}
              stroke="currentColor"
              strokeWidth="1.5"
            />
          ))}
        </svg>
        <span>{clip.name}</span>
      </button>
      {(["in", "out"] as const).map((edge) => (
        <button
          key={edge}
          className={"mw-trim-handle " + edge}
          aria-label={
            tr(edge === "in" ? "裁剪音频起点 " : "裁剪音频终点 ") + clip.name
          }
          {...gestures(edge)}
        >
          <span />
        </button>
      ))}
    </div>
  );
}
