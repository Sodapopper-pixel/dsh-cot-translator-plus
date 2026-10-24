/** LLM translation through the Harness model runtime or a plugin-owned endpoint, without Agent history. */
import { TranslationFailure, timeoutOf, withDeadline } from './errors.js'
import { readBoundedBody } from './http.js'

function describe(error) {
  const message = typeof error?.message === 'string' ? error.message : ''
  return message === '' ? '' : `: ${message.slice(0, 300)}`
}

/**
 * Compose the instruction sent to the model.
 * A template that names the source as `from {{source}} to {{target}}` drops that clause when
 * the source is unknown, so the built-in instruction reads "Translate the following text to
 * <target>." in that case; any other `{{source}}` becomes "the source language".
 * @param template - configured instruction, or `null`/an empty string for no system message.
 * @param request - source language (`auto` when detection is requested) and destination.
 * @returns the system text, or `''` when the request carries no system message.
 */
export function systemPromptFor(template, request) {
  if (template === null || template === undefined || template === '') return ''
  const target = request.targetLanguage
  const source = request.sourceLanguage
  let text = template
  if (source === 'auto') text = text.split('from {{source}} to {{target}}').join('to {{target}}')
  text = text.split('{{source}}').join(source === 'auto' ? 'the source language' : source)
  return text.split('{{target}}').join(target)
}

function chatEndpoint(provider) {
  return `${provider.baseUrl}/chat/completions`
}

function modelsEndpoint(provider) {
  return `${provider.baseUrl}/models`
}

function requestHeaders(provider, extra = {}) {
  const headers = { accept: 'application/json', ...provider.headers, ...extra }
  const authorized = Object.keys(headers).some(name => name.toLowerCase() === 'authorization')
  if (provider.apiKey !== '' && !authorized) headers.authorization = `Bearer ${provider.apiKey}`
  return headers
}

function contentOf(parsed) {
  const content = parsed?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(part => part?.type === 'text').map(part => String(part.text ?? '')).join('')
}

/**
 * Translate one fragment with an OpenAI-compatible chat completion on a plugin-owned endpoint.
 * The request carries only the configured instruction and the fragment; no Agent history or tools.
 * An instruction of `null` sends the fragment alone, with no system message.
 * @param provider - normalized custom provider entry.
 * @param config - configured model and optional request controls.
 * @param request - text, source language and destination language.
 * @param limits - request deadline and response-byte ceiling.
 * @param signal - caller cancellation.
 * @returns the endpoint's translated text, or `''` for empty input.
 * @throws {TranslationFailure} typed failures; the submitted text is never included.
 */
export async function translateWithCustomLlm(provider, config, request, limits, signal) {
  if (request.text === '') return ''
  const { signal: bounded, dispose } = withDeadline(signal, limits.timeoutMs)
  try {
    const system = systemPromptFor(config.systemPrompt, request)
    const payload = {
      model: config.model,
      messages: [
        ...(system === '' ? [] : [{ role: 'system', content: system }]),
        { role: 'user', content: request.text },
      ],
      stream: false,
    }
    if (config.maxTokens > 0) payload.max_tokens = config.maxTokens
    if (typeof config.temperature === 'number') payload.temperature = config.temperature
    let response
    try {
      response = await fetch(chatEndpoint(provider), {
        method: 'POST',
        headers: requestHeaders(provider, { 'content-type': 'application/json' }),
        body: JSON.stringify(payload),
        redirect: 'error',
        credentials: 'omit',
        signal: bounded,
      })
    } catch (error) {
      bounded.throwIfAborted()
      throw new TranslationFailure('TRANSLATION_REQUEST_FAILED', `custom provider request failed${describe(error)}`)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new TranslationFailure('TRANSLATION_HTTP_ERROR', `custom provider failed (HTTP ${response.status})`)
    }
    const body = await readBoundedBody(response, limits.maxResponseBytes, 'custom provider')
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch {
      throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'custom provider returned invalid JSON')
    }
    const text = contentOf(parsed).trim()
    if (text === '') throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'custom provider returned no translation')
    return text
  } catch (error) {
    const expired = timeoutOf(bounded)
    if (expired !== undefined && signal?.reason !== bounded.reason) {
      throw new TranslationFailure('TRANSLATION_TIMEOUT', `custom provider timed out after ${expired}ms`)
    }
    if (error instanceof TranslationFailure) throw error
    bounded.throwIfAborted()
    throw new TranslationFailure('TRANSLATION_REQUEST_FAILED', `custom provider request failed${describe(error)}`)
  } finally {
    dispose()
  }
}

/**
 * List the model ids a plugin-owned endpoint reports at `GET {baseUrl}/models`.
 * @param provider - normalized custom provider entry.
 * @param limits - request deadline and response-byte ceiling.
 * @param signal - caller cancellation.
 * @returns sorted unique model ids; an endpoint may report none.
 * @throws {TranslationFailure} typed failures for an unreachable, failing, or malformed endpoint.
 */
