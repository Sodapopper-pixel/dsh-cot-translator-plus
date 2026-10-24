import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { DEFAULT_SYSTEM_PROMPT } from '../src/config.js'
import { listCustomModels, systemPromptFor, translateWithCustomLlm, translateWithLlm } from '../src/llm.js'

const limits = { timeoutMs: 2000, maxResponseBytes: 64 * 1024 }
const llmConfig = {
  provider: 'myapi', model: 'fast', reasoningEffort: '', maxTokens: 0, temperature: null, systemPrompt: DEFAULT_SYSTEM_PROMPT,
}

function chunkStream(chunks) {
  return async function* stream() {
    for (const chunk of chunks) yield chunk
  }
}

function ctxWith(prepareCall) {
  return { get: name => name === 'llm' ? { prepareCall } : undefined }
}

test('systemPromptFor substitutes both languages and drops a known-source clause for auto', () => {
  assert.match(systemPromptFor(DEFAULT_SYSTEM_PROMPT, { sourceLanguage: 'en', targetLanguage: 'zh' }), /from en to zh/)
  const auto = systemPromptFor(DEFAULT_SYSTEM_PROMPT, { sourceLanguage: 'auto', targetLanguage: 'zh' })
  assert.match(auto, /Translate the following text to zh\./)
  assert.doesNotMatch(auto, /from/)
  assert.equal(systemPromptFor('{{source}} => {{target}}', { sourceLanguage: 'auto', targetLanguage: 'ja' }), 'the source language => ja')
  assert.equal(systemPromptFor('译成{{target}}', { sourceLanguage: 'auto', targetLanguage: 'zh' }), '译成zh')
})

test('an empty or null system prompt composes no system message', () => {
  assert.equal(systemPromptFor('', { sourceLanguage: 'auto', targetLanguage: 'zh' }), '')
  assert.equal(systemPromptFor(null, { sourceLanguage: 'auto', targetLanguage: 'zh' }), '')
  assert.equal(systemPromptFor(undefined, { sourceLanguage: 'auto', targetLanguage: 'zh' }), '')
})

test('translateWithLlm assembles text deltas from one prepared call', async () => {
  let preparedConfig
  let dispatched
  const ctx = ctxWith(async (config) => {
    preparedConfig = config
    return {
      config: { ...config },
      stream: options => {
        dispatched = options
        return chunkStream([
          { type: 'block-start', index: 0, blockType: 'text' },
          { type: 'text-delta', index: 0, text: '译' },
          { type: 'text-delta', index: 0, text: '文' },
          { type: 'block-end', index: 0, block: { type: 'text', text: '译文' } },
          { type: 'finish', reason: { kind: 'stop' } },
        ])()
      },
    }
  })
  const text = await translateWithLlm(ctx, { ...llmConfig, maxTokens: 256, reasoningEffort: 'off', temperature: 0.2 },
    { text: 'hello', sourceLanguage: 'auto', targetLanguage: 'zh' }, limits)
  assert.equal(text, '译文')
  assert.equal(preparedConfig.provider, 'myapi')
  assert.equal(preparedConfig.model, 'fast')
  assert.equal(preparedConfig.maxTokens, 256)
  assert.equal(preparedConfig.reasoningEffort, 'off')
  assert.equal(preparedConfig.temperature, 0.2)
  assert.equal(dispatched.provider, 'myapi')
  assert.equal(dispatched.messages[0].content[0].text, 'hello')
  assert.match(dispatched.system, /Translate the following text to zh/)
})

test('translateWithLlm omits controls that were left at their defaults', async () => {
  let preparedConfig
  const ctx = ctxWith(async (config) => {
    preparedConfig = config
    return {
      config: { ...config, maxTokens: 100 },
      stream: () => chunkStream([{ type: 'text-delta', index: 0, text: 'x' }, { type: 'finish', reason: { kind: 'stop' } }])(),
    }
  })
  assert.equal(await translateWithLlm(ctx, llmConfig, { text: 'a', sourceLanguage: 'auto', targetLanguage: 'en' }, limits), 'x')
  assert.equal('reasoningEffort' in preparedConfig, false)
  assert.equal('maxTokens' in preparedConfig, false)
  assert.equal('temperature' in preparedConfig, false)
})

