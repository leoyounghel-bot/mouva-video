# Third-party notices

Dependencies are installed from the pinned npm lockfile and retain their own licenses. They are not relicensed by Mouva's Apache-2.0 license. Principal dependencies include React and React DOM (MIT), Three.js (MIT), React Flow (MIT), Playwright (Apache-2.0), and the OpenAI Codex SDK (Apache-2.0).

`vendor/codex-harness` is Mouva's protocol adapter and orchestration code. It uses the separately installed Codex SDK; it does not contain a copy of the Codex CLI binary.

`public/fonts/NotoSansSC.ttf` is provided under the SIL Open Font License in `public/fonts/OFL.txt`. Keep this notice with redistributed font files.

Chromium, FFmpeg, Node.js and operating-system packages are installed by the container build and carry their upstream licenses. Inspect the chosen distribution packages and enabled FFmpeg codecs when redistributing container binaries.
