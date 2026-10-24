import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ConfigError, DEFAULT_CONFIG, DEFAULT_SYSTEM_PROMPT, PRESET_SITES, effectiveConfig, llmRouteOf, normalizeOverrides,
  normalizeSite, providerList, resolveProvider, siteLanguage,
} from '../src/config.js'

test('normalizeSite keeps known fields and defaults a POST JSON site', () => {
  const site = normalizeSite({
    id: 'demo', label: ' Demo ', endpoint: 'https://example.test/translate?to={{target}}',
    body: '{"q":{{text|json}}}', contentType: 'application/json',
    headers: { authorization: 'Bearer x' }, responsePaths: ['data.text'],
  }, 'site')
  assert.equal(site.id, 'demo')
  assert.equal(site.label, 'Demo')
  assert.equal(site.method, 'POST')
  assert.equal(site.responseType, 'json')
  assert.deepEqual(site.responsePaths, ['data.text'])
  assert.deepEqual(site.headers, { authorization: 'Bearer x' })
})

test('normalizeSite rejects unsafe or incomplete definitions', () => {
  const cases = [
    [{}, /id/],
    [{ id: 'bad id', label: 'x', endpoint: 'https://x.test' }, /id/],
    [{ id: 'a', label: '', endpoint: 'https://x.test' }, /label/],
    [{ id: 'a', label: 'x', endpoint: 'ftp://x.test' }, /http/],
    [{ id: 'a', label: 'x', endpoint: 'https://user:pw@x.test' }, /credentials/],
    [{ id: 'a', label: 'x', endpoint: 'https://x.test', method: 'DELETE' }, /method/],
    [{ id: 'a', label: 'x', endpoint: 'https://x.test', method: 'GET', body: 'x' }, /body/],
    [{ id: 'a', label: 'x', endpoint: 'https://x.test' }, /responsePaths or responseJoin/],
    [{ id: 'a', label: 'x', endpoint: 'https://x.test', responseType: 'xml' }, /responseType/],
    [{ id: 'a', label: 'x', endpoint: 'https://x.test', responsePaths: ['a'], headers: { 'bad header': 'v' } }, /header name/],
    [{ id: 'a', label: 'x', endpoint: 'https://x.test', responsePaths: ['a'], headers: { a: 'x\r\ny' } }, /line breaks/],
    [{ id: 'a', label: 'x', endpoint: 'https://x.test', responsePaths: ['a'], languageMap: { zh: 1 } }, /must be a string/],
  ]
  for (const [site, pattern] of cases) {
    assert.throws(() => normalizeSite(site, 'site'), (error) => error instanceof ConfigError && pattern.test(error.message), JSON.stringify(site))
  }
})

test('a disabled site needs only its id', () => {
  assert.deepEqual(normalizeSite({ id: 'bing', disabled: true }, 'site'), { id: 'bing', disabled: true })
})

test('normalizeOverrides validates scalars and duplicate site ids', () => {
  const overrides = normalizeOverrides({
    defaultProvider: 'demo', targetLanguage: 'ja', maxTextChars: 100, cacheMaxEntries: 0,
    siteTimeoutMs: 5000, llmTimeoutMs: 60000, maxResponseBytes: 2048,
    sites: [{ id: 'demo', label: 'Demo', endpoint: 'https://x.test', responsePaths: ['t'] }],
    llm: { provider: 'myapi', model: 'fast', maxTokens: 256, temperature: 0.2, reasoningEffort: 'off' },
  })
  assert.equal(overrides.maxTextChars, 100)
  assert.equal(overrides.llm.model, 'fast')
  assert.equal(overrides.sites.length, 1)

  assert.throws(() => normalizeOverrides({ targetLanguage: 'zh CN' }), /targetLanguage/)
  assert.throws(() => normalizeOverrides({ maxTextChars: 1 }), /maxTextChars/)
  assert.throws(() => normalizeOverrides({ cacheMaxEntries: -1 }), /cacheMaxEntries/)
  assert.throws(() => normalizeOverrides({ sites: 'x' }), /sites/)
  assert.throws(() => normalizeOverrides({ llm: { provider: 'x' } }), /model/)
  assert.throws(() => normalizeOverrides({ llm: { temperature: 3 } }), /temperature/)
  assert.throws(() => normalizeOverrides({
    sites: [
      { id: 'a', label: 'A', endpoint: 'https://x.test', responsePaths: ['t'] },
      { id: 'A', label: 'B', endpoint: 'https://x.test', responsePaths: ['t'] },
    ],
  }), /appears twice/)
})

