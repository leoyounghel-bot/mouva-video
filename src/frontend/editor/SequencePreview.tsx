import { useEffect, useRef, useState } from "react";
import type { Project } from "../types";
import { createSequenceRenderer } from "./compositor";
export function SequencePreview({
  project,
  time,
  preview,
  playing = false,
}: {
  project: Project;
  time: number;
  preview: boolean;
  playing?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    clock = useRef(time),
    play = useRef(playing),
    redraw = useRef<() => void>(() => {}),
    [error, setError] = useState("");
  clock.current = time;
  play.current = playing;
  useEffect(() => {
    let active = true,
      running = false,
      pending = false;
    const value = createSequenceRenderer(canvas.current!, project, {
      width: 960,
      height: 540,
      preview,
    });
    setError("");
    const draw = async () => {
      if (running) {
        pending = true;
        return;
      }
      running = true;
      do {
        pending = false;
        try {
          await value.draw(clock.current, play.current);
          if (active) setError("");
        } catch (e: any) {
          if (active) setError(e.message);
        }
      } while (pending && active);
      running = false;
    };
    redraw.current = draw;
    void draw();
    return () => {
      active = false;
      value.dispose();
      redraw.current = () => {};
    };
  }, [project, preview]);
  useEffect(() => {
    redraw.current();
  }, [time, playing]);
  return (
    <>
      <canvas
        ref={canvas}
        className="mw-composite-canvas"
        aria-label="Sequence preview"
      />
      {error && (
        <div role="alert" className="mw-preview-error">
          {error}
        </div>
      )}
    </>
  );
}
