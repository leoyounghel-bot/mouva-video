// Temporary acceptance gateway: only signed reference videos for one test project.
// Never exposes projects, provider credentials, job APIs, uploads or other media.
import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

export function referencePreview({ dataDir, projectId }) {
  return http.createServer(async (req, res) => {
    const reject = (code) => {
      res.writeHead(code, { "Cache-Control": "no-store" });
      res.end();
    };
    if (!["GET", "HEAD"].includes(req.method)) return reject(405);
    const url = new URL(req.url, "http://localhost");
    const match = /^\/api\/ai\/media\/([a-f0-9-]{36})\/reference\.mp4$/.exec(
      url.pathname,
    );
    const token = url.searchParams.get("token");
    if (
      !match ||
      !token ||
      token.length !== 64 ||
      [...url.searchParams.keys()].some((k) => k !== "token")
    )
      return reject(404);
    try {
      const job = JSON.parse(
        await readFile(path.join(dataDir, "jobs", match[1] + ".json"), "utf8"),
      );
      if (
        job.projectId !== projectId ||
        !job.referenceUrl ||
        typeof job.mediaToken !== "string" ||
        job.mediaToken.length !== token.length ||
        !timingSafeEqual(Buffer.from(job.mediaToken), Buffer.from(token))
      )
        return reject(404);
      const file = path.join(dataDir, "media", match[1], "reference.mp4");
      const size = (await stat(file)).size;
      let start = 0,
        end = size - 1,
        status = 200;
      if (req.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!range) return reject(416);
        start = Number(range[1]);
        end = range[2] ? Number(range[2]) : size - 1;
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start >= size
        )
          return reject(416);
        end = Math.min(end, size - 1);
        status = 206;
      }
      const headers = {
        "Content-Type": "video/mp4",
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      };
      if (status === 206)
        headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
      res.writeHead(status, headers);
      if (req.method === "HEAD") return res.end();
      const stream = createReadStream(file, { start, end });
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } catch {
      if (!res.headersSent) reject(404);
      else res.destroy();
    }
  });
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const app = referencePreview({
    dataDir: path.resolve(process.env.MOUVA_PREVIEW_DATA_DIR || ".mouva-ai"),
    projectId:
      process.env.MOUVA_PREVIEW_PROJECT_ID || "qa-studio-acceptance-20260930",
  });
  app.listen(Number(process.env.MOUVA_PREVIEW_PORT || 5176), "127.0.0.1", () =>
    console.log(
      "Reference acceptance gateway on 127.0.0.1:" + app.address().port,
    ),
  );
}