test('the built-in system prompt is the effective default', () => {
  const config = effectiveConfig({})
  assert.equal(config.llm.systemPrompt, DEFAULT_SYSTEM_PROMPT)
  assert.match(config.llm.systemPrompt, /\{\{source\}\}/)
  assert.match(config.llm.systemPrompt, /\{\{target\}\}/)
})

test('systemPrompt keeps three states: built-in default, no message, custom text', () => {
  assert.equal(normalizeOverrides({ llm: {} }).llm.systemPrompt, undefined, 'an omitted field leaves the default in place')
  assert.equal(normalizeOverrides({ llm: { systemPrompt: null } }).llm.systemPrompt, null)
  assert.equal(normalizeOverrides({ llm: { systemPrompt: '' } }).llm.systemPrompt, DEFAULT_SYSTEM_PROMPT,
    'the pre-0.2 empty spelling still means the built-in instruction')
  assert.equal(normalizeOverrides({ llm: { systemPrompt: '译成 {{target}}' } }).llm.systemPrompt, '译成 {{target}}')

  assert.equal(effectiveConfig(normalizeOverrides({ llm: { systemPrompt: null } })).llm.systemPrompt, null)
  assert.equal(effectiveConfig(normalizeOverrides({ llm: { systemPrompt: 'x {{target}}' } })).llm.systemPrompt, 'x {{target}}')
  assert.throws(() => normalizeOverrides({ llm: { systemPrompt: 1 } }), /systemPrompt/)
  assert.throws(() => normalizeOverrides({ llm: { systemPrompt: 'x'.repeat(8193) } }), /at most 8192/)
})

test('effectiveConfig layers presets, composition seeds, and overrides by site id', () => {
  const seed = normalizeOverrides({ maxTextChars: 9000, sites: [{ id: 'bing', label: 'Bing custom', responsePaths: ['custom.path'] }] })
  const overrides = normalizeOverrides({
    defaultProvider: 'demo',
    sites: [{ id: 'bing', label: 'Bing user', endpoint: 'https://user.test/translate' }, { id: 'google', disabled: true },
      { id: 'demo', label: 'Demo', endpoint: 'https://demo.test', responsePaths: ['t'] }],
    llm: { provider: 'myapi', model: 'fast' },
  })
  const config = effectiveConfig(overrides, seed)
  assert.equal(config.maxTextChars, 9000)
  const ids = config.sites.map(site => site.id)
  assert.deepEqual(ids, ['bing', 'demo'])
  const bing = config.sites[0]
  assert.equal(bing.label, 'Bing user')
  assert.equal(bing.endpoint, 'https://user.test/translate')
  assert.deepEqual(bing.responsePaths, ['custom.path'], 'omitted preset fields survive an override')
  assert.equal(config.llm.provider, 'myapi')
  assert.deepEqual(providerList(config).map(provider => provider.kind), ['site', 'site', 'llm'])
})

test('effectiveConfig starts from the shipped defaults and presets', () => {
  const config = effectiveConfig({})
  assert.equal(config.targetLanguage, DEFAULT_CONFIG.targetLanguage)
  assert.deepEqual(config.sites.map(site => site.id), PRESET_SITES.map(site => site.id))
  assert.deepEqual(providerList(config).map(provider => provider.id), ['bing', 'google'])
})

test('resolveProvider prefers the request, then the default, then the first site', () => {
  const config = effectiveConfig({ defaultProvider: 'google' })
  assert.equal(resolveProvider(config, 'bing').id, 'bing')
  assert.equal(resolveProvider(config, undefined).id, 'google')
  assert.equal(resolveProvider(config, 'missing').id, 'google')
  const onlyBing = effectiveConfig(normalizeOverrides({ defaultProvider: 'gone', sites: [{ id: 'google', disabled: true }] }))
  assert.equal(resolveProvider(onlyBing, 'missing').id, 'bing')
  assert.equal(resolveProvider(effectiveConfig(normalizeOverrides({ sites: PRESET_SITES.map(site => ({ id: site.id, disabled: true })) })), undefined), undefined)
})

