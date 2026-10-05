<div align="center">

# Mouva Video

### 创造世界，导演动作，完成你的电影。

从雨夜里的武侠交锋，到驶向深空的探索飞船。

把灵感、可编辑 3D 动作和 AI 镜头连接起来，在同一工作区完成你的故事。

[**进入 Mouva Video ↗**](https://video.mouva.ai/) · [中文画布教程](https://video.mouva.ai/?section=learn&lang=zh) · [English tutorial](https://video.mouva.ai/?section=learn&lang=en)

[![太空旅行成片画面：飞船接近空间站、掠过星际城市，再驶向深空](docs/showcase/space-travel/hero.jpg)](https://raw.githubusercontent.com/leoyounghel-bot/mouva-video/main/docs/showcase/space-travel/film-1080p.mp4)

**[观看 / 下载《太空旅行》1080p 成片](https://raw.githubusercontent.com/leoyounghel-bot/mouva-video/main/docs/showcase/space-travel/film-1080p.mp4)** · 24 秒 · 三个连续镜头 · 配乐与引擎声

<sub>封面来自实际生成的视频。成片没有添加介绍文字、标题或字幕，保留模型的 AI 生成标识。</sub>

</div>

## 作品放映厅

<table>
<tr>
<td width="50%" valign="top">

### 太空旅行

[![太空旅行：空间站与探索飞船](docs/showcase/space-travel/station.jpg)](https://raw.githubusercontent.com/leoyounghel-bot/mouva-video/main/docs/showcase/space-travel/film-1080p.mp4)

空间站 → 星际城市 → 未知深空。三个镜头，串起一段 24 秒的太空旅程。

**[观看 1080p 成片 ↗](https://raw.githubusercontent.com/leoyounghel-bot/mouva-video/main/docs/showcase/space-travel/film-1080p.mp4)** · [3D 动作预演](docs/showcase/space-travel/motion-preview.glb)

</td>
<td width="50%" valign="top">

### 雨门交锋

[![雨门交锋：雨夜中的武侠对决](public/learn/wuxia/ai-poster.jpg)](https://raw.githubusercontent.com/leoyounghel-bot/mouva-video/main/public/learn/wuxia/ai-film.mp4)

两位剑客在雨夜交锋。保留原有武侠案例、可编辑 3D 动作与画布练习。

**[观看武侠 AI 成片 ↗](https://raw.githubusercontent.com/leoyounghel-bot/mouva-video/main/public/learn/wuxia/ai-film.mp4)** · [进入中文教程](https://video.mouva.ai/?section=learn&lang=zh)

</td>
</tr>
</table>

《雨门交锋》包含八镜头、32 秒的可编辑 3D 序列，以及独立生成的 12 秒、720p AI 视频。AI 成片是平面视频，角色不是从视频中恢复的可编辑模型。教程支持调整时序、比较候选和导出。

---

## 新作品：太空旅行

一艘探索飞船接近巨型环形空间站，穿过异星城市的高楼与空中航道，最后加速驶向未知深空。作品以欧美科幻电影风格为方向，用冷色金属、行星晨光和推进器光芒连接三个镜头。

![太空旅行的三个镜头](docs/showcase/space-travel/poster.jpg)

| 时间 | 镜头 | 画面与动作 |
| --- | --- | --- |
| **00:00–00:08** | 空间站接近 | 飞船靠近行星上方的巨型空间站，逐步展现轨道设施与城市尺度。 |
| **00:08–00:16** | 星际城市掠飞 | 飞船穿行于未来城市的高层建筑之间，镜头跟随推进器进入城市航道。 |
| **00:16–00:24** | 飞船驶向深空 | 飞船离开轨道设施，加速飞向开阔宇宙，结束这段太空旅程。 |

这三段视频使用 Mouva 配置的 Seedance 视频模型生成，再拼接为 1920 × 1080、24 fps 的 MP4。前两段原片为 720p，合片时放大至 1080p；第三段为原生 1080p。

**[下载可编辑 3D 动作预演（GLB）](docs/showcase/space-travel/motion-preview.glb)**：包含飞船、环形空间站、城市和相机动画。这份 3D 场景独立制作，没有参与本案例三个 AI 镜头的生成，也不是从成片反向还原的模型。

<details>
<summary>查看太空世界概念图</summary>

![太空世界概念图：空间站、星际城市与探索飞船](docs/assets/interstellar-worlds.jpg)

这张图是项目的科幻视觉概念参考，视频封面及上方成片链接展示实际生成结果。

</details>

## 一个工作区，完成四步创作

| 创作阶段 | 工作区能力 |
| --- | --- |
| **搭建画布** | 连接图片、视频、音频和可编辑 3D 节点，把参考素材组织成镜头计划。 |
| **导演场景** | 用 AI 导演规划镜头，创建或调整 3D 对象、相机与时间设置。 |
| **探索动作** | 渲染运动参考，通过已配置的模型生成视频候选，比较版本后选择采用。 |
| **完成剪辑** | 将采用的镜头排入时间线，编辑音频与字幕，通过渲染服务导出 MP4 或 WebM。 |

从参考图和清晰的镜头描述开始，逐个镜头建立统一世界，再选择适合叙事的版本。工作区提供本地项目存储和双语教程；可编辑 3D 场景与 AI 生成的平面视频是不同的输出形式。

前端通过 Cloudflare Workers 提供静态资源，独立 Node 服务处理任务队列、Chromium、FFmpeg 和可选模型接入。浏览器通过同源 `/api/ai/*` 代理调用服务，模型密钥保留在后端。此仓库仅包含 Mouva Video；Mouva 主账号服务和其他产品不在本仓库范围内。

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

This repository starts with a clean history and contains source, dependency locks, examples, tests and application assets. It excludes deployment credentials, environment files, private projects, runtime generated media, logs, model weights and local development archives. The synthetic teaching samples in `public/learn/wuxia` and the space-travel showcase in `docs/showcase/space-travel` are explicitly bundled public examples. Never add provider keys to `VITE_*` variables: those are shipped to browsers.

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