export async function listCustomModels(provider, limits, signal) {
  const { signal: bounded, dispose } = withDeadline(signal, limits.timeoutMs)
  try {
    let response
    try {
      response = await fetch(modelsEndpoint(provider), {
        method: 'GET',
        headers: requestHeaders(provider),
        redirect: 'error',
        credentials: 'omit',
        signal: bounded,
      })
    } catch (error) {
      bounded.throwIfAborted()
      throw new TranslationFailure('TRANSLATION_REQUEST_FAILED', `model list request failed${describe(error)}`)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new TranslationFailure('TRANSLATION_HTTP_ERROR', `model list failed (HTTP ${response.status})`)
    }
    const body = await readBoundedBody(response, limits.maxResponseBytes, 'model list')
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch {
      throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'model list returned invalid JSON')
    }
    if (!Array.isArray(parsed?.data)) throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'model list returned no data array')
    const ids = new Set()
    for (const item of parsed.data) {
      if (typeof item?.id === 'string' && item.id !== '') ids.add(item.id)
    }
    return [...ids].sort()
  } catch (error) {
    const expired = timeoutOf(bounded)
    if (expired !== undefined && signal?.reason !== bounded.reason) {
      throw new TranslationFailure('TRANSLATION_TIMEOUT', `model list timed out after ${expired}ms`)
    }
    if (error instanceof TranslationFailure) throw error
    bounded.throwIfAborted()
    throw new TranslationFailure('TRANSLATION_REQUEST_FAILED', `model list request failed${describe(error)}`)
  } finally {
    dispose()
  }
}

/**
 * Translate one fragment with a one-shot, text-only model request.
 * @param ctx - Host context carrying the model runtime.
 * @param config - configured provider, model, and optional request controls.
 * @param request - text, source language and destination language.
 * @param limits - request deadline and response-byte ceiling.
 * @param signal - caller cancellation.
 * @returns the model's translated text, or `''` for empty input.
 * @throws {TranslationFailure} typed failures; the submitted text is never included.
 */
export async function translateWithLlm(ctx, config, request, limits, signal) {
  if (request.text === '') return ''
  const llm = ctx.get('llm')
  if (llm === undefined) throw new TranslationFailure('TRANSLATION_UNAVAILABLE', 'no model provider runtime is available')
  const { signal: bounded, dispose } = withDeadline(signal, limits.timeoutMs)
  try {
    const callConfig = { provider: config.provider, model: config.model }
    if (config.reasoningEffort !== '') callConfig.reasoningEffort = config.reasoningEffort
    if (config.maxTokens > 0) callConfig.maxTokens = config.maxTokens
    if (typeof config.temperature === 'number') callConfig.temperature = config.temperature
    let prepared
    try {
      prepared = await llm.prepareCall(callConfig, bounded)
    } catch (error) {
      bounded.throwIfAborted()
      throw new TranslationFailure('TRANSLATION_UNAVAILABLE', `model translation could not be prepared${describe(error)}`)
    }
    bounded.throwIfAborted()
    const system = systemPromptFor(config.systemPrompt, request)
    const options = {
      ...prepared.config,
      ...(system === '' ? {} : { system }),
      messages: [{ role: 'user', content: [{ type: 'text', text: request.text }] }],
      signal: bounded,
    }
    const blocks = new Map()
    let terminal
    try {
      for await (const chunk of prepared.stream(options)) {
        bounded.throwIfAborted()
        if (chunk.type === 'reasoning-delta' || chunk.type === 'tool-call-delta'
          || (chunk.type === 'block-start' && chunk.blockType !== 'text')) {
          throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'model translation returned non-text output')
        }
        if (chunk.type === 'text-delta') blocks.set(chunk.index, (blocks.get(chunk.index) ?? '') + chunk.text)
        if (chunk.type === 'block-end') {
          if (chunk.block.type !== 'text') throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'model translation returned non-text output')
          blocks.set(chunk.index, chunk.block.text)
        }
        if (chunk.type === 'finish') terminal = chunk.reason
        if (Buffer.byteLength([...blocks.values()].join(''), 'utf8') > limits.maxResponseBytes) {
          throw new TranslationFailure('TRANSLATION_RESPONSE_LIMIT', 'model translation exceeds the configured response limit')
        }
      }
    } catch (error) {
      bounded.throwIfAborted()
      if (error instanceof TranslationFailure) throw error
      throw new TranslationFailure('TRANSLATION_REQUEST_FAILED', `model translation request failed${describe(error)}`)
    }
    bounded.throwIfAborted()
    if (terminal?.kind === 'error') throw new TranslationFailure('TRANSLATION_REQUEST_FAILED', 'model translation reported an error')
    if (terminal?.kind !== 'stop') throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'model translation did not finish normally')
    const text = [...blocks.values()].join('').trim()
    if (text === '') throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'model translation returned empty output')
    return text
  } catch (error) {
    const expired = timeoutOf(bounded)
    if (expired !== undefined && signal?.reason !== bounded.reason) {
      throw new TranslationFailure('TRANSLATION_TIMEOUT', `model translation timed out after ${expired}ms`)
    }
    if (error instanceof TranslationFailure) throw error
    bounded.throwIfAborted()
    throw new TranslationFailure('TRANSLATION_REQUEST_FAILED', `model translation failed${describe(error)}`)
  } finally {
    dispose()
  }
}
