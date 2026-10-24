/** Provider-independent translation cache persisted beside the plugin settings. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'

const VERSION = 1

/**
 * Ceiling on retained translated text. The entry count alone cannot bound the mirror: one
 * long fragment can be megabytes, and every change rewrites the whole JSON file.
 */
export const MAX_CACHE_BYTES = 32 * 1024 * 1024

/**
 * Identify one reusable translation.
 * @param parts - provider route, semantic recipe, both languages, and the exact source text.
 * @returns a stable SHA-256 key.
 */
export function cacheKey(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

/** Bounded in-memory cache with a debounced JSON file mirror; failures never break translation. */
export class TranslationCache {
  #entries = new Map()
  #bytes = 0
  #saving
  #timer

  /**
   * @param file - absolute JSON file path.
   * @param maxEntries - maximum retained entries; `0` disables persistence and lookups.
   * @param onError - receives a sanitized warning when the mirror cannot be read or written.
   * @param maxBytes - ceiling on retained UTF-8 text across all entries.
   */
  constructor(file, maxEntries, onError = () => {}, maxBytes = MAX_CACHE_BYTES) {
    this.file = file
    this.maxEntries = maxEntries
    this.maxBytes = maxBytes
    this.onError = onError
  }

  /** Read the mirror into memory; a missing or invalid file starts empty. */
  async load() {
    if (this.maxEntries === 0) return
    let raw
    try {
      raw = await readFile(this.file, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') this.onError(`could not read the translation cache: ${error?.message ?? error}`)
      return
    }
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.version !== VERSION || !Array.isArray(parsed.entries)) return
      for (const entry of parsed.entries) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string') {
          this.#entries.set(entry[0], entry[1])
          this.#bytes += Buffer.byteLength(entry[1], 'utf8')
        }
      }
      this.#trim()
    } catch (error) {
      this.onError(`ignored an invalid translation cache: ${error?.message ?? error}`)
    }
  }

  /**
   * @param key - key from `cacheKey()`.
   * @returns the saved translation, if any.
   */
  get(key) {
    if (this.maxEntries === 0) return undefined
    const value = this.#entries.get(key)
    if (value === undefined) return undefined
    this.#entries.delete(key)
    this.#entries.set(key, value)
    return value
  }

  /**
   * Retain one translation and schedule a mirror write.
   * @param key - key from `cacheKey()`.
   * @param text - translated text.
   */
  set(key, text) {
    if (this.maxEntries === 0 || text === '') return
    const bytes = Buffer.byteLength(text, 'utf8')
    if (bytes > this.maxBytes) return
    const previous = this.#entries.get(key)
    if (previous !== undefined) {
      this.#entries.delete(key)
      this.#bytes -= Buffer.byteLength(previous, 'utf8')
    }
    this.#entries.set(key, text)
    this.#bytes += bytes
    this.#trim()
    this.#schedule()
  }

  /** Drop every entry and rewrite the mirror. */
  async clear() {
    this.#entries.clear()
    this.#bytes = 0
    this.#schedule()
    await this.flush()
  }

  /** Write any pending change and wait for an in-flight write. */
  async flush() {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer)
      this.#timer = undefined
      await this.#write()
    }
    await this.#saving
  }

  #trim() {
    while (this.#entries.size > this.maxEntries || this.#bytes > this.maxBytes) {
      const oldest = this.#entries.keys().next().value
      this.#bytes -= Buffer.byteLength(this.#entries.get(oldest), 'utf8')
      this.#entries.delete(oldest)
    }
  }

  #schedule() {
    if (this.#timer !== undefined) return
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      void this.#write()
    }, 500)
    this.#timer.unref?.()
  }

  async #write() {
    if (this.maxEntries === 0) return
    const data = JSON.stringify({ version: VERSION, entries: [...this.#entries.entries()] })
    const run = (async () => {
      const temporary = `${this.file}.${Date.now()}.tmp`
      try {
        await mkdir(dirname(this.file), { recursive: true })
        await writeFile(temporary, data, 'utf8')
        await rename(temporary, this.file)
      } catch (error) {
        this.onError(`could not write the translation cache: ${error?.message ?? error}`)
      }
    })()
    this.#saving = run
    try {
      await run
    } finally {
      if (this.#saving === run) this.#saving = undefined
    }
  }
}
