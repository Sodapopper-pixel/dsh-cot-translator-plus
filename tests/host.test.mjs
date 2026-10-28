import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_SYSTEM_PROMPT } from '../src/config.js'
import { apply } from '../src/index.js'

function fakeCtx({ llm } = {}) {
  const routes = new Map()
  const disposers = []
  const warnings = []
  const ctx = {
    logger: { warn: message => { warnings.push(message) } },
    get: name => name === 'llm' ? llm : undefined,
    effect(fn) {
      const disposer = fn()
      if (typeof disposer === 'function') disposers.push(disposer)
    },
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route)
          return () => { routes.delete(route.path) }
        },
      },
    },
  }
  return { ctx, routes, disposers, warnings }
}

async function call(routes, path, options = {}) {
  const route = routes.get(path)
  assert.ok(route, `route ${path} is registered`)
  const method = options.method ?? 'GET'
  assert.ok(route.methods.includes(method), `route ${path} accepts ${method}`)
  const init = { method }
  if (options.body !== undefined) init.body = JSON.stringify(options.body)
  const response = await route.fetch(new Request(`http://dsh.internal${path}`, init))
  const text = await response.text()
  return { status: response.status, body: text === '' ? undefined : JSON.parse(text) }
}

async function scene(seed = {}) {
  const home = await mkdtemp(join(tmpdir(), 'cot-host-'))
  process.env.DSH_HOME = home
  const site = createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      const target = new URL(req.url, 'http://127.0.0.1').searchParams.get('to')
      const q = JSON.parse(body).q
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ data: { text: `[${target}]${q}` } }))
    })
  })
  await new Promise(resolve => { site.listen(0, '127.0.0.1', resolve) })
  const origin = `http://127.0.0.1:${site.address().port}`
  const demo = {
    id: 'demo', label: 'Demo', endpoint: `${origin}/t?to={{target}}`,
    contentType: 'application/json', body: '{"q":{{text|json}}}', responsePaths: ['data.text'],
  }
  const made = fakeCtx(seed.ctx)
  await apply(made.ctx, { defaultProvider: 'demo', sites: [demo], ...seed.config })
  return {
    ...made,
    origin,
    async close() {
      for (const dispose of made.disposers.reverse()) await dispose()
      await new Promise(resolve => { site.close(resolve) })
    },
  }
}

test('state, translate, cache reuse, settings, and validation', async () => {
  const run = await scene()
  try {
    const initial = await call(run.routes, '/api/cot-translator/state')
    assert.equal(initial.status, 200)
    assert.equal(initial.body.defaultProvider, 'demo')
    assert.equal(initial.body.defaultSystemPrompt, DEFAULT_SYSTEM_PROMPT, 'the card can show and restore the built-in prompt')
    assert.equal(initial.body.llm.systemPrompt, DEFAULT_SYSTEM_PROMPT)
    assert.deepEqual(initial.body.providers.map(provider => provider.id), ['bing', 'google', 'demo'])
    assert.equal(initial.body.paths.settings.endsWith('settings.json'), true)

    const first = await call(run.routes, '/api/cot-translator/translate', {
      method: 'POST', body: { provider: 'demo', text: 'hello', targetLanguage: 'zh' },
    })
    assert.equal(first.status, 200)
    assert.deepEqual({ text: first.body.text, cached: first.body.cached }, { text: '[zh]hello', cached: false })

    const second = await call(run.routes, '/api/cot-translator/translate', {
      method: 'POST', body: { provider: 'demo', text: 'hello', targetLanguage: 'zh' },
    })
    assert.equal(second.body.cached, true)
    assert.equal(second.body.text, '[zh]hello')

    const empty = await call(run.routes, '/api/cot-translator/translate', {
      method: 'POST', body: { provider: 'demo', text: '', targetLanguage: 'zh' },
    })
    assert.deepEqual({ text: empty.body.text, cached: empty.body.cached }, { text: '', cached: false })

    const saved = await call(run.routes, '/api/cot-translator/settings', {
      method: 'POST',
      body: { defaultProvider: 'demo', targetLanguage: 'ja', maxTextChars: 6, sites: [{
        id: 'demo', label: 'Demo', endpoint: `${run.origin}/t?to={{target}}`,
        contentType: 'application/json', body: '{"q":{{text|json}}}', responsePaths: ['data.text'],
      }] },
    })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.targetLanguage, 'ja')
    assert.equal(saved.body.maxTextChars, 6)

    const tooLong = await call(run.routes, '/api/cot-translator/translate', {
      method: 'POST', body: { provider: 'demo', text: 'hello world', targetLanguage: 'ja' },
    })
    assert.equal(tooLong.status, 400)
    assert.equal(tooLong.body.code, 'TRANSLATION_TEXT_LIMIT')
    assert.equal(JSON.stringify(tooLong.body).includes('hello world'), false, 'failures never echo the source')

    const invalid = await call(run.routes, '/api/cot-translator/settings', { method: 'POST', body: { maxTextChars: 1 } })
    assert.equal(invalid.status, 400)
    assert.equal(invalid.body.code, 'invalid-settings')
    assert.match(invalid.body.message, /maxTextChars/)

    const settingsRoute = run.routes.get('/api/cot-translator/settings')
    assert.deepEqual(settingsRoute.methods, ['POST'], 'the channel answers 405 for other methods')

    const cleared = await call(run.routes, '/api/cot-translator/cache/clear', { method: 'POST', body: {} })
    assert.equal(cleared.body.cleared, true)
    const afterClear = await call(run.routes, '/api/cot-translator/translate', {
      method: 'POST', body: { provider: 'demo', text: 'hello', targetLanguage: 'zh' },
    })
    assert.equal(afterClear.body.cached, false)
  } finally {
    await run.close()
  }
})

