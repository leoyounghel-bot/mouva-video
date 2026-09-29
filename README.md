# Mouva Video

An editable video workspace with a visual storyboard, timeline, 3D scenes, local project storage and server-side MP4/WebM export.

The frontend runs on Cloudflare Workers with static assets. A separate Node service on Azure runs the job queue, Chromium, FFmpeg and optional model integrations. The browser calls a same-origin `/api/ai/*` proxy; provider keys stay on the backend.

## Run locally

Requires Node.js 24.11 or later. Install Chromium and FFmpeg for rendering.

```sh
npm ci
cp .env.ai.example .env.ai
npm run dev
```

Open `http://127.0.0.1:5173`. Set `CHROME_PATH` in `.env.ai` to your Chrome/Chromium executable. `FFMPEG_PATH` is optional when FFmpeg is on PATH. Local editing, scene manipulation and motion-reference rendering work without model keys. Directing or modifying scenes with AI requires `GEMINI_API_KEY`; finished generative video also requires `ARK_API_KEY` and a public HTTPS media address. Models are configurable on the server.

The production director, editable scene generator and AI editor use [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash/) through the server-side Codex harness and Google's native API. The default model is `gemini-3.8-flash`; override it with `GEMINI_MODEL`. Set `GEMINI_API_KEY` only in the backend's private `.env.ai` or secret store. No Anthropic or OpenAI key is needed. Seedance 2.5 generates the finished video from the rendered motion reference.

```sh
npm test
npm run test:harness
npm run build
npm start
```

The production build is served on port 5175. `MOUVA_ACCESS_TOKEN` is required for a public server in `local` mode; enter this workspace-only token in Server connection. It is not a provider key.

## Deploy

See [deployment instructions](docs/deployment.md). Build the frontend with `VITE_MOUVA_AUTH_MODE=mouva` for the hosted account flow, and configure the matching server variables. The public `wrangler.jsonc` contains placeholder addresses only.

```sh
VITE_MOUVA_AUTH_MODE=mouva VITE_MOUVA_LOGIN_ORIGIN=https://mouva.ai npm run build
npm run deploy:frontend
```

For an independent installation, retain local mode or implement an identity adapter for your own account service. The hosted Mouva integration is optional; this repository does not include the main Mouva account service or its database.

## Accounts and storage

- Hosted mode validates the main account against a fixed server-configured identity endpoint. A one-time 60-second handoff is bound to the initiating browser. The main access token is neither put in the redirect URL nor persisted by the video service.
- Video sessions use an independent signed, HttpOnly, Secure cookie with an eight-hour lifetime. Jobs, uploads, idempotency keys and parent-job references are checked against the authenticated account. Old local records remain in the local workspace.
- Browser projects, media and UI state are separated by account. Projects currently remain in that browser; cross-device project synchronization and shared Mouva billing/credits are not implemented.
- Media links are unguessable bearer links for playback and rendering. Anyone you share a complete media URL with can retrieve that file. They do not grant job-management access.
- The disk-backed queue targets a single backend instance with a persistent volume. Both export pipelines share one render slot. Horizontal replication requires shared storage and a distributed queue.

## Open-source boundary

This repository starts with a clean history and contains source, dependency locks, examples, tests and application assets. It excludes deployment credentials, environment files, private projects, generated media, logs, model weights and local development archives. Never add provider keys to `VITE_*` variables: those are shipped to browsers.

Mouva source is licensed under Apache-2.0. See [third-party notices](THIRD_PARTY_NOTICES.md) and the bundled font's [OFL license](public/fonts/OFL.txt).
