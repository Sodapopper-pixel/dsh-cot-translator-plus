/** Generic HTTP translation-site adapter: templated requests and path-based response extraction. */
import { TranslationFailure, timeoutOf, withDeadline } from './errors.js'
import { siteLanguage } from './config.js'
import { readBoundedBody } from './http.js'

const PLACEHOLDER = /\{\{\s*(text|source|target)\s*(?:\|\s*(url|json)\s*)?\}\}/g

/**
 * Substitute `{{text}}`, `{{source}}` and `{{target}}` placeholders.
 * `|url` percent-encodes the value and `|json` renders a complete JSON string literal.
 * @param template - endpoint, body, or header value template.
 * @param values - resolved request values.
 * @returns the template with every placeholder replaced.
 */
export function expandTemplate(template, values) {
  return template.replace(PLACEHOLDER, (_match, name, filter) => {
    const value = values[name] ?? ''
    if (filter === 'url') return encodeURIComponent(value)
    if (filter === 'json') return JSON.stringify(value)
    return value
  })
}

/**
 * Read a dot-separated path such as `0.translations.0.text`.
 * @param payload - parsed response value.
 * @param path - dot-separated object keys and array indices.
 * @returns the value at that path, or `undefined` when any segment is missing.
 */
export function valueAt(payload, path) {
  let current = payload
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    const index = /^(?:0|[1-9]\d*)$/.test(segment) ? Number(segment) : segment
    current = current[index]
  }
  return current
}

/**
 * Build the outbound request for one site.
 * @param site - normalized site definition.
 * @param request - text and languages.
 * @returns the URL, method, headers and optional body.
 */
export function buildRequest(site, request) {
  const values = {
    text: request.text,
    source: siteLanguage(site, request.sourceLanguage ?? 'auto'),
    target: siteLanguage(site, request.targetLanguage),
  }
  const url = new URL(expandTemplate(site.endpoint, values))
  const headers = { accept: 'application/json, text/plain;q=0.9', ...site.headers }
  if (site.contentType !== undefined) headers['content-type'] = site.contentType
  const body = site.body === undefined ? undefined : expandTemplate(site.body, values)
  return { url, method: site.method, headers, body }
}

/**
 * Extract translated text from a parsed response.
 * @param payload - parsed JSON value, or the response text for `responseType: text`.
 * @param site - normalized site definition.
 * @returns the first non-empty string among `responsePaths`, or the joined segments of `responseJoin`.
 * @throws {TranslationFailure} `TRANSLATION_INVALID_RESPONSE` when no declared location holds text.
 */
export function extractText(payload, site) {
  if (site.responseType === 'text') {
    if (typeof payload !== 'string' || payload.trim() === '') throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'site returned an empty response')
    return payload
  }
  for (const path of site.responsePaths ?? []) {
    const value = valueAt(payload, path)
    if (typeof value === 'string' && value !== '') return value
  }
  if (site.responseJoin !== undefined) {
    const segments = valueAt(payload, site.responseJoin.path)
    if (!Array.isArray(segments)) throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'site returned an invalid response')
    const text = segments.map((segment) => valueAt(segment, String(site.responseJoin.index))).filter((part) => typeof part === 'string').join('')
    if (text !== '') return text
  }
  throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'site returned an invalid response')
}

/**
 * Translate one fragment through its configured site.
 * @param site - normalized site definition.
 * @param request - text, source language and destination language.
 * @param limits - request deadline and response-byte ceiling.
 * @param signal - caller cancellation.
 * @returns the site's translated text, or `''` for empty input.
 * @throws {TranslationFailure} typed failures that never include the submitted text.
 */
export async function translateWithSite(site, request, limits, signal) {
  const { signal: bounded, dispose } = withDeadline(signal, limits.timeoutMs)
  try {
    if (request.text === '') return ''
    const { url, method, headers, body } = buildRequest(site, request)
    let response
    try {
      response = await fetch(url, { method, headers, body, redirect: 'error', credentials: 'omit', signal: bounded })
    } catch (error) {
      const expired = timeoutOf(bounded) ?? (typeof error?.timeoutMs === 'number' ? error.timeoutMs : undefined)
      if (expired !== undefined && signal?.reason !== bounded.reason) {
        throw new TranslationFailure('TRANSLATION_TIMEOUT', `site translation timed out after ${expired}ms`)
      }
      bounded.throwIfAborted()
      throw new TranslationFailure('TRANSLATION_REQUEST_FAILED', 'site translation request failed')
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new TranslationFailure('TRANSLATION_HTTP_ERROR', `site translation failed (HTTP ${response.status})`)
    }
    const text = await readBoundedBody(response, limits.maxResponseBytes, 'site')
    bounded.throwIfAborted()
    if (site.responseType === 'text') return extractText(text, site)
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', 'site returned invalid JSON')
    }
    return extractText(payload, site)
  } finally {
    dispose()
  }
}
