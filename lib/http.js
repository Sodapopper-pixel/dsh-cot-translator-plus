/** Bounded response-body reading shared by the site and custom-provider adapters. */
import { TranslationFailure } from './errors.js'

/**
 * Read a fetch response body, refusing bodies over the configured ceiling.
 * @param response - fetch result carrying a body stream.
 * @param maxBytes - ceiling measured on the encoded bytes.
 * @param subject - adapter name used in the failure message.
 * @returns the decoded UTF-8 body.
 * @throws {TranslationFailure} `TRANSLATION_INVALID_RESPONSE` for an absent body, `TRANSLATION_RESPONSE_LIMIT` when it is too large.
 */
export async function readBoundedBody(response, maxBytes, subject) {
  if (response.body === null) throw new TranslationFailure('TRANSLATION_INVALID_RESPONSE', `${subject} returned an empty body`)
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw new TranslationFailure('TRANSLATION_RESPONSE_LIMIT', `${subject} response exceeds ${maxBytes} bytes`)
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks).toString('utf8')
}
