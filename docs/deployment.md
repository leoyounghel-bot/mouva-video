# Cloudflare frontend and Azure backend

## Azure

Build `deploy/Dockerfile` and run one container with a persistent volume mounted at `/app/runtime`. Publish port 5175 only behind your HTTPS proxy. Chromium and FFmpeg are included; the process runs as the unprivileged `node` user. Keep your environment file outside the source checkout with mode 600.

The backend serves the same production renderer files used by the frontend, so `/scene-render.html` remains available internally to Chromium even when the public workspace lives on Cloudflare.

For hosted accounts configure:

```dotenv
MOUVA_AUTH_MODE=mouva
MOUVA_SESSION_SECRET=
MOUVA_FRONTEND_ORIGIN=https://video.example.com
MOUVA_LOGIN_ORIGIN=https://mouva.example.com
MOUVA_IDENTITY_URL=https://api.example.com/api/auth/me
MOUVA_PUBLIC_ORIGIN=https://video-api.example.com
```

Generate `MOUVA_SESSION_SECRET` using a cryptographic random generator (at least 32 characters). Never reuse the account server's JWT signing secret. The identity endpoint must validate a bearer token and return `{ "user": { "id": "stable-user-id" } }`; it is selected by the operator, never by a browser request. Configure optional model keys in the same protected environment file.

AI directing, scene generation and editing use `GEMINI_API_KEY` with `GEMINI_MODEL=gemini-3.8-flash` by default. Finished generative video also uses `ARK_API_KEY` for Seedance. Keep both keys on the Azure backend; the Cloudflare frontend does not need them.

Back up the runtime volume, including jobs and uploads. Do not add it to Git. Check `GET /api/ai/health`; configuration availability is visible to authenticated users at `/api/ai/status`. Health alone does not prove that model credentials are valid.

## Cloudflare

Set `BACKEND_URL` in a private Wrangler configuration to the Azure HTTPS origin. Build with `VITE_MOUVA_AUTH_MODE=mouva` and the intended `VITE_MOUVA_LOGIN_ORIGIN`. Use a fixed production domain matching `MOUVA_FRONTEND_ORIGIN`. Preview domains deliberately cannot issue production sessions.

`deploy/cloudflare-worker.mjs` proxies only `/api/ai/*` to the fixed backend. It preserves browser Origin, session cookies, body streams and Range headers. API and media responses are not edge-cached. The browser never receives a proxy or provider secret. Keep the backend Origin checks enabled.

## Main Mouva login link

The main frontend's `/video` entry first opens the video site's `/?login=1`. Video `POST /api/ai/auth/start` sets a browser verifier and returns the main `/video?challenge=...` URL. After ordinary Mouva authentication, the main frontend sends its bearer token and challenge to the video backend's `/api/ai/auth/handoff`. The returned `launchUrl` carries only a one-time code in its fragment. Video clears the fragment and exchanges the code using its verifier cookie.

Only the configured main frontend Origin can request handoffs. Only the configured video frontend Origin can start, exchange or terminate sessions. API requests include the current workspace ID so a tab opened for another account cannot silently submit old project data after cookies change.

## Boundaries

One server instance owns the file queue and rendering slot. Scaling, automatic media retention, cloud project synchronization, usage billing and account-wide session revocation are separate work. Video sessions expire independently within eight hours or when the video signing secret is rotated. A model's readiness flag confirms configuration, not a paid end-to-end generation result.

## Independent login entry

The video Worker also serves a small first-party login entry at `mouva.ai/video`
and `/video/launch.js`. Add the exact `mouva.ai/video*` route to the private Worker
configuration, alongside its `video.mouva.ai` custom domain. This entry does not
replace the Design frontend release. It uses the existing main-site account
session for the same one-time handoff, with a separate sign-in window when needed.
It sends account credentials only to the fixed Mouva API origin. Chinese and
English selection and the learning-center destination survive the handoff.
