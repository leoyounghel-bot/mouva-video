# mouva studio

An editable video workspace with a visual storyboard, timeline, 3D scenes, local project storage, image generation and server-side MP4/WebM export.

The frontend runs on Cloudflare Workers with static assets. A separate Node service on Azure runs the job queue, Chromium, FFmpeg and optional model integrations. The browser calls a same-origin `/api/ai/*` proxy; provider keys stay on the backend.

## Run locally

Requires Node.js 24.11 or later. Install Chromium and FFmpeg for rendering.

```sh
npm ci
cp .env.ai.example .env.ai
npm run dev
```

Open `http://127.0.0.1:5173`. Set `CHROME_PATH` in `.env.ai` to your Chrome/Chromium executable. `FFMPEG_PATH` is optional when FFmpeg is on PATH. Local editing, scene manipulation and motion-reference rendering work without model keys. Directing or modifying scenes with AI requires `GEMINI_API_KEY`; finished generative video also requires `ARK_API_KEY` and a public HTTPS media address. Models are configurable on the server.

On Canvas, choose **Mouse type** in the zoom percentage menu. **Apple mouse / trackpad** swipes pan in either direction; hold Control and drag up/down or swipe to zoom around the pointer. **Standard mouse** retains wheel zoom, with Shift + wheel for horizontal panning. The preference is remembered; the initial default is Apple mode on macOS and standard mode elsewhere. In Select mode (V), drag a card's picture or title to move that node. Drag empty canvas, hold Space while dragging, or use Pan mode (H) to move the entire canvas. Preview buttons and scrubbers remain interactive. The − / + buttons, zoom presets and Ctrl/⌘ + plus/minus work in either mouse mode. Panning and Control-drag zoom are accumulated into one viewport update per animation frame, and the camera preference is saved after gestures stop.

The selected node keeps its prompt composer centered 16 pixels below the card. Selection and layout changes frame the card and controls together; dragging or panning does not auto-fit the camera. When the timeline opens, the prompt body scrolls while its Generate controls remain visible. **Mouva Agent** has immediate speed, trim, subtitle and color controls alongside natural-language editing. These edits affect the adopted version and can be undone. Switch back to the adopted version before editing a different preview. Agent conversations stay mounted while opening shot properties. Recent conversation history and unsent input are saved locally per account and project; page reloads restore context without restoring executable edit plans. Pending edits must be planned again against the current project.

Open **Image generation** in the workspace header, asset library or Agent generation controls to create images from a prompt and up to four PNG/JPEG/WebP references. Set `DEEPINFRA_API_KEY` on the server; the default model is [FLUX-2-klein-9b](https://deepinfra.com/black-forest-labs/FLUX-2-klein-9b/api), configurable with `AI_DEFAULT_IMAGE_MODEL`. Choose 1, 2 or 4 candidates per round. Completed images remain available in project-scoped history, and adopted images are saved to browser media storage for use as shot references or connected canvas nodes. Each candidate is a separate model call. Closing the panel keeps queued work running; use **Stop generation** to stop remaining candidates.

The production director, editable scene generator and AI editor use [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash/) through the server-side Codex harness and Google's native API. The default model is `gemini-3.8-flash`; override it with `GEMINI_MODEL`. Set `GEMINI_API_KEY` only in the backend's private `.env.ai` or secret store. No Anthropic or OpenAI key is needed. Seedance 2.5 generates the finished video from the rendered motion reference.

```sh
npm test
npm run test:harness
npm run build
npm start
```

The production build is served on port 5175. `MOUVA_ACCESS_TOKEN` is required for a public server in `local` mode; enter this workspace-only token in Server connection. It is not a provider key.

## Synthetic acceptance media

`npm run preview:reference` starts an optional loopback-only gateway on port 5176. It serves signed `reference.mp4` files only for the explicitly selected test project, and rejects management APIs, uploads, other media and other projects. Configure `MOUVA_PREVIEW_DATA_DIR`, `MOUVA_PREVIEW_PROJECT_ID` and `MOUVA_PREVIEW_PORT` to point it at an isolated acceptance backend. A temporary HTTPS tunnel can publish this gateway for an approved synthetic-video test. This is not the production media host and does not make other projects ready for generative video. Stop the tunnel when the test completes.

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

This repository starts with a clean history and contains source, dependency locks, examples, tests and application assets. It excludes deployment credentials, environment files, private projects, runtime generated media, logs, model weights and local development archives. The synthetic teaching samples in `public/learn/wuxia` are explicitly bundled application assets. Never add provider keys to `VITE_*` variables: those are shipped to browsers.

Mouva source is licensed under Apache-2.0. See [third-party notices](THIRD_PARTY_NOTICES.md) and the bundled font's [OFL license](public/fonts/OFL.txt).


## Built-in learning center

Open the book icon in the Studio rail, the Library learning entry, or `/?section=learn`. Seven bilingual courses cover canvas navigation, images, Agent edits, candidates, 3D, export and the Rain Gate case. Lessons appear in the same sidebar as Agent and shot properties, with links to the relevant tools and persistent progress.

The Rain Gate case opens an eight-shot practice copy with same-origin bundled video and animated GLB assets. The current project is saved to the account-scoped browser media database before switching. Returning to the original project also saves the practice copy for the next session. Playback, titles and the 0.75× speed exercise use existing media and do not submit AI generation requests. Export uploads the selected media to the normal local render pipeline. New model generation remains a separate explicit action.

The live-action-style AI sample was generated separately from text. The 3D choreography was programmed; this case does not claim the AI sample was produced from the GLB motion reference.
