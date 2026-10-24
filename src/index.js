/** Host half: translation sites, LLM route, persisted settings and cache, and the browser HTTP routes. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  ConfigError, DEFAULT_SYSTEM_PROMPT, effectiveConfig, llmRouteOf, normalizeCustomProvider, normalizeOverrides,
  providerList, resolveProvider,
} from './config.js'
import { TranslationCache, cacheKey } from './cache.js'
import { translateWithSite } from './sites.js'
import { listCustomModels, translateWithCustomLlm, translateWithLlm } from './llm.js'
import { TranslationFailure } from './errors.js'

/** Cordis function-plugin name. */
export const name = 'cot-translator'
/** Host services required before the routes can register; the model runtime is optional. */
export const inject = ['webServer', 'connection']

const ROUTE_STATE = '/cot-translator/state'
const ROUTE_SETTINGS = '/cot-translator/settings'
const ROUTE_TRANSLATE = '/cot-translator/translate'
const ROUTE_CACHE_CLEAR = '/cot-translator/cache/clear'
const ROUTE_LLM_MODELS = '/cot-translator/llm/models'
const MAX_BODY_BYTES = 512 * 1024
const LANGUAGE_PATTERN = /^(?:auto|[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*)$/

function dshHome() {
  const configured = process.env.DSH_HOME
  return configured !== undefined && configured !== '' ? configured : join(homedir(), '.dsh')
}

/** Settings and cache live beside the other Harness home state, never inside the installation. */
export function dataPaths() {
  const directory = join(dshHome(), 'cot-translator')
  return { directory, settings: join(directory, 'settings.json'), cache: join(directory, 'cache.json') }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

async function readJsonBody(req) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > MAX_BODY_BYTES) throw new ConfigError(`request body exceeds ${MAX_BODY_BYTES} bytes`)
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new ConfigError('request body must be JSON')
  }
}

function recipeOf(site) {
  return JSON.stringify([site.endpoint, site.method, site.contentType ?? '', site.body ?? '',
    site.responsePaths ?? [], site.responseJoin ?? null, site.languageMap ?? {}])
}

function llmRecipe(llm, route) {
  const identity = route.source === 'custom' ? `${route.provider.id} ${route.provider.baseUrl}` : llm.provider
  return JSON.stringify([llm.source, identity, llm.model, llm.reasoningEffort, llm.maxTokens, llm.temperature, llm.systemPrompt])
}

function viaOf(site, route, llm) {
  if (site !== undefined) return { kind: 'site', id: site.id, name: site.label }
  return route.source === 'custom'
    ? { kind: 'llm', source: 'custom', provider: route.provider.id, name: route.provider.label, model: llm.model }
    : { kind: 'llm', source: 'builtin', provider: route.provider, model: llm.model }
}

function statusOf(failure) {
  switch (failure.code) {
    case 'TRANSLATION_TIMEOUT': return 504
    case 'TRANSLATION_UNAVAILABLE': return 503
    case 'TRANSLATION_TEXT_LIMIT': return 400
    default: return 502
  }
}

/**
 * Register the plugin routes and load its persisted settings.
 * @param ctx - Host context providing the Web carrier, connection admission, and optional model runtime.
 * @param config - optional composition-level defaults from the plugin row; user settings win over them.
 */