test('settings survive a reload', async () => {
  const run = await scene()
  try {
    await call(run.routes, '/api/cot-translator/settings', {
      method: 'POST', body: { targetLanguage: 'ja', maxTextChars: 4321 },
    })
    for (const dispose of run.disposers.splice(0).reverse()) await dispose()

    const reloaded = fakeCtx()
    process.env.DSH_HOME = process.env.DSH_HOME
    await apply(reloaded.ctx, { defaultProvider: 'demo' })
    const state = await call(reloaded.routes, '/api/cot-translator/state')
    assert.equal(state.body.targetLanguage, 'ja')
    assert.equal(state.body.maxTextChars, 4321)
    for (const dispose of reloaded.disposers.reverse()) await dispose()
  } finally {
    await run.close()
  }
})

test('every route mounts under the shared /api channel', async () => {
  const run = await scene()
  try {
    assert.deepEqual([...run.routes.keys()].sort(), [
      '/api/cot-translator/cache/clear',
      '/api/cot-translator/llm/models',
      '/api/cot-translator/settings',
      '/api/cot-translator/state',
      '/api/cot-translator/translate',
    ])
  } finally {
    await run.close()
  }
})

test('the LLM route dispatches through the model runtime and lists providers', async () => {
  let prepared
  const chunks = [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: '模型译文' },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const llm = {
    listProviders: () => [{ id: 'fake', name: 'Fake' }],
    listModels: async () => [{ id: 'm' }],
    prepareCall: async (config) => {
      prepared = config
      return {
        config: { ...config },
        stream: () => (async function* () { for (const chunk of chunks) yield chunk })(),
      }
    },
  }
  const run = await scene({
    ctx: { llm },
    config: { llm: { provider: 'fake', model: 'm', maxTokens: 128, reasoningEffort: 'off' } },
  })
  try {
    const state = await call(run.routes, '/api/cot-translator/state')
    assert.deepEqual(state.body.providers.map(provider => provider.kind), ['site', 'site', 'site', 'llm'])
    assert.deepEqual(state.body.builtinLlmProviders, [{ id: 'fake', name: 'Fake' }])
    assert.deepEqual(state.body.llmModels, ['m'])
    assert.equal(state.body.llm.provider, 'fake')
    assert.deepEqual(state.body.llmProviders, [])

    const result = await call(run.routes, '/api/cot-translator/translate', {
      method: 'POST', body: { provider: 'llm', text: 'hello', targetLanguage: 'zh' },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.text, '模型译文')
    assert.deepEqual(result.body.via, { kind: 'llm', source: 'builtin', provider: 'fake', model: 'm' })
    assert.equal(prepared.provider, 'fake')
    assert.equal(prepared.model, 'm')
    assert.equal(prepared.maxTokens, 128)
  } finally {
    await run.close()
  }
})

test('a custom provider translates, regenerates, lists models, and reports its source', async () => {
  const seen = []
  const openai = createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      const entry = { method: req.method, url: req.url, authorization: req.headers.authorization }
      seen.push(entry)
      if (req.method === 'GET' && req.url === '/v1/models') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'smart' }, { id: 'fast' }] }))
        return
      }
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        const payload = JSON.parse(body)
        entry.roles = payload.messages.map(message => message.role)
        entry.system = payload.messages.find(message => message.role === 'system')?.content
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: `[${payload.model}]${payload.messages.at(-1).content}` } }] }))
        return
      }
      res.statusCode = 404
      res.end()
    })
  })
  await new Promise(resolve => { openai.listen(0, '127.0.0.1', resolve) })
  const origin = `http://127.0.0.1:${openai.address().port}`
  const run = await scene({
    config: {
      llm: { source: 'custom', customProvider: 'acme', model: 'fast', maxTokens: 32, temperature: 0 },
      llmProviders: [{ id: 'acme', label: 'Acme', baseUrl: `${origin}/v1`, apiKey: 'k-1', models: ['fast'] }],
    },
  })
  try {
    const state = await call(run.routes, '/api/cot-translator/state')
    assert.equal(state.body.llm.source, 'custom')
    assert.deepEqual(state.body.builtinLlmProviders, [])
    assert.deepEqual(state.body.providers.at(-1), {
      id: 'llm', label: 'LLM · Acme/fast', kind: 'llm', source: 'custom', model: 'fast', providerName: 'Acme',
    })
    assert.deepEqual(state.body.llmProviders.map(entry => entry.id), ['acme'])

    const llmResult = await call(run.routes, '/api/cot-translator/translate', {
      method: 'POST', body: { provider: 'llm', text: 'hello', targetLanguage: 'zh' },
    })
    assert.equal(llmResult.status, 200)
    assert.equal(llmResult.body.text, '[fast]hello')
    assert.deepEqual(llmResult.body.via, { kind: 'llm', source: 'custom', provider: 'acme', name: 'Acme', model: 'fast' })

    const siteResult = await call(run.routes, '/api/cot-translator/translate', {
      method: 'POST', body: { provider: 'demo', text: 'hello', targetLanguage: 'zh' },
    })
    assert.deepEqual(siteResult.body.via, { kind: 'site', id: 'demo', name: 'Demo' })
    assert.equal(siteResult.body.cached, false, 'the site and the LLM never share a cache entry')

    const cachedLlm = await call(run.routes, '/api/cot-translator/translate', {
      method: 'POST', body: { provider: 'llm', text: 'hello', targetLanguage: 'zh' },
    })
    assert.equal(cachedLlm.body.cached, true)
    assert.equal(cachedLlm.body.text, '[fast]hello')

    const beforeRefresh = seen.filter(entry => entry.method === 'POST' && entry.url === '/v1/chat/completions').length
    const refreshed = await call(run.routes, '/api/cot-translator/translate', {
      method: 'POST', body: { provider: 'llm', text: 'hello', targetLanguage: 'zh', refresh: true },
    })
    assert.equal(refreshed.status, 200)
    assert.equal(refreshed.body.cached, false, 'a regenerate request ignores the stored translation')
    const upstream = seen.filter(entry => entry.method === 'POST' && entry.url === '/v1/chat/completions')
    assert.equal(upstream.length, beforeRefresh + 1, 'a regenerate request reaches the provider again')
    assert.match(upstream.at(-1).system, /Translate the following text to zh/, 'the built-in instruction is sent by default')

    const cleared = await call(run.routes, '/api/cot-translator/settings', {
      method: 'POST',
      body: { llm: { source: 'custom', customProvider: 'acme', model: 'fast', systemPrompt: null } },
    })
    assert.equal(cleared.status, 200)
    assert.equal(cleared.body.llm.systemPrompt, null, 'a cleared prompt is stored as null')
    const alone = await call(run.routes, '/api/cot-translator/translate', {
      method: 'POST', body: { provider: 'llm', text: 'hello', targetLanguage: 'zh', refresh: true },
    })
    assert.equal(alone.status, 200)
    assert.deepEqual(seen.filter(entry => entry.method === 'POST').at(-1).roles, ['user'], 'a cleared prompt sends no system message')

    const restoredPrompt = await call(run.routes, '/api/cot-translator/settings', {
      method: 'POST',
      body: { llm: { source: 'custom', customProvider: 'acme', model: 'fast', systemPrompt: DEFAULT_SYSTEM_PROMPT } },
    })
    assert.equal(restoredPrompt.body.llm.systemPrompt, DEFAULT_SYSTEM_PROMPT)

    const models = await call(run.routes, '/api/cot-translator/llm/models', {
      method: 'POST', body: { source: 'custom', providerId: 'acme' },
    })
    assert.equal(models.status, 200)
    assert.deepEqual(models.body.models.map(model => model.id), ['fast', 'smart'])

    const draft = await call(run.routes, '/api/cot-translator/llm/models', {
      method: 'POST', body: { source: 'custom', providerId: 'draft', baseUrl: `${origin}/v1`, apiKey: 'k-2' },
    })
    assert.deepEqual(draft.body.models.map(model => model.id), ['fast', 'smart'])

    assert.ok(seen.every(entry => entry.authorization === 'Bearer k-1' || entry.authorization === 'Bearer k-2'))

    const rejected = await call(run.routes, '/api/cot-translator/settings', {
      method: 'POST', body: { llm: { source: 'custom', customProvider: 'ghost', model: 'fast' } },
    })
    assert.equal(rejected.status, 400)
    assert.match(rejected.body.message, /ghost/)

    const saved = await call(run.routes, '/api/cot-translator/settings', {
      method: 'POST',
      body: {
        llm: { source: 'custom', customProvider: 'acme', model: 'fast' },
        llmProviders: [{ id: 'acme', label: 'Acme', baseUrl: `${origin}/v1`, apiKey: 'k-3', models: ['fast', 'smart'] }],
      },
    })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.llmProviders[0].apiKey, 'k-3')

    const kept = await call(run.routes, '/api/cot-translator/settings', {
      method: 'POST', body: { targetLanguage: 'ja' },
    })
    assert.equal(kept.status, 200)
    assert.deepEqual(kept.body.llmProviders.map(entry => entry.id), ['acme'], 'an omitted provider list is preserved')
  } finally {
    await run.close()
    await new Promise(resolve => { openai.close(resolve) })
  }
})
