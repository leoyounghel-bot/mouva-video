<div align="center">

# Mouva Video

### Imagine worlds. Direct the motion. Tell your story.

An AI-assisted filmmaking workspace for cinematic worlds — from orbital stations and interstellar cities to starships crossing the unknown.

[**Open Mouva Video ↗**](https://video.mouva.ai/) · [Learn the workspace](https://video.mouva.ai/?section=learn&lang=en) · [中文教程](https://video.mouva.ai/?section=learn&lang=zh)

![Mouva Video science-fiction concept artwork: an orbital station, an interstellar city and a starship beneath a distant planet](docs/assets/interstellar-worlds.jpg)

<sub>Science-fiction concept artwork for this README. It is not a recorded product output or a playable video.</sub>

</div>

## Your next film starts with a world

A ring station suspended above a distant planet. A city stretching across an alien horizon. A starship breaking through the dawn.

Mouva Video brings your references, prompts, editable 3D scenes and video candidates into one connected canvas. Shape the scene, explore its motion, compare takes, and bring your selected shots together on the timeline.

**中文：** 从星际空间站、未来城市到穿越深空的飞船，把欧美科幻电影风格的灵感变成镜头计划。在同一工作区连接参考素材、编辑 3D 场景、比较视频候选，再剪辑与导出作品。

### Three worlds to imagine

These are creative starting points to try in the director, rather than bundled films. Actual output depends on the configured models and references.

| World | The shot | Try this direction |
| --- | --- | --- |
| **Orbital Station** | A quiet approach becomes an immense reveal. | *A colossal ring-shaped space station orbits a blue planet. A shuttle approaches the docking bay as the camera slowly tracks forward. Grounded industrial design, cool shadows, warm sunrise along the hull, cinematic science fiction.* |
| **Interstellar City** | A new civilization comes into view. | *A futuristic city spans the cliffs of an alien moon. Transit ships move between towering districts beneath a distant planet. A slow aerial reveal, atmospheric depth, restrained cyan lights and amber windows, epic cinematic scale.* |
| **Deep-Space Flight** | Stillness gives way to speed. | *An original exploration starship emerges from the shadow of an orbital station and accelerates toward open space. The camera follows its engines before widening to reveal the planet below. Realistic materials, precise motion and dramatic film lighting.* |

## From imagination to the final cut

| Create | What you can do |
| --- | --- |
| **Build the canvas** | Connect images, video, audio and editable 3D nodes in a visual story workspace. |
| **Direct the scene** | Use the AI director to plan shots and create or revise editable 3D scenes. Adjust objects, cameras and timing. |
| **Explore the motion** | Render a motion reference, generate video candidates with configured providers, and compare versions before adoption. |
| **Make the cut** | Arrange adopted shots, edit audio and subtitles, then export MP4 or WebM through the rendering service. |

Start with a reference image and a clear shot description. Keep the world consistent, develop one shot at a time, and choose the takes that best serve your story.

The workspace includes local project storage and bilingual tutorials. Editable 3D scenes and flat AI-generated videos are distinct outputs; generated video does not automatically become editable 3D.

The frontend runs on Cloudflare Workers with static assets. A separate Node service on Azure runs the job queue, Chromium, FFmpeg and optional model integrations. The browser calls a same-origin `/api/ai/*` proxy; provider keys stay on the backend. This repository contains only Mouva Video; the main Mouva account service and other Mouva products are outside its scope.

## Watch and learn / 观看与学习

[Open Mouva Studio](https://video.mouva.ai/) · [Canvas tutorial](https://video.mouva.ai/?section=learn&lang=en) · [中文画布教程](https://video.mouva.ai/?section=learn&lang=zh)

[![Rain Gate — two swordsmen in a cinematic AI video](public/learn/wuxia/ai-poster.jpg)](https://video.mouva.ai/?section=learn&lang=en)

**Rain Gate / 雨门交锋:** an eight-shot, 32-second editable 3D sequence and a separate 12-second, 720p AI film. The AI film is a flat video; its characters are not recovered as editable 3D. Follow the in-canvas tutorial to adjust timing, compare candidates and export.

## Run locally

Requires Node.js 24.11 or later. Install Chromium and FFmpeg for rendering.

```sh
npm ci
cp .env.ai.example .env.ai
npm run dev
```

Open `http://127.0.0.1:5173`. Set `CHROME_PATH` in `.env.ai` to your Chrome/Chromium executable. `FFMPEG_PATH` is optional when FFmpeg is on PATH. Local editing, scene manipulation and motion-reference rendering work without model keys. Directing or modifying scenes with AI requires `GEMINI_API_KEY`; finished generative video also requires `ARK_API_KEY` and a public HTTPS media address. Models are configurable on the server.

Use the permanent **New project / 新建项目** button beside the project name in the top header to name a fresh project and choose landscape, portrait or square. It starts with one blank video node, without demo media. The current project is saved before switching; open the project menu to return to saved projects. Project snapshots and imported media remain in this browser, scoped to the signed-in account.

Use the bottom **＋** menu in Canvas to create **Video, Audio, Image and 3D** nodes or import media. Image nodes support upload and image generation; adopting a generated image into its node keeps existing connections. Audio nodes support upload, playback and audio editing. 3D nodes use the existing editable scene studio. Drag a right output port to a left input port to connect nodes, or double-click blank canvas for the complete node menu. Connections survive refresh and project switching. Creating projects and nodes does not submit model generation.

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
- Browser projects, media and UI state are separated by account. Projects currently remain in that browser; cross-device project synchronization is not implemented. Hosted Studio can share the Mouva Design credit ledger through a private authenticated billing service; activation requires the matching account-server migration and confirmed service rates.
- Media links are unguessable bearer links for playback and rendering. Anyone you share a complete media URL with can retrieve that file. They do not grant job-management access.
- The disk-backed queue targets a single backend instance with a persistent volume. Both export pipelines share one render slot. Horizontal replication requires shared storage and a distributed queue.

## Open-source boundary

Run `npm run check:public` before pushing. The same credential and private-file check runs in CI; see [private configuration guidance](SECURITY.md).

This repository starts with a clean history and contains source, dependency locks, examples, tests and application assets. It excludes deployment credentials, environment files, private projects, runtime generated media, logs, model weights and local development archives. The synthetic teaching samples in `public/learn/wuxia` are explicitly bundled application assets. Never add provider keys to `VITE_*` variables: those are shipped to browsers.

Mouva source is licensed under Apache-2.0. See [third-party notices](THIRD_PARTY_NOTICES.md) and the bundled font's [OFL license](public/fonts/OFL.txt).


## Built-in learning center

Open the book icon in the Studio rail, the Library learning entry, or `/?section=learn`. Seven bilingual courses cover canvas navigation, images, Agent edits, candidates, 3D, export and the Rain Gate case. The canvas toolbar opens a collapsible learning lane inside the workspace. Browse lessons, play the example and work through steps while the canvas and Agent remain available; nodes, prompts and bottom controls are never covered. Progress is persistent.

The Rain Gate case opens an eight-shot practice copy with same-origin bundled video and animated GLB assets. The current project is saved to the account-scoped browser media database before switching. Returning to the original project also saves the practice copy for the next session. Playback, titles and the 0.75× speed exercise use existing media and do not submit AI generation requests. Export uploads the selected media to the normal local render pipeline. New model generation remains a separate explicit action.

The live-action-style AI sample was generated separately from text. The 3D choreography was programmed; this case does not claim the AI sample was produced from the GLB motion reference.

## Hosted credits / 线上积分

When hosted billing is enabled, Studio reviews a server-owned quote before AI dispatch. Each candidate reserves credits separately; adopting a version is free. Completed work settles once, confirmed failures release unused reservations, and uncertain submissions remain reserved for reconciliation. Studio's **Credits and billing** view shows the shared balance and account-scoped history. Local development keeps existing behavior.

See [the billing integration](docs/billing.md). Configure the shared billing URL and secret only on the backend. API costs, service retail quotes and final provider invoices are separate records; this repository does not promise unlimited paid AI generation.

### 图片、3D 与视频候选

Canvas 中连接图片和 3D 到视频节点后，生成「AI 视频候选」会同时向视频模型传递图片外观参考和 Three.js 渲染的运动参考。已有 3D 默认保持不变；勾选修改场景才会重新设计。连线中的 3D 优先使用最新编辑设置，历史候选和源场景保留，可比较、采用或继续生成。

音频节点导入素材后选择「加入人声」「加入音乐」或「加入音效」，在当前播放位置插入对应时间线轨道。空轨道可直接导入，也可将音频文件或素材拖入对应轨道；混音参数、字幕与视频最终通过时间线预览和导出。音频不作为视觉生成参考。

### 时间线轨道编辑

拖动标尺或播放头定位；缩放时保持当前播放位置，播放时自动滚动。单击片段选择对应剪辑工具，视频可拖动重新排序和裁剪边缘，音频可直接移动、跨人声/音乐/音效轨道、裁剪、分割、复制和调音量。重叠音频自动分行。双击音频打开详细设置，轨道名称旁的 + 可继续导入。S 在播放头处分割当前选中的视频或音频，Delete 删除选中片段，⌘/Ctrl+Z 撤销，Shift+⌘/Ctrl+Z 重做，Escape 取消正在进行的拖动。时间线预览与导出均使用已采用版本。
