/** Failures a translation route reports to the browser without exposing the submitted text. */

/** One failed translation attempt; `code` is stable for diagnostics and HTTP mapping. */
export class TranslationFailure extends Error {
  /**
   * @param code - stable machine code, for example `site-http`.
   * @param message - operator-facing reason that omits the submitted text.
   */
  constructor(code, message) {
    super(message)
    this.name = 'TranslationFailure'
    this.code = code
  }
}

/**
 * Read an abort reason as the published timeout it encodes, if any.
 * @param signal - the combined signal observed after abort.
 * @returns the timeout in milliseconds when a deadline aborted the request.
 */
export function timeoutOf(signal) {
  const reason = signal.reason
  return typeof reason === 'object' && reason !== null && typeof reason.timeoutMs === 'number'
    ? reason.timeoutMs
    : undefined
}

/**
 * Create a signal that aborts when `signal` does or after `timeoutMs`.
 * @param signal - caller cancellation.
 * @param timeoutMs - deadline for the whole request including its body.
 * @returns the combined signal plus a disposer that clears the timer.
 */
export function withDeadline(signal, timeoutMs) {
  const controller = new AbortController()
  const onAbort = () => { controller.abort(signal.reason) }
  if (signal?.aborted === true) {
    controller.abort(signal.reason)
  } else {
    signal?.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => {
    controller.abort(Object.assign(new Error(`translation timed out after ${timeoutMs}ms`), { timeoutMs }))
  }, timeoutMs)
  timer.unref?.()
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}
