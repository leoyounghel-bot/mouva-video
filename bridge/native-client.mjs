import path from "node:path";
import os from "node:os";
import { createHarness, HarnessError } from "@mouva/codex-harness";

// This pool belongs only to the video backend. No service, process, credentials
// or task queue is shared with the graphic-design backend.
const runners = new WeakMap();
export function generateWithClaude(options, { config, signal, fetcher = fetch, CodexClass }) {
  if (!config.anthropicKey || !/^claude-[A-Za-z0-9._:-]+$/.test(config.claudeModel || "")) {
    throw new HarnessError("configuration", 503);
  }
  let entry = runners.get(config);
  if (!entry || entry.fetcher !== fetcher || entry.CodexClass !== CodexClass) {
    const env = {
      ...process.env,
      MOUVA_CODEX_WORK_DIR: path.join(config.dataDir || os.tmpdir(), "model-runs"),
      ...config.harnessEnv,
    };
    entry = { fetcher, CodexClass, harness: createHarness({
      env, fetchImpl: fetcher,
      ...(CodexClass ? { clientFactory: async (options) => new CodexClass(options) } : {}),
    }) };
    runners.set(config, entry);
  }
  return entry.harness.generate({
    ...options, signal,
    provider: { provider: "anthropic", model: config.claudeModel,
      apiKey: config.anthropicKey, baseUrl: config.anthropicBase },
  });
}
