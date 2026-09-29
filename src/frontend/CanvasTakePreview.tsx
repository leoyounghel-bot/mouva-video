import { useEffect, useMemo, useRef, useState } from "react";
import type { Shot } from "./types";
import { useWorkspace } from "./context";
import { Icon } from "./Primitives";
import { shotLength } from "./demo";
import { workingScene } from "./native/templates";
import { SequencePreview } from "./editor/SequencePreview";
import { useSequenceAudio } from "./editor/useSequenceAudio";

// A node previews its viewed take, including candidates that have not been adopted.
export function CanvasTakePreview({ shot }: { shot: Shot }) {
  const w = useWorkspace();
  const take =
    shot.takes.find((t) => t.id === shot.viewingTakeId) || shot.takes[0];
  const adopted = take.id === shot.adoptedTakeId;
  const [playing, setPlaying] = useState(false);
  const [candidateTime, setCandidateTime] = useState(0);
  const clip = useMemo(() => {
    const scene = workingScene(shot);
    const seconds = take.duration ?? scene?.duration ?? shot.duration;
    return {
      ...shot,
      takes: [{ ...take, ...(take.scene && scene ? { scene } : {}) }],
      viewingTakeId: take.id,
      adoptedTakeId: take.id,
      ...(!adopted
        ? {
            duration: seconds,
            trimStart: 0,
            trimEnd: seconds,
            speed: 1,
            layers: [],
            edit: undefined,
          }
        : {}),
    };
  }, [shot, take, adopted]);
  const project = useMemo(
    () => ({ ...w.project, shots: [clip], audio: [] }),
    [w.project, clip],
  );
  const length = shotLength(clip);
  const start = w.project.shots
    .slice(
      0,
      w.project.shots.findIndex((s) => s.id === shot.id),
    )
    .reduce((sum, s) => sum + shotLength(s), 0);
  const time = Math.max(
    0,
    Math.min(length - 0.001, adopted ? w.time - start : candidateTime),
  );
  const localPlaying = playing && !w.playing && !w.modal;
  const clock = useRef(time);
  clock.current = time;
  function seek(value: number) {
    const next = Math.max(0, Math.min(length - 0.001, value));
    if (adopted) w.setTime(start + next);
    else setCandidateTime(next);
    clock.current = next;
  }
  const actions = useRef({ seek });
  actions.current = { seek };
  useEffect(
    () => setPlaying(false),
    [shot.id, take.id, adopted, length, w.playing, w.modal],
  );
  useEffect(() => {
    if (!localPlaying) return;
    const from = clock.current,
      at = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const next = from + (now - at) / 1000;
      actions.current.seek(next);
      if (next >= length - 0.001) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [localPlaying, length]);
  useSequenceAudio(project, localPlaying, time);
  function toggle() {
    if (w.playing) {
      w.setPlaying(false);
      return;
    }
    if (!playing && time >= length - 0.02) seek(0);
    setPlaying(!playing);
  }
  return (
    <>
      <div className="mw-canvas-shot-preview">
        <SequencePreview
          project={project}
          time={time}
          preview
          playing={localPlaying || (adopted && w.playing)}
        />
        <span className="mw-canvas-preview-kind">
          {take.videoUrl ? "Video" : take.scene ? "Editable 3D" : "Image"}
          {!adopted ? " · Candidate" : ""}
        </span>
        <button
          className="mw-canvas-preview-play"
          aria-label={
            localPlaying || w.playing ? "Pause this take" : "Play this take"
          }
          onClick={toggle}
        >
          <Icon name={localPlaying || w.playing ? "pause" : "play"} size={22} />
        </button>
      </div>
      <div className="mw-canvas-shot-scrub">
        <button
          aria-label={
            localPlaying || w.playing
              ? "Pause node preview"
              : "Play node preview"
          }
          onClick={toggle}
        >
          <Icon name={localPlaying || w.playing ? "pause" : "play"} size={14} />
        </button>
        <input
          aria-label={"Preview position for " + shot.title}
          type="range"
          min={0}
          max={Math.max(0.001, length - 0.001)}
          step={0.001}
          value={time}
          onChange={(e) => {
            setPlaying(false);
            w.setPlaying(false);
            seek(Number(e.target.value));
          }}
        />
        <span>
          {time.toFixed(1)} / {length.toFixed(1)}s
        </span>
      </div>
    </>
  );
}
