'use strict';
const { mkdir, mkdtemp, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { HarnessError, check } = require('./protocol.cjs');
const { startGateway } = require('./gateway.cjs');

function integer(value, fallback, minimum, maximum) {
  const n = value === undefined || value === '' ? fallback : Number(value);
  check(Number.isSafeInteger(n) && n >= minimum && n <= maximum, 'configuration'); return n;
}
class Slots {
  constructor(limit, maximum) { this.limit = limit; this.maximum = maximum; this.active = 0; this.waiters = []; }
  async acquire(signal) {
    signal.throwIfAborted();
    if (this.active < this.limit) { this.active++; return this.releaseOnce(); }
    if (this.waiters.length >= this.maximum) throw new HarnessError('busy', 503);
    return new Promise((resolve, reject) => {
      const waiter = { signal, resolve, reject, abort: () => {
        const i = this.waiters.indexOf(waiter); if (i >= 0) this.waiters.splice(i, 1);
        reject(signal.reason);
      }};
      this.waiters.push(waiter); signal.addEventListener('abort', waiter.abort, { once: true });
      if (signal.aborted) waiter.abort();
    });
  }
  releaseOnce() {
    let released = false;
    return () => {
      if (released) return; released = true;
      let next;
      while ((next = this.waiters.shift())) {
        next.signal.removeEventListener('abort', next.abort);
        if (next.signal.aborted) { next.reject(next.signal.reason); continue; }
        next.resolve(this.releaseOnce()); return;
      }
      this.active--;
    };
  }
}
const defaultFactory = async options => { const { Codex } = await import('@openai/codex-sdk'); return new Codex(options); };
async function isRuntimeInstalled() { try { await defaultFactory({ env: {} }); return true; } catch { return false; } }
const BASE = [
  'You are Mouva\'s server-side design and production reasoning component.',
  'Follow the application instructions and exact output protocol below. Return only the final answer.',
  'Do not inspect files, execute commands, browse, publish, charge credits or claim external actions completed.',
  'Mouva validates your output and owns tool execution, assets, permissions, durable state and billing.',
].join('\n');
function childEnvironment(env, directory, token) {
  const result = { CODEX_HOME: path.join(directory, 'state'), TMPDIR: path.join(directory, 'tmp'),
    TMP: path.join(directory, 'tmp'), TEMP: path.join(directory, 'tmp'), MOUVA_CODEX_GATEWAY_TOKEN: token };
  for (const key of ['PATH','Path','SYSTEMROOT','SystemRoot','WINDIR','LANG','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS']) {
    if (env[key]) result[key] = env[key];
  }
  return result;
}
/** One admission pool per worker instance. Instantiate once in each service. */
function createHarness(configuration = {}) {
  const env = configuration.env || process.env;
  let slots;
  return {
    async *stream(options) {
      const controller = new AbortController(), abort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      let timer, release, root, directory, gateway;
      try {
        controller.signal.throwIfAborted();
        check(options.provider && ['gemini','anthropic'].includes(options.provider.provider), 'configuration');
        const timeout = integer(env.MOUVA_CODEX_TIMEOUT_MS, 120000, 1000, 600000);
        const maxInputBytes = integer(env.MOUVA_CODEX_MAX_INPUT_BYTES, 2 * 1024 * 1024, 1024, 8 * 1024 * 1024);
        const maxResponseBytes = integer(options.maxResponseBytes, 2 * 1024 * 1024, 1, 4 * 1024 * 1024);
        const maxOutputTokens = integer(options.maxOutputTokens, 8192, 1, 131072);
        check(typeof options.prompt === 'string' && options.prompt.length, 'input');
        const instructions = [BASE, options.system || '',
          options.jsonOnly ? 'Return valid JSON only, with no Markdown fences.' : '',
          options.schema ? 'The final JSON must satisfy this contract:\n' + JSON.stringify(options.schema) : '',
        ].filter(Boolean).join('\n\n');
        check(Buffer.byteLength(options.prompt + instructions) <= maxInputBytes, 'limit');
        slots ||= new Slots(integer(env.MOUVA_CODEX_MAX_CONCURRENT, 4, 1, 32), integer(env.MOUVA_CODEX_MAX_QUEUED, 16, 0, 256));
        timer = setTimeout(() => controller.abort(new HarnessError('timeout', 504)), timeout);
        release = await slots.acquire(controller.signal);
        controller.signal.throwIfAborted();
        root = path.resolve(env.MOUVA_CODEX_WORK_DIR?.trim() || path.join(os.tmpdir(), 'mouva-codex'));
        await mkdir(root, { recursive: true, mode: 0o700 });
        directory = await mkdtemp(path.join(root, 'run-'));
        await Promise.all(['state', 'tmp', 'workspace'].map(name => mkdir(path.join(directory, name), { mode: 0o700 })));
        const instructionsFile = path.join(directory, 'instructions.md');
        await writeFile(instructionsFile, instructions, { encoding: 'utf8', mode: 0o600 });
        gateway = await startGateway({ ...options.provider, maxInputBytes, maxResponseBytes, maxOutputTokens,
          outputSchema: options.nativeSchema === false ? undefined : options.schema,
          jsonOnly: options.jsonOnly, maxRequests: 8, allowedTools: configuration.allowedTools || [],
          fetchImpl: configuration.fetchImpl, signal: controller.signal });
        // Catalog schema is pinned to codex-sdk 0.157.1. Capabilities describe
        // this text-only worker, not the upstream model's full feature set.
        const catalogFile = path.join(directory, 'models.json');
        await writeFile(catalogFile, JSON.stringify({ models: [{
          slug: options.provider.model, display_name: options.provider.model,
          description: 'Mouva native model adapter', model_messages: { instructions_template: BASE },
          supported_reasoning_levels: [],
          shell_type: 'disabled', visibility: 'hide', supported_in_api: true, priority: 0,
          availability_nux: null, upgrade: null, support_verbosity: false, default_verbosity: null,
          apply_patch_tool_type: null, truncation_policy: { mode: 'bytes', limit: 16384 },
          experimental_supported_tools: [], input_modalities: ['text'],
          context_window: null, tool_mode: 'direct', include_apps_usage_instructions: false,
          supports_reasoning_summary_parameter: false, node_repl_disabled: true,
        }] }), { encoding: 'utf8', mode: 0o600 });
        const client = await (configuration.clientFactory || defaultFactory)({
          env: childEnvironment(env, directory, gateway.token),
          config: {
            model_instructions_file: instructionsFile, model_catalog_json: catalogFile,
            model_provider: 'mouva',
            model_providers: { mouva: { name: 'Mouva native model adapter', base_url: gateway.baseUrl,
              env_key: 'MOUVA_CODEX_GATEWAY_TOKEN', wire_api: 'responses', requires_openai_auth: false,
              request_max_retries: 0, stream_max_retries: 0, supports_websockets: false } },
            project_doc_max_bytes: 0, project_root_markers: [],
            features: { shell_tool: false, unified_exec: false },
            shell_environment_policy: { inherit: 'none' }, history: { persistence: 'none' },
          },
        });
        controller.signal.throwIfAborted();
        const thread = client.startThread({ model: options.provider.model,
          workingDirectory: path.join(directory, 'workspace'), skipGitRepoCheck: true,
          sandboxMode: 'read-only', approvalPolicy: 'never', networkAccessEnabled: false, webSearchMode: 'disabled' });
        // Keep contracts in trusted instructions and the native gateway. This
        // avoids OpenAI-specific strict-schema restrictions on optional fields.
        const { events } = await thread.runStreamed(options.prompt, { signal: controller.signal });
        let text = '', messageId, messageCompleted = false, completed = false, count = 0, meters, threadId;
        for await (const event of events) {
          controller.signal.throwIfAborted();
          check(++count <= 100000, 'limit');
          if (event.type === 'error' || event.type === 'turn.failed') throw gateway.error || new HarnessError('upstream');
          if (event.type === 'thread.started') threadId = event.thread_id;
          if (['item.started', 'item.updated', 'item.completed'].includes(event.type)) {
            const item = event.item;
            if (item.type === 'error') throw new HarnessError('upstream');
            check(!['command_execution','file_change','mcp_tool_call','web_search'].includes(item.type), 'input');
            if (item.type !== 'agent_message') continue;
            check(!completed && (!messageId || messageId === item.id) && item.text.startsWith(text), 'incomplete');
            check(Buffer.byteLength(item.text) <= maxResponseBytes, 'limit');
            messageId = item.id;
            const delta = item.text.slice(text.length); text = item.text;
            if (event.type === 'item.completed') messageCompleted = true;
            if (delta) yield { type: 'text-delta', text: delta };
          } else if (event.type === 'turn.completed') {
            check(!completed, 'incomplete'); completed = true;
            meters = { harness: 'codex', provider: options.provider.provider, model: options.provider.model,
              inputTokens: event.usage.input_tokens, cachedInputTokens: event.usage.cached_input_tokens,
              outputTokens: event.usage.output_tokens };
          }
        }
        controller.signal.throwIfAborted();
        if (gateway.error) throw gateway.error;
        check(completed && messageCompleted && text, 'incomplete');
        options.onUsage?.(meters);
        yield { type: 'done', usage: meters, threadId: threadId || thread.id, providerRequestId: gateway.providerRequestId };
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason || error;
        const safe = controller.signal.reason instanceof HarnessError ? controller.signal.reason
          : error instanceof HarnessError ? error : new HarnessError('upstream');
        yield { type: 'error', error: safe.message, code: safe.code, status: safe.status };
      } finally {
        controller.abort(); if (timer) clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        try { await gateway?.close(); }
        finally {
          try {
            if (directory && root && path.dirname(path.resolve(directory)) === root && path.basename(directory).startsWith('run-')) {
              await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
            }
          } catch { console.warn('[Mouva] Temporary model workspace cleanup deferred'); }
          finally { release?.(); }
        }
      }
    },
    async generate(options) {
      let text = '', result;
      for await (const chunk of this.stream(options)) {
        if (chunk.type === 'error') throw new HarnessError(chunk.code, chunk.status);
        if (chunk.type === 'text-delta') text += chunk.text;
        if (chunk.type === 'done') result = chunk;
      }
      check(result, 'incomplete');
      return { text, usage: result.usage, threadId: result.threadId, providerRequestId: result.providerRequestId };
    },
  };
}
module.exports = { createHarness, isRuntimeInstalled, HarnessError, startGateway };
