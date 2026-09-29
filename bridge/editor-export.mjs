import { spawn } from "node:child_process";
import { rename } from "node:fs/promises";
import {
  effects,
  validateEffects,
  validateAudio,
} from "../src/frontend/editor/commands.ts";
import { validateScene } from "../src/frontend/native/schema.ts";
import { ApiError } from "./providers.mjs";
export function validateExport(input) {
  const p = input.project,
    s = {
      format: "mp4",
      resolution: "720p",
      aspectRatio: "16:9",
      fps: 24,
      includeAudio: true,
      includeSubtitles: true,
      ...input.settings,
    };
  if (
    !p ||
    p.schemaVersion !== 1 ||
    typeof p.id !== "string" ||
    !Array.isArray(p.shots) ||
    !p.shots.length ||
    p.shots.length > 100 ||
    !Array.isArray(p.assets) ||
    !Array.isArray(p.audio) ||
    !Array.isArray(p.characters)
  )
    throw new ApiError(400, "Invalid project snapshot.");
  if (
    !["mp4", "webm"].includes(s.format) ||
    !["720p", "1080p", "4K"].includes(s.resolution) ||
    !["16:9", "9:16", "1:1"].includes(s.aspectRatio) ||
    ![24, 25, 30, 60].includes(s.fps) ||
    typeof s.includeAudio !== "boolean" ||
    typeof s.includeSubtitles !== "boolean"
  )
    throw new ApiError(400, "Invalid export settings.");
  let duration = 0;
  const ids = new Set();
  for (const shot of p.shots) {
    if (
      typeof shot.id !== "string" ||
      ids.has(shot.id) ||
      !Number.isFinite(shot.duration) ||
      shot.duration <= 0 ||
      shot.duration > 3600 ||
      !Number.isFinite(shot.speed) ||
      shot.speed < 0.25 ||
      shot.speed > 4 ||
      !Number.isFinite(shot.trimStart) ||
      !Number.isFinite(shot.trimEnd) ||
      shot.trimStart < 0 ||
      shot.trimEnd > shot.duration ||
      shot.trimEnd <= shot.trimStart ||
      !Array.isArray(shot.layers) ||
      shot.layers.length > 100
    )
      throw new ApiError(400, "Invalid clip timing or layers.");
    ids.add(shot.id);
    duration += (shot.trimEnd - shot.trimStart) / shot.speed;
    validateEffects(effects(shot), shot);
    const take = shot.takes?.find((t) => t.id === shot.adoptedTakeId);
    if (!take || take.status !== "succeeded")
      throw new ApiError(400, "A clip has no ready adopted candidate.");
    if (Number.isFinite(take.duration) && take.duration + 0.001 < shot.trimEnd)
      throw new ApiError(
        400,
        "A media source is shorter than its clip. Trim the clip before exporting.",
      );
    if (take.scene) {
      validateScene(take.scene, new Set(p.assets.map((a) => a.id)));
      if (take.scene.duration < shot.trimEnd)
        throw new ApiError(400, "A scene is shorter than its clip.");
    }
    for (const l of shot.layers)
      if (
        typeof l.text !== "string" ||
        l.text.length > 2000 ||
        !Number.isFinite(l.start) ||
        !Number.isFinite(l.end) ||
        l.start < 0 ||
        l.end > shot.duration ||
        l.end <= l.start ||
        ![l.x, l.y, l.fontSize, l.opacity].every(Number.isFinite) ||
        l.x < 0 ||
        l.x > 100 ||
        l.y < 0 ||
        l.y > 100 ||
        l.fontSize < 8 ||
        l.fontSize > 200 ||
        l.opacity < 0 ||
        l.opacity > 1 ||
        !/^#[a-f0-9]{6}$/i.test(l.color)
      )
        throw new ApiError(400, "Invalid text layer.");
  }
  if (duration > 600)
    throw new ApiError(
      400,
      "Local exports currently support sequences up to 10 minutes.",
    );
  if (p.audio.length > 80) throw new ApiError(400, "Too many audio clips.");
  for (const a of p.audio)
    validateAudio(a, p.assets.find((x) => x.id === a.assetId)?.duration);
  return { ...input, settings: s, duration };
}
export function exportSize(s) {
  const short =
    s.resolution === "4K" ? 2160 : s.resolution === "1080p" ? 1080 : 720;
  return s.aspectRatio === "1:1"
    ? [short, short]
    : s.aspectRatio === "9:16"
      ? [short, Math.round((short * 16) / 9 / 2) * 2]
      : [Math.round((short * 16) / 9 / 2) * 2, short];
}
async function processResult(executable, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      error = "";
    child.stdout.on("data", (v) => (output += v));
    child.stderr.on("data", (v) => (error = (error + v).slice(-1000)));
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.on("error", reject);
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      code === 0
        ? resolve(output)
        : reject(new Error("Audio encoding failed: " + error));
    });
  });
}
export async function mixExportAudio({
  project,
  settings,
  duration,
  silent,
  output,
  config,
  signal,
  fileForUrl,
}) {
  if (!settings.includeAudio) {
    await rename(silent, output);
    return;
  }
  const inputs = [],
    filters = [],
    streams = [],
    solo = project.audio.some(
      (a) =>
        !a.demo &&
        !a.muted &&
        a.solo &&
        project.assets.some((x) => x.id === a.assetId && x.url),
    );
  let position = 0;
  for (const shot of project.shots) {
    const take = shot.takes.find((t) => t.id === shot.adoptedTakeId),
      e = effects(shot),
      length = (shot.trimEnd - shot.trimStart) / shot.speed;
    if (take?.videoUrl && !e.muted && e.volume > 0 && !solo) {
      const file = await fileForUrl(take.videoUrl);
      const probe = await processResult(
        config.ffprobePath || "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "a:0",
          "-show_entries",
          "stream=index",
          "-of",
          "csv=p=0",
          file,
        ],
        signal,
      );
      if (String(probe).trim())
        inputs.push({
          file,
          start: position,
          duration: length,
          sourceStart: shot.trimStart,
          sourceEnd: shot.trimEnd,
          speed: shot.speed,
          gain: e.volume,
          pan: 0,
          fadeIn: 0,
          fadeOut: 0,
        });
    }
    position += length;
  }
  for (const a of project.audio) {
    if (a.demo || a.muted || (solo && !a.solo) || a.start >= duration) continue;
    const asset = project.assets.find((x) => x.id === a.assetId);
    if (!asset?.url) throw new Error("Missing audio asset: " + a.name);
    inputs.push({
      ...a,
      file: await fileForUrl(asset.url),
      sourceStart: a.sourceStart || 0,
      sourceEnd: (a.sourceStart || 0) + a.duration,
      speed: 1,
      duration: Math.min(a.duration, duration - a.start),
    });
  }
  if (!inputs.length) {
    await rename(silent, output);
    return;
  }
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", silent];
  for (const item of inputs) args.push("-i", item.file);
  inputs.forEach((a, i) => {
    let tempo = a.speed,
      parts = [];
    while (tempo > 2) {
      parts.push("atempo=2");
      tempo /= 2;
    }
    while (tempo < 0.5) {
      parts.push("atempo=0.5");
      tempo /= 0.5;
    }
    parts.push("atempo=" + tempo);
    let filter =
      "[" +
      String(i + 1) +
      ":a]atrim=start=" +
      a.sourceStart +
      ":end=" +
      a.sourceEnd +
      ",asetpts=PTS-STARTPTS," +
      parts.join(",") +
      ",aformat=sample_rates=48000:channel_layouts=stereo,volume=" +
      a.gain;
    if (a.pan)
      filter +=
        ",pan=stereo|c0=" +
        Math.min(1, 1 - a.pan) +
        "*c0|c1=" +
        Math.min(1, 1 + a.pan) +
        "*c1";
    if (a.fadeIn)
      filter += ",afade=t=in:st=0:d=" + Math.min(a.fadeIn, a.duration);
    if (a.fadeOut)
      filter +=
        ",afade=t=out:st=" +
        Math.max(0, a.duration - a.fadeOut) +
        ":d=" +
        Math.min(a.fadeOut, a.duration);
    filter +=
      ",adelay=" +
      Math.round(a.start * 1000) +
      "|" +
      Math.round(a.start * 1000) +
      "[a" +
      i +
      "]";
    filters.push(filter);
    streams.push("[a" + i + "]");
  });
  filters.push(
    streams.join("") +
      "amix=inputs=" +
      inputs.length +
      ":duration=longest:normalize=0,alimiter=limit=0.95,apad,atrim=duration=" +
      duration +
      "[audio]",
  );
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[audio]",
    "-c:v",
    "copy",
    "-c:a",
    settings.format === "webm" ? "libopus" : "aac",
    "-t",
    String(duration),
  );
  if (settings.format === "mp4") args.push("-movflags", "+faststart");
  args.push(output);
  await processResult(config.ffmpegPath || "ffmpeg", args, signal);
}
