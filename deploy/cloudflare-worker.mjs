import { mainLogin } from "./main-login.mjs";
import { lessonMedia } from "./lesson-media.mjs";
const responseHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
export default {
  async fetch(request, env) {
    const login = mainLogin(request);
    if (login) return login;
    const url = new URL(request.url);
    let response;
    if (url.pathname.startsWith("/api/")) {
      if (!url.pathname.startsWith("/api/ai/")) return new Response("Not found", { status: 404 });
      let base;
      try { base = new URL(env.BACKEND_URL); } catch { return new Response("Video service is not configured", { status: 503 }); }
      if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
        return new Response("Video service is not configured", { status: 503 });
      const upstream = new URL(base.href.replace(/\/$/, "") + url.pathname + url.search);
      const headers = new Headers(request.headers);
      for (const name of ["host", "connection", "cf-access-client-id", "cf-access-client-secret", "x-forwarded-host"])
        headers.delete(name);
      // Pass the browser Origin unchanged: the backend checks it for CSRF.
      try {
        response = await (env.fetcher || fetch)(upstream, {
          method: request.method, headers,
          body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
          redirect: "manual", signal: request.signal,
        });
      } catch { return Response.json({ message: "The video service is temporarily unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
      const result = new Response(response.body, response);
      result.headers.set("Cache-Control", "no-store");
      for (const [key, value] of Object.entries(responseHeaders)) result.headers.set(key, value);
      return result;
    }
    response = /^\/learn\/wuxia\/(3d-film|ai-film)\.mp4$/.test(url.pathname)
      ? await lessonMedia(request, env.ASSETS)
      : await env.ASSETS.fetch(request);
    const result = new Response(response.body, response);
    for (const [key, value] of Object.entries(responseHeaders)) result.headers.set(key, value);
    result.headers.set("X-Frame-Options", "DENY");
    return result;
  },
};
