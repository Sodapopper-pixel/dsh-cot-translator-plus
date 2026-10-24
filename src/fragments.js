/** Paragraph fragmentation and the sequential translation controller for one expanded disclosure. */

/**
 * Split reasoning into completed paragraphs and request-sized fragments.
 * @param {string} text - original reasoning, including its exact whitespace.
 * @param {boolean} running - whether the final paragraph may still grow.
 * @param {number} maxTextChars - configured UTF-16 request limit.
 * @returns {Array<{text: string, suffix: string, complete: boolean}>} whitespace-preserving fragments.
 */
export function reasoningFragments(text, running, maxTextChars) {
  const result = []
  const separator = /\r?\n(?:[\t ]*\r?\n)+/g
  let start = 0
  for (;;) {
    const match = separator.exec(text)
    let remaining = text.slice(start, match?.index ?? text.length)
    while (remaining.length > maxTextChars) {
      let cut = maxTextChars
      if (/[\uD800-\uDBFF]/.test(remaining.charAt(cut - 1))) cut -= 1
      const whitespace = remaining.slice(0, cut).search(/\s+\S*$/)
      if (whitespace > 0) cut = whitespace
      const source = remaining.slice(0, cut)
      remaining = remaining.slice(cut)
      const suffix = remaining.match(/^\s+/)?.[0] ?? ''
      remaining = remaining.slice(suffix.length)
      result.push({ text: source, suffix, complete: true })
    }
    result.push({ text: remaining, suffix: match?.[0] ?? '', complete: match !== null || !running })
    if (match === null) return result
    start = match.index + match[0].length
  }
}

/** One disclosure owns cancellation, request ordering, and stale-result exclusion. */
export class ReasoningTranslation {
  #controller = new AbortController()
  #cache = new Map()
  #stale = new Set()
  #fragments = []
  #pending = false
  #failed = false
  #epoch = 0

  /**
   * @param {{provider: string, targetLanguage: string}} selection - explicit provider and destination language.
   * @param {number} maxTextChars - configured request limit.
   * @param {(request: {text: string, provider: string, targetLanguage: string, refresh?: true}, signal: AbortSignal) => Promise<string>} translate - one cancellation-aware request; `refresh` asks the Host to translate again instead of reusing its cache.
   * @param {(state: {text: string, pending: boolean, failed: boolean}) => void} publish - component-local display update.
   */
  constructor(selection, maxTextChars, translate, publish) {
    this.selection = selection
    this.maxTextChars = maxTextChars
    this.translate = translate
    this.publish = publish
  }

  /**
   * Adopt the current source and enqueue newly completed fragments.
   * @param {string} text - current original reasoning.
   * @param {boolean} running - whether its tail is still streaming.
   */
  update(text, running) {
    this.#fragments = reasoningFragments(text, running, this.maxTextChars)
    this.#emit()
    void this.#run()
  }

  /** Retry untranslated fragments after a failed request. */
  retry() {
    this.#failed = false
    void this.#run()
  }

  /**
   * Translate every completed fragment again, bypassing this disclosure's cache and the Host
   * cache. The previous translations stay visible until each replacement arrives, and a request
   * already in flight is discarded rather than published.
   */
  regenerate() {
    if (this.disposed) return
    this.#epoch += 1
    this.#failed = false
    for (const fragment of this.#fragments) {
      if (fragment.complete && fragment.text.trim() !== '') this.#stale.add(fragment.text)
    }
    void this.#run()
  }

  /** Abort the disclosure's requests and suppress later publications. */
  dispose() {
    this.#controller.abort()
  }

  get disposed() {
    return this.#controller.signal.aborted
  }

  #emit() {
    if (this.disposed) return
    const text = this.#fragments.map((fragment) => {
      const content = fragment.complete ? this.#cache.get(fragment.text) ?? fragment.text : fragment.text
      return content + fragment.suffix
    }).join('')
    this.publish({ text, pending: this.#pending, failed: this.#failed })
  }

  #next() {
    const wanted = fragment => fragment.complete && fragment.text.trim() !== ''
    return this.#fragments.find(fragment => wanted(fragment) && this.#stale.has(fragment.text))
      ?? this.#fragments.find(fragment => wanted(fragment) && !this.#cache.has(fragment.text))
  }

  async #run() {
    if (this.#pending || this.#failed || this.disposed) return
    let next = this.#next()
    if (next === undefined) return
    const epoch = this.#epoch
    this.#pending = true
    this.#emit()
    try {
      while (next !== undefined) {
        const refresh = this.#stale.has(next.text)
        const translated = await this.translate(
          { ...this.selection, text: next.text, ...(refresh ? { refresh: true } : {}) },
          this.#controller.signal,
        )
        if (this.disposed || epoch !== this.#epoch) return
        this.#cache.set(next.text, translated)
        this.#stale.delete(next.text)
        this.#emit()
        next = this.#next()
      }
    } catch {
      if (!this.disposed && epoch === this.#epoch) this.#failed = true
    } finally {
      this.#pending = false
      this.#emit()
      if (!this.disposed && epoch !== this.#epoch) void this.#run()
    }
  }
}
