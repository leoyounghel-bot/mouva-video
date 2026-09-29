'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, startGateway } = require('../index.cjs');

const schema = { type: 'object', properties: { ok: { type: 'boolean' }, previewRef: { type: 'string' } }, required: ['ok'], additionalProperties: false };
const model = provider => provider === 'gemini' ? 'gemini-3.7-flash' : 'claude-opus-5-5';
const providerConfig = provider => ({ provider, model: model(provider), apiKey: 'native-test-secret' });
const gemini = (parts, finishReason = 'STOP') => ({
  candidates: [{ content: { role: 'model', parts }, finishReason }],
  usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 5, cachedContentTokenCount: 3 },
});
const claude = (content, stop_reason = 'end_turn') => ({
  content, stop_reason, usage: { input_tokens: 12, cache_read_input_tokens: 3, output_tokens: 5 },
});
function events(values) {
  const bytes = Buffer.from(values.map(value => 'data: ' + JSON.stringify(value) + '\n\n').join(''));
  // Splits UTF-8 and SSE boundaries, rather than delivering one convenient chunk.
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.subarray(i, i + 7));
    controller.close();
  }}), { headers: { 'content-type': 'text/event-stream' } });
}
function claudeText(text) {
  return events([
    { type: 'message_start', message: { usage: { input_tokens: 12, cache_read_input_tokens: 3, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ]);
}
const functionTool = { type: 'function', name: 'update_plan', description: 'Update a plan',
  parameters: { type: 'object', properties: { plan: { type: 'array', items: { type: 'object',
    properties: { step: { type: 'string' }, status: { type: 'string' } }, required: ['step','status'], additionalProperties: false } } },
    required: ['plan'], additionalProperties: false } };
const planArgs = { plan: [{ step: 'Inspect the brief', status: 'completed' }] };
async function gateway(t, provider, extra) {
  const server = await startGateway({ ...providerConfig(provider), ...extra });
  t.after(() => server.close()); return server;
}
async function post(server, body, token = server.token) {
  return fetch(server.baseUrl + '/responses', { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify(body) });
}

for (const provider of ['gemini','anthropic']) {
  test(provider + ': real Codex CLI consumes native SSE and preserves schema/usage without an OpenAI key', async () => {
    let calls = 0, child;
    const harness = createHarness({
      clientFactory: async options => {
        child = options;
        const { Codex } = await import('@openai/codex-sdk');
        return new Codex(options);
      },
      fetchImpl: async (url, init) => {
        calls++;
        const body = JSON.parse(init.body);
        assert.equal(init.redirect, 'error');
        assert.ok(!url.includes('secret'));
        assert.equal(init.headers[provider === 'gemini' ? 'x-goog-api-key' : 'x-api-key'], 'native-test-secret');
        if (provider === 'gemini') {
          assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/' + model(provider) + ':streamGenerateContent?alt=sse');
          assert.deepEqual(body.generationConfig.responseJsonSchema, schema);
          assert.equal(body.generationConfig.maxOutputTokens, 512);
          assert.equal(body.tools, undefined);
          assert.ok(body.systemInstruction.parts[0].text.includes('Preserve the original design rules.'));
          return events([gemini([{ text: '{"ok":' }], ''), gemini([{ text: 'true}' }])]);
        }
        assert.equal(url, 'https://api.anthropic.com/v1/messages');
        assert.deepEqual(body.output_config.format.schema, schema);
        assert.equal(body.max_tokens, 512);
        assert.equal(body.tools, undefined);
        assert.ok(body.system.includes('Preserve the original design rules.'));
        return claudeText('{"ok":true}');
      },
    });
    const result = await harness.generate({ provider: providerConfig(provider),
      system: 'Preserve the original design rules.', prompt: 'Produce a design result.',
      schema, jsonOnly: true, maxOutputTokens: 512 });
    assert.equal(result.text, '{"ok":true}');
    assert.equal(calls, 1);
    assert.equal(result.usage.harness, 'codex');
    assert.equal(result.usage.provider, provider);
    assert.equal(result.usage.inputTokens, 15);
    assert.equal(result.usage.cachedInputTokens, 3);
    assert.equal(result.usage.outputTokens, 5);
    assert.ok(result.threadId);
    assert.equal(child.apiKey, undefined);
    assert.equal(child.env.OPENAI_API_KEY, undefined);
    assert.equal(child.env.GEMINI_API_KEY, undefined);
    assert.equal(child.env.ANTHROPIC_API_KEY, undefined);
    assert.ok(child.env.MOUVA_CODEX_GATEWAY_TOKEN);
  });

  test(provider + ': tool result restores the original native signatures and IDs', async t => {
    let calls = 0;
    const server = await gateway(t, provider, { allowedTools: ['update_plan'], fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body); calls++;
      if (calls === 1) return Response.json(provider === 'gemini'
        ? gemini([{ text: 'private reasoning', thought: true },
          { functionCall: { name: 'update_plan', id: 'native-tool-1', args: planArgs }, thoughtSignature: 'gemini-signed-state' }])
        : claude([{ type: 'thinking', thinking: 'private reasoning', signature: 'claude-signed-state' },
          { type: 'tool_use', id: 'native-tool-1', name: 'update_plan', input: planArgs }], 'tool_use'));
      if (provider === 'gemini') {
        const assistant = body.contents.find(m => m.role === 'model');
        assert.equal(assistant.parts[1].thoughtSignature, 'gemini-signed-state');
        assert.equal(assistant.parts[1].functionCall.id, 'native-tool-1');
        assert.deepEqual(body.contents.at(-1).parts[0].functionResponse,
          { name: 'update_plan', id: 'native-tool-1', response: { ok: true } });
      } else {
        const assistant = body.messages.find(m => m.role === 'assistant');
        assert.equal(assistant.content[0].signature, 'claude-signed-state');
        assert.equal(assistant.content[1].id, 'native-tool-1');
        assert.deepEqual(body.messages.at(-1).content[0],
          { type: 'tool_result', tool_use_id: 'native-tool-1', content: '{"ok":true}' });
      }
      return Response.json(provider === 'gemini' ? gemini([{ text: 'Complete' }]) : claude([{ type: 'text', text: 'Complete' }]));
    }});
    const question = { role: 'user', content: 'Make a plan.' };
    const initial = { model: model(provider), input: [question], tools: [functionTool], stream: false };
    const first = await (await post(server, initial)).json();
    assert.equal(first.output.length, 1);
    assert.equal(first.output[0].type, 'function_call');
    assert.ok(!JSON.stringify(first).includes('private reasoning'));
    const second = await (await post(server, { ...initial, input: [question, ...first.output,
      { type: 'function_call_output', call_id: first.output[0].call_id, output: '{"ok":true}' }] })).json();
    assert.equal(second.status, 'completed');
    assert.equal(second.output[0].content[0].text, 'Complete');
    assert.equal(calls, 2);
  });

  test(provider + ': real Codex executes an allowed read-only host tool and continues through the native provider', async () => {
    let calls = 0;
    const harness = createHarness({
      allowedTools: ['get_goal', 'functions.get_goal'],
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body); calls++;
        if (calls === 1) {
          const tool = provider === 'gemini' ? body.tools?.[0]?.functionDeclarations?.[0] : body.tools?.[0];
          assert.ok(tool, 'Codex must advertise its host-owned read-only tool');
          return Response.json(provider === 'gemini'
            ? gemini([{ functionCall: { name: tool.name, id: 'native-plan', args: {} }, thoughtSignature: 'original-signature' }])
            : claude([{ type: 'tool_use', id: 'native-plan', name: tool.name, input: {} }], 'tool_use'));
        }
        assert.equal(calls, 2);
        const messages = provider === 'gemini' ? body.contents : body.messages;
        assert.ok(messages.some(m => (m.parts || m.content).some(p => p.functionResponse || p.type === 'tool_result')), 'The real tool result must reach the native model');
        if (provider === 'gemini') assert.ok(JSON.stringify(messages).includes('original-signature'));
        return Response.json(provider === 'gemini' ? gemini([{ text: 'Planned' }]) : claude([{ type: 'text', text: 'Planned' }]));
      },
    });
    assert.equal((await harness.generate({ provider: providerConfig(provider), prompt: 'Plan the task.' })).text, 'Planned');
    assert.equal(calls, 2);
  });
}

