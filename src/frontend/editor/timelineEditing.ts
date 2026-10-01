import type { AudioClip } from "../types";
export type TimelineRange = { id: string; start: number; duration: number };
export function timelineRows<T extends TimelineRange>(items: T[]) {
  const ends: number[] = [],
    rows = new Map<string, number>();
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    let row = ends.findIndex((end) => end <= item.start + 0.00001);
    if (row < 0) row = ends.length;
    ends[row] = item.start + item.duration;
    rows.set(item.id, row);
  }
  return { rows, count: Math.max(1, ends.length) };
}
export function rulerInterval(total: number, width: number) {
  const target = (total * 75) / Math.max(1, width),
    power = 10 ** Math.floor(Math.log10(Math.max(0.01, target)));
  return (
    [1, 2, 5, 10].map((n) => n * power).find((n) => n >= target) || power * 10
  );
}
export function snapTime(
  time: number,
  boundaries: number[],
  threshold: number,
) {
  let best = time,
    distance = threshold;
  for (const value of boundaries) {
    if (Math.abs(value - time) < distance) {
      distance = Math.abs(value - time);
      best = value;
    }
  }
  return best;
}
export function editAudioRange(
  clip: AudioClip,
  action: "move" | "in" | "out",
  delta: number,
  total: number,
  sourceDuration?: number,
) {
  const end = clip.start + clip.duration,
    sourceStart = clip.sourceStart || 0;
  let start = clip.start,
    duration = clip.duration,
    source = sourceStart;
  if (action === "move")
    start = Math.max(0, Math.min(Math.max(0, total - duration), start + delta));
  if (action === "in") {
    start = Math.max(
      0,
      clip.start - sourceStart,
      Math.min(end - 0.04, start + delta),
    );
    duration = end - start;
    source += start - clip.start;
  }
  if (action === "out")
    duration = Math.max(
      0.04,
      Math.min(
        total - start,
        (sourceDuration ?? Math.max(total, sourceStart + duration)) -
          sourceStart,
        duration + delta,
      ),
    );
  return {
    start,
    duration,
    sourceStart: source,
    fadeIn: Math.min(clip.fadeIn, duration),
    fadeOut: Math.min(clip.fadeOut, duration),
  };
}
