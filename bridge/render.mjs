import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access } from "node:fs/promises";
import { ApiError } from "./providers.mjs";
import { exportSize } from "./editor-export.mjs";
export function referenceSize(ratio) {
  return (
    {
      "16:9": [960, 540],
      "9:16": [540, 960],
      "1:1": [720, 720],
      "4:3": [960, 720],
      "3:4": [720, 960],
      "21:9": [1260, 540],
    }[ratio] || [960, 540]
  );
}
export async function renderReference({
  project,
  settings = {},
  scene,
  assets,
  ratio,
  output,
  config,
  signal,
  onProgress = () => {},
}) {
  const [width, height] = project ? exportSize(settings) : referenceSize(ratio),
    seconds = project ? project.shots.reduce((n,s)=>n+(s.trimEnd-s.trimStart)/s.speed,0) : scene.duration,
    fps = project ? settings.fps : 24,
    total = Math.round(seconds * fps);
  const executablePath =
    config.chromePath ||
    (process.platform === "win32"
      ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
      : process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : "/usr/bin/chromium");
  try {
    await access(executablePath);
  } catch {
    throw new ApiError(
      503,
      "Chromium is missing. Set CHROME_PATH on the server.",
      "RENDERER_MISSING",
    );
  }
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage",
    ],
  });
  let encoder;
  const abort = () => {
    encoder?.kill("SIGTERM");
    void browser.close();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const origin = new URL(config.renderOrigin).origin;
    await page.route("**/*", (route) => {
      const u = route.request().url();
      if (
        u.startsWith("data:") ||
        u.startsWith("blob:") ||
        new URL(u).origin === origin
      )
        return route.continue();
      return route.abort();
    });
    await page.goto(origin + "/scene-render.html", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForFunction(
      () => typeof window.mouvaInitScene === "function",
      { timeout: 30000 },
    );
    await page.evaluate(
      async (args) => {
        if (args.project) await window.mouvaInitSequence(args); else await window.mouvaInitScene(args);
        await document.fonts.ready;
      },
      { scene, assets, width, height, project, settings },
    );
    let errors = "";
    encoder = spawn(
      config.ffmpegPath || "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "-framerate",
        String(fps),
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        ...(settings.format === "webm" ? ["libvpx-vp9", "-b:v", "0", "-crf", "30", "-deadline", "realtime"] : ["libx264", "-preset", "veryfast", "-crf", "19"]),
        "-pix_fmt",
        "yuv420p",
        ...(settings.format === "webm" ? [] : ["-movflags", "+faststart"]),
        output,
      ],
      { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
    );
    const finished = new Promise((resolve, reject) => {
      encoder.once("error", () =>
        reject(
          new ApiError(
            503,
            "FFmpeg is missing. Set FFMPEG_PATH on the server.",
            "ENCODER_MISSING",
          ),
        ),
      );
      encoder.once("close", (code) =>
        code === 0
          ? resolve()
          : reject(
              new ApiError(
                500,
                "Reference video encoding failed. " + errors.slice(-200),
                "ENCODER_FAILED",
              ),
            ),
      );
    });
    // Attach a handler immediately while frames are being sent.
    finished.catch(() => {});
    encoder.stderr.on("data", (chunk) => {
      errors = (errors + chunk).slice(-2000);
    });
    encoder.stdin.on("error", () => {});
    for (let frame = 0; frame < total; frame++) {
      signal?.throwIfAborted();
      const png = await page.evaluate(
        ({ t, sequence }) => sequence ? window.mouvaSequenceFrame(t) : window.mouvaSceneFrame(t),
        { t: frame / fps, sequence: !!project },
      );
      if (!encoder.stdin.write(Buffer.from(png, "base64")))
        await Promise.race([
          once(encoder.stdin, "drain"),
          finished.then(() => {
            throw new Error("Encoder exited early.");
          }),
        ]);
      if (frame % 12 === 0 || frame === total - 1)
        await onProgress(Math.round(((frame + 1) / total) * 100));
    }
    encoder.stdin.end();
    await finished;
    return { width, height, fps, duration: seconds, frames: total };
  } finally {
    signal?.removeEventListener("abort", abort);
    if (encoder && !encoder.killed) encoder.kill("SIGTERM");
    await browser.close();
  }
}