test('per-task token, model binding and tool allowlist prevent cross-task access', async t => {
  let calls = 0;
  const first = await gateway(t, 'gemini', { fetchImpl: async (_url, init) => {
    calls++; assert.equal(JSON.parse(init.body).tools, undefined);
    return Response.json(gemini([{ text: 'ok' }]));
  }});
  const second = await gateway(t, 'gemini', { fetchImpl: async () => { throw Error('wrong task'); } });
  const body = { model: model('gemini'), input: 'test', stream: false, tools: [functionTool] };
  assert.equal((await post(first, body, second.token)).status, 401);
  assert.equal((await post(first, { ...body, model: 'gpt-unknown' })).status, 400);
  assert.equal(calls, 0);
  assert.equal((await post(first, body)).status, 200);
  assert.equal(calls, 1);
  assert.notEqual(first.baseUrl, second.baseUrl);
});

test('truncation, malformed SSE, unsafe model tools and provider errors fail without raw provider data', async t => {
  const cases = [
    () => Response.json(gemini([{ text: 'partial' }], 'MAX_TOKENS')),
    () => Response.json(gemini([{ functionCall: { name: 'exec_command', args: { command: 'unsafe' } } }])),
    () => new Response('data: {"candidates":[]}', { headers: { 'content-type': 'text/event-stream' } }),
    () => new Response('private prompt native-test-secret', { status: 429 }),
  ];
  for (const makeResponse of cases) {
    const server = await gateway(t, 'gemini', { fetchImpl: async () => makeResponse() });
    const response = await post(server, { model: model('gemini'), input: 'test', stream: false });
    assert.ok(response.status >= 400);
    const text = await response.text();
    assert.ok(!text.includes('native-test-secret') && !text.includes('private prompt'));
  }
});

test('gateway cancellation aborts the actual native fetch and has a bounded request count', async t => {
  const cancel = new AbortController();
  let started, observed;
  const ready = new Promise(resolve => { started = resolve; });
  const server = await gateway(t, 'gemini', { signal: cancel.signal, fetchImpl: async (_url, init) => {
    observed = init.signal; started();
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  }});
  const pending = post(server, { model: model('gemini'), input: 'test', stream: false });
  await ready; cancel.abort(); await pending;
  assert.equal(observed.aborted, true);
  const limited = await gateway(t, 'gemini', { maxRequests: 1, fetchImpl: async () => Response.json(gemini([{ text: 'ok' }])) });
  assert.equal((await post(limited, { model: model('gemini'), input: 'test', stream: false })).status, 200);
  assert.ok((await post(limited, { model: model('gemini'), input: 'test', stream: false })).status >= 400);
});