test('translateWithLlm rejects non-text output, failed finishes, and empty output', async () => {
  const reasoning = ctxWith(async (config) => ({
    config: { ...config },
    stream: () => chunkStream([{ type: 'reasoning-delta', index: 0, text: 'hmm' }, { type: 'finish', reason: { kind: 'stop' } }])(),
  }))
  await assert.rejects(translateWithLlm(reasoning, llmConfig, { text: 'a', sourceLanguage: 'auto', targetLanguage: 'en' }, limits),
    error => error.code === 'TRANSLATION_INVALID_RESPONSE')

  const errored = ctxWith(async (config) => ({
    config: { ...config },
    stream: () => chunkStream([{ type: 'text-delta', index: 0, text: 'x' }, { type: 'finish', reason: { kind: 'error' } }])(),
  }))
  await assert.rejects(translateWithLlm(errored, llmConfig, { text: 'a', sourceLanguage: 'auto', targetLanguage: 'en' }, limits),
    error => error.code === 'TRANSLATION_REQUEST_FAILED')

  const empty = ctxWith(async (config) => ({
    config: { ...config },
    stream: () => chunkStream([{ type: 'text-delta', index: 0, text: '   ' }, { type: 'finish', reason: { kind: 'stop' } }])(),
  }))
  await assert.rejects(translateWithLlm(empty, llmConfig, { text: 'a', sourceLanguage: 'auto', targetLanguage: 'en' }, limits),
    error => error.code === 'TRANSLATION_INVALID_RESPONSE')
})

test('translateWithLlm reports missing runtimes and rejected preparation', async () => {
  await assert.rejects(translateWithLlm({ get: () => undefined }, llmConfig, { text: 'a', sourceLanguage: 'auto', targetLanguage: 'en' }, limits),
    error => error.code === 'TRANSLATION_UNAVAILABLE')

  const rejected = ctxWith(async () => { throw new Error('model "fast" does not support reasoning effort "off"') })
  await assert.rejects(translateWithLlm(rejected, llmConfig, { text: 'a', sourceLanguage: 'auto', targetLanguage: 'en' }, limits),
    error => error.code === 'TRANSLATION_UNAVAILABLE' && /reasoning effort/.test(error.message))

  assert.equal(await translateWithLlm(ctxWith(async () => { throw new Error('never') }), llmConfig,
    { text: '', sourceLanguage: 'auto', targetLanguage: 'en' }, limits), '')
})

test('translateWithLlm enforces its deadline and response ceiling', async () => {
  const slow = ctxWith(async (config) => ({
    config: { ...config },
    stream: () => (async function* () {
      await new Promise(resolve => { setTimeout(resolve, 200) })
      yield { type: 'finish', reason: { kind: 'stop' } }
    })(),
  }))
  await assert.rejects(translateWithLlm(slow, llmConfig, { text: 'a', sourceLanguage: 'auto', targetLanguage: 'en' }, { ...limits, timeoutMs: 30 }),
    error => error.code === 'TRANSLATION_TIMEOUT')

  const large = ctxWith(async (config) => ({
    config: { ...config },
    stream: () => chunkStream([{ type: 'text-delta', index: 0, text: 'y'.repeat(200) }, { type: 'finish', reason: { kind: 'stop' } }])(),
  }))
  await assert.rejects(translateWithLlm(large, llmConfig, { text: 'a', sourceLanguage: 'auto', targetLanguage: 'en' }, { ...limits, maxResponseBytes: 32 }),
    error => error.code === 'TRANSLATION_RESPONSE_LIMIT')
})

/** Start an HTTP endpoint that answers one request per connection and records it. */
async function endpoint(handler) {
  const calls = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, headers: req.headers, body })
      handler(req, res, body)
    })
  })
  await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve) })
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    calls,
    close: () => new Promise(resolve => { server.close(resolve) }),
  }
}

function customProvider(origin, extra = {}) {
  return { id: 'acme', label: 'Acme', baseUrl: `${origin}/v1`, apiKey: 'k-1', models: [], ...extra }
}

const customConfig = { model: 'fast', maxTokens: 0, temperature: null, systemPrompt: DEFAULT_SYSTEM_PROMPT }
const customRequest = { text: 'hello', sourceLanguage: 'auto', targetLanguage: 'zh' }

test('translateWithCustomLlm sends an OpenAI-compatible chat completion and trims text', async () => {
  const server = await endpoint((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '  你好  ' } }] }))
  })
  try {
    const text = await translateWithCustomLlm(customProvider(server.origin), customConfig, customRequest, limits)
    assert.equal(text, '你好')
    const call = server.calls[0]
    assert.equal(call.method, 'POST')
    assert.equal(call.url, '/v1/chat/completions')
    assert.equal(call.headers.authorization, 'Bearer k-1')
    const payload = JSON.parse(call.body)
    assert.equal(payload.model, 'fast')
    assert.equal(payload.stream, false)
    assert.equal(payload.messages[0].role, 'system')
    assert.match(payload.messages[0].content, /Translate the following text to zh/)
    assert.equal(payload.messages[1].content, 'hello')
    assert.equal('max_tokens' in payload, false)
    assert.equal('temperature' in payload, false)
    assert.equal(call.body.includes('"tools"'), false, 'the request carries no tool declarations')
  } finally {
    await server.close()
  }
})

