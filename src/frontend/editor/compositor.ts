import type { Project, Shot } from "../types";
import { effects } from "./commands";
import { locate } from "../demo";
import { createSceneRenderer } from "../native/renderer";
type Engine = Awaited<ReturnType<typeof createSceneRenderer>>;
export function frameOpacity(s: Shot, sourceTime: number) {
  const e = effects(s),
    t = (sourceTime - s.trimStart) / s.speed,
    d = (s.trimEnd - s.trimStart) / s.speed;
  return (
    e.opacity *
    Math.max(
      0,
      Math.min(
        1,
        e.fadeIn ? t / e.fadeIn : 1,
        e.fadeOut ? (d - t) / e.fadeOut : 1,
      ),
    )
  );
}
export function createSequenceRenderer(
  canvas: HTMLCanvasElement,
  project: Project,
  options: {
    width: number;
    height: number;
    subtitles?: boolean;
    preview?: boolean;
  },
) {
  canvas.width = options.width;
  canvas.height = options.height;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const media = new Map<string, Promise<HTMLImageElement | HTMLVideoElement>>(),
    scenes = new Map<
      string,
      Promise<{ canvas: HTMLCanvasElement; engine: Engine }>
    >();
  let disposed = false,
    activeVideo: HTMLVideoElement | undefined;
  function image(url: string) {
    let promise = media.get(url);
    if (!promise) {
      promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Image could not be loaded."));
        el.src = url;
      });
      media.set(url, promise);
    }
    return promise;
  }
  function video(url: string) {
    let promise = media.get(url);
    if (!promise) {
      promise = new Promise<HTMLVideoElement>((resolve, reject) => {
        const el = document.createElement("video");
        el.crossOrigin = "anonymous";
        el.preload = "auto";
        el.muted = true;
        el.playsInline = true;
        el.onloadeddata = () => resolve(el);
        el.onerror = () => reject(new Error("Video could not be decoded."));
        el.src = url;
        el.load();
      });
      media.set(url, promise);
    }
    return promise as Promise<HTMLVideoElement>;
  }
  async function seek(el: HTMLVideoElement, time: number) {
    const t = Math.max(0, Math.min(time, Math.max(0, el.duration - 0.001)));
    if (Math.abs(el.currentTime - t) < 0.0005 && el.readyState >= 2) return;
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        el.removeEventListener("seeked", done);
        el.removeEventListener("error", bad);
        resolve();
      };
      const bad = () => {
        clearTimeout(timer);
        el.removeEventListener("seeked", done);
        el.removeEventListener("error", bad);
        reject(new Error("Video seeking failed."));
      };
      const timer = setTimeout(bad, 10000);
      el.addEventListener("seeked", done, { once: true });
      el.addEventListener("error", bad, { once: true });
      el.currentTime = t;
    });
  }
  async function draw(time: number, playing = false) {
    if (disposed) return;
    const hit = locate(project, time);
    if (!hit) return;
    const s = hit.shot,
      take =
        s.takes.find(
          (t) => t.id === (options.preview ? s.viewingTakeId : s.adoptedTakeId),
        ) || s.takes[0],
      e = effects(s);
    let source: CanvasImageSource,
      sw: number,
      sh: number,
      sx = 0,
      sy = 0;
    if (take.videoUrl) {
      const el = await video(take.videoUrl);
      if (disposed) return;
      if (activeVideo !== el) {
        activeVideo?.pause();
        activeVideo = el;
      }
      if (playing) {
        el.playbackRate = s.speed;
        if (el.paused || Math.abs(el.currentTime - hit.local) > 0.18)
          await seek(el, hit.local);
        if (disposed) return;
        if (el.paused) await el.play();
      } else {
        el.pause();
        await seek(el, hit.local);
      }
      source = el;
      sw = el.videoWidth;
      sh = el.videoHeight;
    } else if (take.scene) {
      activeVideo?.pause();
      activeVideo = undefined;
      let p = scenes.get(take.id);
      if (!p) {
        const inner = document.createElement("canvas");
        p = createSceneRenderer(inner, take.scene, project.assets).then(
          (engine) => ({ canvas: inner, engine }),
        );
        scenes.set(take.id, p);
      }
      const value = await p;
      if (disposed) return;
      value.engine.draw(hit.local, options.width, options.height);
      source = value.canvas;
      sw = source.width;
      sh = source.height;
    } else {
      activeVideo?.pause();
      activeVideo = undefined;
      const ref = take.image || s.image,
        url = "url" in ref ? ref.url : "/reference/" + ref.sheet + ".png",
        img = await image(url);
      source = img;
      sw = (img as HTMLImageElement).naturalWidth;
      sh = (img as HTMLImageElement).naturalHeight;
      if ("rect" in ref) [sx, sy, sw, sh] = ref.rect;
    }
    if (disposed) return;
    const width = canvas.width,
      height = canvas.height,
      ratio =
        e.fit === "cover"
          ? Math.max(width / sw, height / sh)
          : Math.min(width / sw, height / sh);
    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = frameOpacity(s, hit.local);
    ctx.translate(width * (0.5 + e.x / 100), height * (0.5 + e.y / 100));
    ctx.rotate((e.rotation * Math.PI) / 180);
    ctx.scale(e.scale * (e.flipX ? -1 : 1), e.scale * (e.flipY ? -1 : 1));
    ctx.filter =
      "brightness(" +
      e.brightness +
      ") contrast(" +
      e.contrast +
      ") saturate(" +
      e.saturation +
      ") blur(" +
      (e.blur * width) / 1280 +
      "px)";
    ctx.drawImage(
      source,
      sx,
      sy,
      sw,
      sh,
      (-sw * ratio) / 2,
      (-sh * ratio) / 2,
      sw * ratio,
      sh * ratio,
    );
    ctx.restore();
    if (options.subtitles !== false)
      for (const l of s.layers) {
        if (hit.local < l.start || hit.local >= l.end) continue;
        ctx.save();
        ctx.globalAlpha = l.opacity;
        ctx.fillStyle = l.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font =
          "600 " +
          (l.fontSize * width) / 1280 +
          'px "NotoSansSC", "Segoe UI", sans-serif';
        ctx.shadowColor = "#0009";
        ctx.shadowBlur = (4 * width) / 1280;
        const lines = l.text.split("\n"),
          lh = ((l.fontSize * width) / 1280) * 1.3;
        lines.forEach((line, i) =>
          ctx.fillText(
            line,
            (width * l.x) / 100,
            (height * l.y) / 100 + (i - (lines.length - 1) / 2) * lh,
            width * 0.96,
          ),
        );
        ctx.restore();
      }
  }
  function dispose() {
    disposed = true;
    for (const p of media.values())
      void p
        .then((el) => {
          if (el instanceof HTMLVideoElement) {
            el.pause();
            el.removeAttribute("src");
            el.load();
          }
        })
        .catch(() => {});
    for (const p of scenes.values())
      void p.then((v) => v.engine.dispose()).catch(() => {});
  }
  return { draw, dispose };
}
