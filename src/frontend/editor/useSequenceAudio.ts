import { useEffect, useRef } from "react";
import type { Project } from "../types";
import { locate } from "../demo";
import { effects } from "./commands";

type Track = {
  id: string;
  url: string;
  sourceTime: number;
  speed: number;
  gain: number;
  pan: number;
  active: boolean;
};
type AudioItem = {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
  url: string;
  starting: boolean;
};
const release = (item: AudioItem) => {
  item.el.pause();
  item.source.disconnect();
  item.gain.disconnect();
  item.pan.disconnect();
  item.el.removeAttribute("src");
  item.el.load();
};
export function useSequenceAudio(
  project: Project,
  playing: boolean,
  time: number,
) {
  const ref = useRef<{
    context: AudioContext;
    items: Map<string, AudioItem>;
  } | null>(null);
  useEffect(() => {
    const audible = project.audio.filter(
      (a) =>
        !a.demo &&
        a.assetId &&
        project.assets.some((x) => x.id === a.assetId && x.url),
    );
    const solo = audible.some((a) => a.solo && !a.muted);
    const tracks: Track[] = audible.map((a) => {
      const local = time - a.start;
      return {
        id: "audio:" + a.id,
        url: project.assets.find((x) => x.id === a.assetId)!.url!,
        sourceTime: (a.sourceStart ?? 0) + Math.max(0, local),
        speed: 1,
        pan: a.pan,
        active:
          playing &&
          local >= 0 &&
          local < a.duration &&
          !a.muted &&
          (!solo || a.solo),
        gain:
          a.gain *
          Math.max(
            0,
            Math.min(
              1,
              a.fadeIn ? local / a.fadeIn : 1,
              a.fadeOut ? (a.duration - local) / a.fadeOut : 1,
            ),
          ),
      };
    });
    const hit = locate(project, time);
    if (hit) {
      const take = hit.shot.takes.find((t) => t.id === hit.shot.adoptedTakeId),
        e = effects(hit.shot);
      if (take?.videoUrl)
        tracks.push({
          id: "video:" + hit.shot.id,
          url: take.videoUrl,
          sourceTime: hit.local,
          speed: hit.shot.speed,
          gain: e.volume,
          pan: 0,
          active: playing && !solo && !e.muted && e.volume > 0,
        });
    }
    if (!ref.current && tracks.some((t) => t.active))
      ref.current = { context: new AudioContext(), items: new Map() };
    const state = ref.current;
    if (!state) return;
    if (playing) void state.context.resume().catch(() => {});
    for (const [id, item] of state.items) {
      if (!tracks.some((t) => t.id === id && t.url === item.url)) {
        release(item);
        state.items.delete(id);
      }
    }
    for (const track of tracks) {
      let item = state.items.get(track.id);
      if (!item && track.active) {
        const el = new Audio();
        el.crossOrigin = "anonymous";
        el.preload = "auto";
        el.src = track.url;
        el.preservesPitch = true;
        const source = state.context.createMediaElementSource(el),
          gain = state.context.createGain(),
          pan = state.context.createStereoPanner();
        source.connect(gain).connect(pan).connect(state.context.destination);
        item = { el, source, gain, pan, url: track.url, starting: false };
        state.items.set(track.id, item);
      }
      if (!item) continue;
      item.gain.gain.value = track.active ? track.gain : 0;
      item.pan.pan.value = track.pan;
      item.el.playbackRate = track.speed;
      if (!track.active) {
        item.el.pause();
        continue;
      }
      const target = Math.max(
        0,
        Math.min(
          track.sourceTime,
          Number.isFinite(item.el.duration)
            ? Math.max(0, item.el.duration - 0.001)
            : track.sourceTime,
        ),
      );
      if (Math.abs(item.el.currentTime - target) > 0.12 || item.el.paused) {
        try {
          item.el.currentTime = target;
        } catch {
          /* Metadata will be available on the next tick. */
        }
      }
      if (item.el.paused && !item.starting) {
        const pending = item;
        pending.starting = true;
        void pending.el
          .play()
          .catch(() => {})
          .finally(() => {
            pending.starting = false;
          });
      }
    }
  }, [project, playing, time]);
  useEffect(
    () => () => {
      const state = ref.current;
      ref.current = null;
      if (state) {
        for (const item of state.items.values()) release(item);
        void state.context.close();
      }
    },
    [],
  );
}