export async function apply(ctx, config) {
  const seed = config === undefined ? {} : normalizeOverrides(config)
  const paths = dataPaths()
  const warn = (message) => { ctx.logger?.warn?.(`cot-translator: ${message}`) }
  let overrides = {}
  try {
    overrides = normalizeOverrides(JSON.parse(await readFile(paths.settings, 'utf8')))
  } catch (error) {
    if (error?.code !== 'ENOENT') warn(`ignored the stored settings: ${error?.message ?? error}`)
  }
  let effective = effectiveConfig(overrides, seed)
  const cache = new TranslationCache(paths.cache, effective.cacheMaxEntries, warn)
  await cache.load()
  ctx.effect(() => () => { void cache.flush() }, 'cot-translator: flush the translation cache')

  const inFlight = new Map()

  const state = async () => {
    const llm = ctx.get('llm')
    const builtinLlmProviders = llm === undefined ? [] : llm.listProviders().map(provider => ({ id: provider.id, name: provider.name }))
    let llmModels = []
    if (llm !== undefined && effective.llm.source === 'builtin' && effective.llm.provider !== '') {
      try {
        llmModels = (await llm.listModels(effective.llm.provider)).map(model => model.id)
      } catch (error) {
        warn(`could not list models for "${effective.llm.provider}": ${error?.message ?? error}`)
      }
    }
    return {
      ...effective,
      providers: providerList(effective),
      builtinLlmProviders,
      llmModels,
      defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
      paths: { settings: paths.settings },
    }
  }

  const translate = async (body, signal) => {
    const request = {
      text: typeof body.text === 'string' ? body.text : '',
      sourceLanguage: body.sourceLanguage === undefined ? 'auto' : String(body.sourceLanguage),
      targetLanguage: body.targetLanguage === undefined ? effective.targetLanguage : String(body.targetLanguage),
      provider: body.provider === undefined ? undefined : String(body.provider),
    }
    /** A regenerate request translates again and replaces the cached entry. */
    const refresh = body.refresh === true
    if (typeof body.text !== 'string') throw new ConfigError('text: required')
    if (request.text.length > effective.maxTextChars) {
      throw new TranslationFailure('TRANSLATION_TEXT_LIMIT', `text exceeds ${effective.maxTextChars} UTF-16 code units`)
    }
    if (!LANGUAGE_PATTERN.test(request.targetLanguage)) throw new ConfigError('targetLanguage: invalid language code')
    if (!LANGUAGE_PATTERN.test(request.sourceLanguage)) throw new ConfigError('sourceLanguage: invalid language code')
    const provider = resolveProvider(effective, request.provider)
    if (provider === undefined) throw new ConfigError('no translation provider is configured')
    const route = provider.kind === 'llm' ? llmRouteOf(effective) : undefined
    if (provider.kind === 'llm' && route === undefined) throw new ConfigError('the configured LLM route is incomplete')
    const site = route === undefined ? effective.sites.find(entry => entry.id === provider.id) : undefined
    const via = viaOf(site, route, effective.llm)
    if (request.text === '') return { text: '', cached: false, provider: provider.id, via }
    const recipe = site === undefined ? llmRecipe(effective.llm, route) : recipeOf(site)
    const key = cacheKey([provider.id, recipe, request.sourceLanguage, request.targetLanguage, request.text])
    if (!refresh) {
      const saved = cache.get(key)
      if (saved !== undefined) return { text: saved, cached: true, provider: provider.id, via }
      const pending = inFlight.get(key)
      if (pending !== undefined) return { text: await pending, cached: false, provider: provider.id, via, shared: true }
    }
    const limits = {
      timeoutMs: site === undefined ? effective.llmTimeoutMs : effective.siteTimeoutMs,
      maxResponseBytes: effective.maxResponseBytes,
    }
    const work = (async () => {
      let text
      if (site !== undefined) text = await translateWithSite(site, request, limits, signal)
      else if (route.source === 'custom') text = await translateWithCustomLlm(route.provider, effective.llm, request, limits, signal)
      else text = await translateWithLlm(ctx, effective.llm, request, limits, signal)
      cache.set(key, text)
      return text
    })()
    inFlight.set(key, work)
    try {
      return { text: await work, cached: false, provider: provider.id, via }
    } finally {
      inFlight.delete(key)
    }
  }

  const listModels = async (body, signal) => {
    const source = body.source === 'custom' ? 'custom' : 'builtin'
    if (source === 'builtin') {
      const llm = ctx.get('llm')
      if (llm === undefined) throw new TranslationFailure('TRANSLATION_UNAVAILABLE', 'no model provider runtime is available')
      const provider = typeof body.provider === 'string' ? body.provider.trim() : ''
      if (provider === '') throw new ConfigError('provider: required')
      try {
        const models = await llm.listModels(provider)
        return { source, models: models.map(model => ({ id: model.id, name: model.name ?? model.id })) }
      } catch (error) {
        throw new TranslationFailure('TRANSLATION_UNAVAILABLE', `could not list models for "${provider}": ${error?.message ?? error}`)
      }
    }
    const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : ''
    if (providerId === '') throw new ConfigError('providerId: required')
    const saved = effective.llmProviders.find(entry => entry.id === providerId)
    const baseUrl = typeof body.baseUrl === 'string' && body.baseUrl !== '' ? body.baseUrl : saved?.baseUrl
    if (baseUrl === undefined) throw new ConfigError('baseUrl: required')
    const provider = normalizeCustomProvider({
      id: providerId,
      label: saved?.label ?? providerId,
      baseUrl,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : saved?.apiKey ?? '',
      models: [],
      ...(saved?.headers === undefined ? {} : { headers: saved.headers }),
    }, 'llmProviders.draft')
    const ids = await listCustomModels(provider, {
      timeoutMs: effective.llmTimeoutMs,
      maxResponseBytes: effective.maxResponseBytes,
    }, signal)
    return { source, models: ids.map(id => ({ id, name: id })) }
  }

  const saveSettings = async (body) => {
    const next = normalizeOverrides(body)
    if (next.llmProviders === undefined && overrides.llmProviders !== undefined) next.llmProviders = overrides.llmProviders
    const candidate = effectiveConfig(next, seed)
    if (providerList(candidate).length === 0) throw new ConfigError('at least one translation service is required')
    if (candidate.llm.source === 'custom' && candidate.llm.customProvider !== ''
      && !candidate.llmProviders.some(entry => entry.id === candidate.llm.customProvider)) {
      throw new ConfigError(`llm.customProvider: "${candidate.llm.customProvider}" is not declared in llmProviders`)
    }
    await mkdir(dirname(paths.settings), { recursive: true })
    const temporary = `${paths.settings}.${Date.now()}.tmp`
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    await rename(temporary, paths.settings)
    overrides = next
    effective = candidate
    cache.maxEntries = effective.cacheMaxEntries
    return state()
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_STATE,
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }
      if (req.method !== 'GET') {
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use GET' })
        return
      }
      try {
        sendJson(res, 200, await state())
      } catch (error) {
        warn(`state read failed: ${error?.message ?? error}`)
        sendJson(res, 500, { code: 'state-failed', message: 'could not read translation settings' })
      }
    },
  }), `cot-translator: GET ${ROUTE_STATE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_SETTINGS,
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use POST' })
        return
      }
      try {
        sendJson(res, 200, await saveSettings(await readJsonBody(req)))
      } catch (error) {
        if (error instanceof ConfigError) {
          sendJson(res, 400, { code: 'invalid-settings', message: error.message })
          return
        }
        warn(`settings write failed: ${error?.message ?? error}`)
        sendJson(res, 500, { code: 'settings-failed', message: 'could not save translation settings' })
      }
    },
  }), `cot-translator: POST ${ROUTE_SETTINGS}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_TRANSLATE,
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use POST' })
        return
      }
      const cancelled = new AbortController()
      res.on('close', () => { if (!res.writableEnded) cancelled.abort(new Error('client disconnected')) })
      try {
        const body = await readJsonBody(req)
        sendJson(res, 200, await translate(body, cancelled.signal))
      } catch (error) {
        if (cancelled.signal.aborted && !res.writableEnded) return
        if (error instanceof ConfigError) {
          sendJson(res, 400, { code: 'invalid-request', message: error.message })
          return
        }
        if (error instanceof TranslationFailure) {
          warn(`translation failed: ${error.code} ${error.message}`)
          sendJson(res, statusOf(error), { code: error.code, message: error.message })
          return
        }
        warn(`unexpected translation failure: ${error?.message ?? error}`)
        sendJson(res, 500, { code: 'TRANSLATION_FAILED', message: 'translation failed' })
      }
    },
  }), `cot-translator: POST ${ROUTE_TRANSLATE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_CACHE_CLEAR,
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use POST' })
        return
      }
      try {
        await cache.clear()
        sendJson(res, 200, { cleared: true })
      } catch (error) {
        warn(`cache clear failed: ${error?.message ?? error}`)
        sendJson(res, 500, { code: 'cache-failed', message: 'could not clear the translation cache' })
      }
    },
  }), `cot-translator: POST ${ROUTE_CACHE_CLEAR}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_LLM_MODELS,
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use POST' })
        return
      }
      const cancelled = new AbortController()
      res.on('close', () => { if (!res.writableEnded) cancelled.abort(new Error('client disconnected')) })
      try {
        sendJson(res, 200, await listModels(await readJsonBody(req), cancelled.signal))
      } catch (error) {
        if (cancelled.signal.aborted && !res.writableEnded) return
        if (error instanceof ConfigError) {
          sendJson(res, 400, { code: 'invalid-request', message: error.message })
          return
        }
        if (error instanceof TranslationFailure) {
          warn(`model list failed: ${error.code} ${error.message}`)
          sendJson(res, statusOf(error), { code: error.code, message: error.message })
          return
        }
        warn(`unexpected model list failure: ${error?.message ?? error}`)
        sendJson(res, 500, { code: 'TRANSLATION_FAILED', message: 'could not list models' })
      }
    },
  }), `cot-translator: POST ${ROUTE_LLM_MODELS}`)
}
