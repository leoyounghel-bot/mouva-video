// Some static asset responses ignore Range. Keep lesson seeking incremental.
// The asset binding omits Content-Length; the edge adds it after our Worker.
// Regression tests check these lengths against the bundled public files.
export const LESSON_MEDIA_LENGTHS = {
  "/learn/wuxia/3d-film.mp4": 13048483,
  "/learn/wuxia/ai-film.mp4": 3397044,
};
function sliceBody(body, start, end) {
  const reader = body.getReader();
  let offset = 0;
  return new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) { controller.close(); return; }
          const next = offset + value.byteLength;
          if (next <= start) { offset = next; continue; }
          const lo = Math.max(0, start - offset);
          const hi = Math.min(value.byteLength, end + 1 - offset);
          offset = next;
          if (hi > lo) controller.enqueue(value.subarray(lo, hi));
          if (offset > end) { controller.close(); await reader.cancel(); }
          return;
        }
      } catch (error) { controller.error(error); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}

export async function lessonMedia(request, assets) {
  const headers = new Headers(request.headers);
  headers.delete("Range");
  headers.delete("If-Range");
  const response = await assets.fetch(new Request(request, { headers }));
  const length = Number(response.headers.get("Content-Length") ?? LESSON_MEDIA_LENGTHS[new URL(request.url).pathname]);
  if (response.status !== 200 || !response.body || !Number.isSafeInteger(length) || length <= 0
    || !response.headers.get("Content-Type")?.startsWith("video/")
    || (response.headers.get("Content-Encoding") && response.headers.get("Content-Encoding") !== "identity")) return response;
  const resultHeaders = new Headers(response.headers);
  resultHeaders.set("Accept-Ranges", "bytes");
  const range = request.headers.get("Range");
  const validator = request.headers.get("If-Range");
  const match = /^bytes=(\d*)-(\d*)$/.exec(range || "");
  if (request.method !== "GET" || !match || (!match[1] && !match[2])
    || (validator && validator !== response.headers.get("ETag") && validator !== response.headers.get("Last-Modified")))
    return new Response(response.body, { status: 200, headers: resultHeaders });
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(length - 1, Number(match[2])) : length - 1) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= length || start > end || (!match[1] && Number(match[2]) === 0)) {
    await response.body.cancel();
    resultHeaders.set("Content-Range", `bytes */${length}`);
    resultHeaders.set("Content-Length", "0");
    return new Response(null, { status: 416, headers: resultHeaders });
  }
  resultHeaders.set("Content-Range", `bytes ${start}-${end}/${length}`);
  resultHeaders.set("Content-Length", String(end - start + 1));
  return new Response(sliceBody(response.body, start, end), { status: 206, headers: resultHeaders });
}