test('translateWithCustomLlm honors configured controls, custom headers and array content', async () => {
  const server = await endpoint((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: [{ type: 'text', text: '译' }, { type: 'text', text: '文' }] } }] }))
  })
  try {
    const provider = customProvider(server.origin, { headers: { 'x-tenant': 'acme', authorization: 'Token t' } })
    const text = await translateWithCustomLlm(provider, { ...customConfig, maxTokens: 128, temperature: 0.3 }, customRequest, limits)
    assert.equal(text, '译文')
    const call = server.calls[0]
    assert.equal(call.headers['x-tenant'], 'acme')
    assert.equal(call.headers.authorization, 'Token t', 'a declared header wins over the api key')
    const payload = JSON.parse(call.body)
    assert.equal(payload.max_tokens, 128)
    assert.equal(payload.temperature, 0.3)
  } finally {
    await server.close()
  }
})

test('translateWithLlm omits the system message when the prompt is null', async () => {
  let dispatched
  const ctx = ctxWith(async (config) => ({
    config: { ...config },
    stream: options => {
      dispatched = options
      return chunkStream([{ type: 'text-delta', index: 0, text: 'x' }, { type: 'finish', reason: { kind: 'stop' } }])()
    },
  }))
  assert.equal(await translateWithLlm(ctx, { ...llmConfig, systemPrompt: null },
    { text: 'a', sourceLanguage: 'auto', targetLanguage: 'en' }, limits), 'x')
  assert.equal('system' in dispatched, false, 'a cleared prompt sends no system message')
  assert.equal(dispatched.messages.length, 1)
})

test('translateWithCustomLlm sends no system message when the prompt is null', async () => {
  const server = await endpoint((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
  })
  try {
    await translateWithCustomLlm(customProvider(server.origin), { ...customConfig, systemPrompt: null }, customRequest, limits)
    const payload = JSON.parse(server.calls[0].body)
    assert.deepEqual(payload.messages.map(message => message.role), ['user'], 'a cleared prompt sends the fragment alone')
    assert.equal(payload.messages[0].content, 'hello')
  } finally {
    await server.close()
  }
})

test('translateWithCustomLlm reports HTTP, parsing, empty and oversized responses', async () => {
  const failing = await endpoint((req, res) => { res.statusCode = 401; res.end('{"error":"nope"}') })
  try {
    await assert.rejects(
      translateWithCustomLlm(customProvider(failing.origin), customConfig, customRequest, limits),
      error => error.code === 'TRANSLATION_HTTP_ERROR' && !error.message.includes('hello'))
  } finally {
    await failing.close()
  }

  const malformed = await endpoint((req, res) => { res.end('not json') })
  try {
    await assert.rejects(translateWithCustomLlm(customProvider(malformed.origin), customConfig, customRequest, limits),
      error => error.code === 'TRANSLATION_INVALID_RESPONSE')
  } finally {
    await malformed.close()
  }

  const empty = await endpoint((req, res) => { res.end(JSON.stringify({ choices: [{ message: { content: '   ' } }] })) })
  try {
    await assert.rejects(translateWithCustomLlm(customProvider(empty.origin), customConfig, customRequest, limits),
      error => error.code === 'TRANSLATION_INVALID_RESPONSE')
  } finally {
    await empty.close()
  }

  const large = await endpoint((req, res) => { res.end(JSON.stringify({ choices: [{ message: { content: 'y'.repeat(400) } }] })) })
  try {
    await assert.rejects(translateWithCustomLlm(customProvider(large.origin), customConfig, customRequest, { ...limits, maxResponseBytes: 64 }),
      error => error.code === 'TRANSLATION_RESPONSE_LIMIT')
  } finally {
    await large.close()
  }
})

test('translateWithCustomLlm enforces its deadline and omits an empty credential', async () => {
  const slow = await endpoint((req, res) => {
    setTimeout(() => { res.end(JSON.stringify({ choices: [{ message: { content: 'late' } }] })) }, 200)
  })
  try {
    await assert.rejects(
      translateWithCustomLlm(customProvider(slow.origin, { apiKey: '' }), customConfig, customRequest, { ...limits, timeoutMs: 30 }),
      error => error.code === 'TRANSLATION_TIMEOUT')
    assert.equal('authorization' in slow.calls[0].headers, false)
  } finally {
    await slow.close()
  }
})

test('listCustomModels returns sorted unique ids and reports failures', async () => {
  const server = await endpoint((req, res) => {
    assert.equal(req.url, '/v1/models')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }, { id: 1 }] }))
  })
  try {
    assert.deepEqual(await listCustomModels(customProvider(server.origin), limits), ['a', 'b'])
    assert.equal(server.calls[0].headers.authorization, 'Bearer k-1')
  } finally {
    await server.close()
  }

  const denied = await endpoint((req, res) => { res.statusCode = 403; res.end() })
  try {
    await assert.rejects(listCustomModels(customProvider(denied.origin), limits), error => error.code === 'TRANSLATION_HTTP_ERROR')
  } finally {
    await denied.close()
  }

  const invalid = await endpoint((req, res) => { res.end(JSON.stringify({ models: [] })) })
  try {
    await assert.rejects(listCustomModels(customProvider(invalid.origin), limits), error => error.code === 'TRANSLATION_INVALID_RESPONSE')
  } finally {
    await invalid.close()
  }
})