test('normalizeOverrides keeps custom providers and rejects unsafe entries', () => {
  const overrides = normalizeOverrides({
    llm: { source: 'custom', customProvider: 'acme', model: 'fast' },
    llmProviders: [{
      id: 'acme', label: ' Acme ', baseUrl: 'https://api.acme.test/v1/', apiKey: 'k',
      models: ['fast', 'smart'], headers: { 'x-org': 'o' },
    }],
  })
  assert.equal(overrides.llm.source, 'custom')
  assert.deepEqual(overrides.llmProviders[0], {
    id: 'acme', label: 'Acme', baseUrl: 'https://api.acme.test/v1', apiKey: 'k',
    models: ['fast', 'smart'], headers: { 'x-org': 'o' },
  })

  const cases = [
    [{ llmProviders: 'x' }, /llmProviders/],
    [{ llmProviders: [{ id: 'a', label: 'A', baseUrl: 'ftp://x.test' }] }, /http/],
    [{ llmProviders: [{ id: 'a', label: '', baseUrl: 'https://x.test' }] }, /label/],
    [{ llmProviders: [{ id: 'a', label: 'A', baseUrl: 'https://x.test', models: ['x', 'x'] }] }, /appears twice/],
    [{
      llmProviders: [{ id: 'a', label: 'A', baseUrl: 'https://x.test' }, { id: 'A', label: 'B', baseUrl: 'https://y.test' }],
    }, /appears twice/],
    [{ llm: { source: 'remote' } }, /source/],
    [{ llm: { source: 'custom', customProvider: 'gone', model: 'm' }, llmProviders: [] }, /not declared/],
  ]
  for (const [raw, pattern] of cases) assert.throws(() => normalizeOverrides(raw), pattern)
})

test('effectiveConfig resolves custom LLM routes and replaces provider lists per layer', () => {
  const seed = normalizeOverrides({
    llmProviders: [{ id: 'acme', label: 'Acme', baseUrl: 'https://seed.test', models: ['a'] }],
    llm: { source: 'custom', customProvider: 'acme', model: 'a' },
  })
  const overrides = normalizeOverrides({
    llmProviders: [{ id: 'other', label: 'Other', baseUrl: 'https://other.test', models: ['b'] }],
    llm: { customProvider: 'other', model: 'b' },
  })
  const config = effectiveConfig(overrides, seed)
  assert.deepEqual(config.llmProviders.map(entry => entry.id), ['other'])
  assert.deepEqual(config.llmProviders[0].models, ['b'])
  const llm = providerList(config).at(-1)
  assert.equal(llm.id, 'llm')
  assert.equal(llm.source, 'custom')
  assert.equal(llm.providerName, 'Other')
  assert.equal(llm.label, 'LLM · Other/b')
  assert.equal(llmRouteOf(config).provider.baseUrl, 'https://other.test')
  assert.equal(llmRouteOf(config).source, 'custom')

  const broken = effectiveConfig(normalizeOverrides({ llm: { source: 'custom', customProvider: 'gone', model: 'm' } }))
  assert.equal(providerList(broken).some(provider => provider.kind === 'llm'), false)
  assert.equal(llmRouteOf(broken), undefined)
})

test('siteLanguage maps Chinese locale tags case-insensitively and passes others through', () => {
  const bing = PRESET_SITES.find(site => site.id === 'bing')
  assert.equal(siteLanguage(bing, 'auto'), 'auto')
  assert.equal(siteLanguage(bing, 'zh'), 'zh-Hans')
  assert.equal(siteLanguage(bing, 'ZH-TW'), 'zh-Hant')
  assert.equal(siteLanguage(bing, 'en'), 'en')
  assert.equal(siteLanguage({ id: 'x', label: 'x', endpoint: 'x', method: 'GET', responseType: 'text' }, 'zh'), 'zh')
})
