'use strict';
// Canonical source: mouva/playground/server/vendor/codex-harness.
// Vendored unchanged into Mouva Studio so each deployment is self-contained.
const { createHash, randomUUID } = require('node:crypto');
const id = prefix => prefix + '_' + randomUUID().replaceAll('-', '');
class HarnessError extends Error {
  constructor(code, status = 502) {
    const messages = {
      configuration: 'Model provider configuration is incomplete or invalid',
      input: 'The request uses an unsupported or invalid model protocol',
      upstream: 'The model provider could not complete this task',
      incomplete: 'The model provider returned an incomplete result',
      limit: 'The model task exceeded its allowed size or request limit',
      busy: 'The model worker is busy; retry this task later',
      timeout: 'The model task exceeded its execution deadline',
    };
    super(messages[code] || messages.upstream);
    this.name = 'HarnessError'; this.code = code; this.status = status;
  }
}
const check = (ok, code = 'input') => { if (!ok) throw new HarnessError(code, code === 'input' ? 400 : 502); };
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const textContent = v => typeof v === 'string' ? v : JSON.stringify(v);

function contentParts(content, provider) {
  if (typeof content === 'string') return [{ text: content }];
  check(Array.isArray(content));
  return content.map(part => {
    if (['input_text', 'output_text', 'text'].includes(part.type)) {
      check(typeof part.text === 'string'); return { text: part.text };
    }
    if (part.type === 'input_image') {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(part.image_url || '');
      check(match);
      return provider === 'gemini'
        ? { inlineData: { mimeType: match[1], data: match[2] } }
        : { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
    }
    throw new HarnessError('input', 400);
  });
}

function toolDefinitions(tools = [], allowed = []) {
  check(Array.isArray(tools));
  const definitions = [], names = new Map();
  const walk = (entries, prefix = '') => {
    for (const tool of entries) {
      if (tool.type === 'namespace') {
        check(typeof tool.name === 'string' && Array.isArray(tool.tools));
        walk(tool.tools, prefix + tool.name + '.'); continue;
      }
      if (tool.type !== 'function') continue;
      const name = prefix + tool.name;
      // Only explicitly enabled host tools reach the model. Browser input cannot
      // enable shell, filesystem, network, publishing or payment capabilities.
      if (!allowed.includes(name)) continue;
      check(typeof tool.name === 'string' && object(tool.parameters));
      const alias = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(name)
        ? name : 'mouva_' + createHash('sha256').update(name).digest('hex').slice(0,24);
      check(!names.has(alias));
      names.set(alias, name);
      definitions.push({ name: alias, description: tool.description || '', schema: tool.parameters });
    }
  };
  walk(tools);
  return { definitions, names };
}

function nativeInput(request, config, memory) {
  check(object(request) && request.model === config.model);
  check(!request.previous_response_id && !request.conversation && !request.background);
  check(request.stream === true || request.stream === false || request.stream === undefined);
  const input = typeof request.input === 'string'
    ? [{ role: 'user', content: request.input }] : request.input;
  check(Array.isArray(input) && input.length > 0);
  const messages = [], systems = [];
  if (request.instructions) { check(typeof request.instructions === 'string'); systems.push(request.instructions); }
  const inserted = new Set();
  const append = (role, parts) => {
    if (!parts.length) return;
    const last = messages.at(-1);
    if (last?.role === role) last.parts.push(...parts);
    else messages.push({ role, parts });
  };
  for (const item of input) {
    const cached = memory.items.get(item.call_id || item.id);
    if (cached && (item.type === 'function_call' || item.role === 'assistant')) {
      if (!inserted.has(cached)) { append('assistant', structuredClone(cached)); inserted.add(cached); }
      continue;
    }
    if (!item.type || item.type === 'message') {
      check(['system', 'developer', 'user', 'assistant'].includes(item.role));
      const parts = contentParts(item.content, config.provider);
      if (item.role === 'system' || item.role === 'developer') {
        check(parts.every(p => typeof p.text === 'string')); systems.push(parts.map(p => p.text).join('\n'));
      } else append(item.role, parts);
    } else if (item.type === 'function_call') {
      // A resumed transcript without this task's native signature cache is not
      // silently replayed: let the application's durable workflow reconcile it.
      throw new HarnessError('input', 400);
    } else if (item.type === 'function_call_output') {
      const call = memory.calls.get(item.call_id);
      check(call);
      const value = textContent(item.output);
      let parsed; try { parsed = JSON.parse(value); } catch { parsed = { result: value }; }
      append('user', [config.provider === 'gemini'
        ? { functionResponse: { name: call.name, ...(call.nativeId ? { id: call.nativeId } : {}),
            response: object(parsed) ? parsed : { result: parsed } } }
        : { type: 'tool_result', tool_use_id: call.nativeId, content: value }]);
    } else if (item.type !== 'reasoning') {
      throw new HarnessError('input', 400);
    }
  }
  check(messages.length > 0);
  const { definitions, names } = toolDefinitions(request.tools, config.allowedTools);
  const format = request.text?.format || (config.jsonOnly ? { type: 'json_object' } : undefined);
  check(!format || ['text', 'json_object', 'json_schema'].includes(format.type));
  const schema = format?.type === 'json_schema' ? format.schema : config.outputSchema;
  if (schema) {
    check(object(schema));
    systems.push('Final output must be JSON satisfying this exact contract:\n' + JSON.stringify(schema));
  }
  if (request.tool_choice && !['auto', 'none'].includes(request.tool_choice)) throw new HarnessError('input', 400);
  const enabled = request.tool_choice === 'none' ? [] : definitions;
  const outputLimit = Math.min(config.maxOutputTokens, request.max_output_tokens || config.maxOutputTokens);
  check(Number.isSafeInteger(outputLimit) && outputLimit > 0);
  if (config.provider === 'gemini') {
    const payload = {
      systemInstruction: { parts: [{ text: systems.join('\n\n') }] },
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: m.parts })),
      generationConfig: { maxOutputTokens: outputLimit,
        ...(schema && !enabled.length ? { responseMimeType: 'application/json', responseJsonSchema: schema } : {}),
        ...(!schema && format?.type === 'json_object' ? { responseMimeType: 'application/json' } : {}),
      },
      ...(enabled.length ? { tools: [{ functionDeclarations: enabled.map(t => ({
        name: t.name, description: t.description, parametersJsonSchema: t.schema,
      })) }] } : {}),
    };
    return { payload, names };
  }
  const payload = {
    model: config.model, max_tokens: outputLimit, stream: true,
    system: systems.join('\n\n'),
    messages: messages.map(m => ({ role: m.role, content: m.parts.map(p => p.type ? p : { type: 'text', text: p.text }) })),
    ...(schema ? { output_config: { format: { type: 'json_schema', schema } } } : {}),
    ...(enabled.length ? { tools: enabled.map(t => ({ name: t.name, description: t.description, input_schema: t.schema })) } : {}),
  };
  return { payload, names };
}

