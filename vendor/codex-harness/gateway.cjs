'use strict';
const http = require('node:http');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { HarnessError, check, nativeInput, emitter, translateGemini, translateClaude } = require('./protocol.cjs');

function endpoint(config) {
  const url = new URL(config.baseUrl || (config.provider === 'gemini'
    ? 'https://generativelanguage.googleapis.com/v1beta'
    : 'https://api.anthropic.com'));
  check(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'configuration');
  url.pathname = url.pathname.replace(/\/$/, '') + (config.provider === 'gemini'
    ? '/models/' + encodeURIComponent(config.model) + ':streamGenerateContent'
    : (url.pathname.replace(/\/$/, '').endsWith('/v1') ? '/messages' : '/v1/messages'));
  if (config.provider === 'gemini') url.searchParams.set('alt', 'sse');
  return url.toString();
}

/** Private per-task protocol adapter; never exposed as a public model proxy. */
async function startGateway(configuration) {
  const config = { maxInputBytes: 2 * 1024 * 1024, maxResponseBytes: 2 * 1024 * 1024,
    maxOutputTokens: 8192, maxRequests: 8, allowedTools: [], ...configuration };
  check(['gemini', 'anthropic'].includes(config.provider) && typeof config.apiKey === 'string'
    && config.apiKey.trim() && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(config.model), 'configuration');
  const url = endpoint(config), token = randomBytes(32).toString('hex');
  const secret = Buffer.from('Bearer ' + token);
  const controller = new AbortController();
  const abort = () => controller.abort(config.signal?.reason);
  config.signal?.addEventListener('abort', abort, { once: true });
  if (config.signal?.aborted) abort();
  const memory = { items: new Map(), calls: new Map(), bytes: 0, maxBytes: config.maxInputBytes * 4 };
  let active = false, requests = 0, lastError, providerRequestId;
  const server = http.createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    let out, requestAbort, disconnect, admitted = false;
    const fail = error => {
      lastError = error instanceof HarnessError ? error : new HarnessError('upstream');
      if (res.destroyed) return;
      if (res.headersSent) { try { out?.fail(); res.end(); } catch { res.destroy(); } }
      else { res.writeHead(lastError.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { type: lastError.code, message: lastError.message } })); }
    };
    try {
      const supplied = Buffer.from(req.headers.authorization || '');
      if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret) || req.headers.origin) {
        res.writeHead(401); res.end(); req.resume(); return;
      }
      if (req.method !== 'POST' || req.url !== '/v1/responses') {
        res.writeHead(404); res.end(); req.resume(); return;
      }
      if (active) { res.writeHead(409); res.end(); req.resume(); return; }
      active = true; admitted = true;
      check(++requests <= config.maxRequests, 'limit');
      controller.signal.throwIfAborted();
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length; check(size <= config.maxInputBytes, 'limit'); chunks.push(chunk);
      }
      const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const { payload, names } = nativeInput(request, config, memory);
      requestAbort = new AbortController();
      const signal = AbortSignal.any([controller.signal, requestAbort.signal]);
      disconnect = () => { if (!res.writableEnded) requestAbort.abort(); };
      res.on('close', disconnect);
      const headers = config.provider === 'gemini'
        ? { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey }
        : { 'content-type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' };
      const response = await (config.fetchImpl || fetch)(url, {
        method: 'POST', headers, body: JSON.stringify(payload), signal, redirect: 'error',
      });
      if (!response.ok) { await response.body?.cancel(); throw new HarnessError('upstream', response.status === 429 ? 429 : 502); }
      providerRequestId = response.headers.get('request-id') || response.headers.get('x-request-id') || undefined;
      const streamed = request.stream !== false;
      if (streamed) res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive',
      });
      out = emitter(request, event => {
        if (streamed && !res.destroyed) {
          // Bound queued output even if the CLI stops reading.
          check(res.writableLength <= config.maxResponseBytes * 4, 'limit');
          res.write('event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n');
        }
      });
      const result = await (config.provider === 'gemini' ? translateGemini : translateClaude)(
        response, { out, names, memory, config, signal });
      if (!streamed) res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(streamed ? undefined : JSON.stringify(result));
    } catch (error) { fail(error); }
    finally {
      if (disconnect) res.off('close', disconnect);
      requestAbort?.abort();
      if (admitted) active = false;
    }
  });
  server.requestTimeout = 30_000; server.headersTimeout = 10_000;
  server.maxConnections = 4;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    controller.signal.throwIfAborted();
  } catch (error) { config.signal?.removeEventListener('abort', abort); server.close(); throw error; }
  const address = server.address();
  return {
    baseUrl: 'http://127.0.0.1:' + address.port + '/v1', token,
    get error() { return lastError; }, get providerRequestId() { return providerRequestId; },
    async close() {
      controller.abort(); config.signal?.removeEventListener('abort', abort);
      memory.items.clear(); memory.calls.clear();
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections(); await closed;
    },
  };
}
module.exports = { startGateway };