async function* sse(response, maxBytes, signal) {
  check(response.body, 'upstream');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', bytes = 0, event = '', lines = [];
  const parse = () => {
    const data = lines.join('\n'); lines = []; const name = event; event = '';
    if (!data) return null;
    check(data !== '[DONE]', 'incomplete');
    try { return { event: name, value: JSON.parse(data) }; } catch { throw new HarnessError('upstream'); }
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      check(bytes <= maxBytes, 'limit');
      buffer += decoder.decode(chunk.value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
        if (!line) { const value = parse(); if (value) yield value; }
        else if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''));
        else if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (!line.startsWith(':') && !line.startsWith('id:') && !line.startsWith('retry:')) throw new HarnessError('upstream');
      }
    }
    buffer += decoder.decode();
    check(!buffer.trim() && !lines.length, 'incomplete');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function boundedJson(response, maximum) {
  check(response.body, 'upstream');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; check(size <= maximum, 'limit'); chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function emitter(request, send) {
  const responseId = id('resp'), output = [];
  let sequence = 0;
  const response = (status, usage) => ({ id: responseId, object: 'response', created_at: Math.floor(Date.now()/1000),
    model: request.model, status, output, usage, error: null, incomplete_details: null });
  const emit = (type, rest = {}) => send({ type, sequence_number: sequence++, ...rest });
  emit('response.created', { response: response('in_progress', null) });
  const messages = new Map();
  return {
    output, responseId,
    text(key, delta) {
      if (!delta) return;
      let entry = messages.get(key);
      if (!entry) {
        const item = { id: id('msg'), type: 'message', role: 'assistant', status: 'in_progress', content: [] };
        entry = { item, index: output.length }; messages.set(key, entry); output.push(item);
        emit('response.output_item.added', { output_index: entry.index, item: structuredClone(item) });
        const part = { type: 'output_text', text: '', annotations: [] }; item.content.push(part);
        emit('response.content_part.added', { item_id: item.id, output_index: entry.index, content_index: 0, part: structuredClone(part) });
      }
      entry.item.content[0].text += delta;
      emit('response.output_text.delta', { item_id: entry.item.id, output_index: entry.index, content_index: 0, delta });
    },
    tool(name, callId, args) {
      const item = { type: 'function_call', id: id('fc'), call_id: callId, name, arguments: '', status: 'in_progress' };
      const index = output.length; output.push(item);
      emit('response.output_item.added', { output_index: index, item: structuredClone(item) });
      item.arguments = JSON.stringify(args);
      emit('response.function_call_arguments.delta', { output_index: index, item_id: item.id, delta: item.arguments });
      emit('response.function_call_arguments.done', { output_index: index, item_id: item.id, arguments: item.arguments });
      item.status = 'completed';
      emit('response.output_item.done', { output_index: index, item: structuredClone(item) });
      return item;
    },
    complete(usage) {
      check(output.length, 'incomplete');
      for (const { item, index } of messages.values()) {
        emit('response.output_text.done', { item_id: item.id, output_index: index, content_index: 0, text: item.content[0].text });
        emit('response.content_part.done', { item_id: item.id, output_index: index, content_index: 0, part: structuredClone(item.content[0]) });
        item.status = 'completed';
        emit('response.output_item.done', { output_index: index, item: structuredClone(item) });
      }
      const result = response('completed', usage);
      emit('response.completed', { response: result });
      return result;
    },
    fail() { emit('response.failed', { response: { ...response('failed', null), error: { code: 'model_error', message: 'Model task failed' } } }); },
  };
}

const usage = (input = 0, output = 0, cached = 0, reasoning = 0, cacheWrite = 0) => {
  check([input, output, cached, reasoning, cacheWrite].every(n => Number.isSafeInteger(n) && n >= 0), 'upstream');
  return ({
  input_tokens: input, output_tokens: output, total_tokens: input + output,
  input_tokens_details: { cached_tokens: cached, cache_write_tokens: cacheWrite },
  output_tokens_details: { reasoning_tokens: reasoning },
}); };

function remember(memory, output, nativeParts, calls) {
  const size = Buffer.byteLength(JSON.stringify(nativeParts));
  check(memory.bytes + size <= memory.maxBytes, 'limit'); memory.bytes += size;
  for (const item of output) {
    memory.items.set(item.call_id || item.id, nativeParts);
    if (item.call_id) memory.items.set(item.id, nativeParts);
  }
  for (const [key, value] of calls) memory.calls.set(key, value);
}

async function translateGemini(response, context) {
  const { out, names, memory, config, signal } = context;
  const nativeParts = [], calls = []; let finish, meters, textCount = 0;
  const chunks = /text\/event-stream/i.test(response.headers.get('content-type') || '')
    ? sse(response, config.maxResponseBytes * 4, signal)
    : (async function* () { yield { value: await boundedJson(response, config.maxResponseBytes * 4) }; })();
  for await (const { value } of chunks) {
    check(!value.error && !value.promptFeedback?.blockReason, 'upstream');
    const candidate = value.candidates?.[0];
    if (candidate?.finishReason) finish = candidate.finishReason;
    if (value.usageMetadata) meters = value.usageMetadata;
    check(!value.candidates || value.candidates.length <= 1, 'upstream');
    for (const part of candidate?.content?.parts || []) {
      nativeParts.push(structuredClone(part));
      if (part.functionCall) {
        const call = part.functionCall, name = names.get(call.name); check(name && object(call.args), 'upstream');
        const callId = id('call');
        calls.push([callId, { name: call.name, nativeId: call.id }]);
        out.tool(name, callId, call.args);
      } else if (typeof part.text === 'string' && !part.thought) {
        textCount += Buffer.byteLength(part.text); check(textCount <= config.maxResponseBytes, 'limit');
        out.text('answer', part.text);
      } else check(part.thought || part.thoughtSignature, 'upstream');
    }
  }
  check(finish === 'STOP', 'incomplete');
  const finalUsage = usage(meters?.promptTokenCount || 0,
    (meters?.candidatesTokenCount || 0) + (meters?.thoughtsTokenCount || 0),
    meters?.cachedContentTokenCount || 0, meters?.thoughtsTokenCount || 0);
  remember(memory, out.output, nativeParts, calls);
  return out.complete(finalUsage);
}

async function translateClaude(response, context) {
  const { out, names, memory, config, signal } = context;
  const blocks = [], calls = []; let stop, stopped = false, meters = {}, size = 0;
  const add = (index, block) => {
    check(Number.isSafeInteger(index) && index === blocks.length && index < 256, 'upstream');
    blocks[index] = { ...structuredClone(block), _json: '' };
    if (block.type === 'text') {
      check(typeof block.text === 'string', 'upstream');
      size += Buffer.byteLength(block.text); check(size <= config.maxResponseBytes, 'limit');
      out.text(index, block.text);
    }
    else check(['thinking', 'redacted_thinking', 'tool_use'].includes(block.type), 'upstream');
  };
  const close = index => {
    const block = blocks[index]; check(block && !block._closed, 'upstream'); block._closed = true;
    if (block.type === 'tool_use') {
      const name = names.get(block.name); check(name, 'upstream');
      if (block._json) block.input = JSON.parse(block._json);
      check(object(block.input), 'upstream');
      const callId = id('call'); calls.push([callId, { name: block.name, nativeId: block.id }]);
      out.tool(name, callId, block.input);
    }
  };
  if (/text\/event-stream/i.test(response.headers.get('content-type') || '')) {
    for await (const { value } of sse(response, config.maxResponseBytes * 4, signal)) {
      check(!stopped || value.type === 'ping', 'incomplete');
      if (value.type === 'message_start') meters = { ...value.message.usage };
      else if (value.type === 'content_block_start') add(value.index, value.content_block);
      else if (value.type === 'content_block_delta') {
        const block = blocks[value.index]; check(block && !block._closed, 'upstream');
        const delta = value.delta;
        if (delta.type === 'text_delta' && block.type === 'text') {
          check(typeof delta.text === 'string', 'upstream');
          size += Buffer.byteLength(delta.text); check(size <= config.maxResponseBytes, 'limit');
          block.text += delta.text; out.text(value.index, delta.text);
        } else if (delta.type === 'input_json_delta' && block.type === 'tool_use') block._json += delta.partial_json;
        else if (delta.type === 'thinking_delta' && block.type === 'thinking') block.thinking += delta.thinking;
        else if (delta.type === 'signature_delta' && block.type === 'thinking') block.signature = (block.signature || '') + delta.signature;
        else throw new HarnessError('upstream');
      } else if (value.type === 'content_block_stop') close(value.index);
      else if (value.type === 'message_delta') { stop = value.delta?.stop_reason; meters = { ...meters, ...value.usage }; }
      else if (value.type === 'message_stop') stopped = true;
      else if (value.type !== 'ping') throw new HarnessError('upstream');
    }
  } else {
    const value = await boundedJson(response, config.maxResponseBytes * 4);
    check(Array.isArray(value.content), 'upstream');
    value.content.forEach((block, index) => { add(index, block); close(index); });
    stop = value.stop_reason; meters = value.usage || {}; stopped = true;
  }
  check(stopped && ['end_turn', 'tool_use'].includes(stop) && blocks.every(b => b._closed), 'incomplete');
  check(stop !== 'tool_use' || calls.length > 0, 'incomplete');
  const nativeParts = blocks.map(({ _json, _closed, ...block }) => block);
  const input = (meters.input_tokens || 0) + (meters.cache_read_input_tokens || 0) + (meters.cache_creation_input_tokens || 0);
  remember(memory, out.output, nativeParts, calls);
  return out.complete(usage(input, meters.output_tokens || 0, meters.cache_read_input_tokens || 0, 0, meters.cache_creation_input_tokens || 0));
}
module.exports = { HarnessError, check, nativeInput, emitter, translateGemini, translateClaude };
