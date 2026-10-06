import { AbortedError, DrumreelError } from './errors.js'

export interface BackoffOptions {
  /** First delay in ms. */
  baseMs: number
  /** Upper bound for a single delay in ms. */
  maxMs: number
  /** Growth factor per attempt (default 2). */
  factor?: number
  /** Random source in [0,1) — injectable for tests. */
  random?: () => number
}

/**
 * Exponential backoff with "equal jitter": half the capped exponential delay
 * is fixed, the other half is random. `attempt` is 0-based.
 */
export function backoffDelay(attempt: number, opts: BackoffOptions): number {
  const factor = opts.factor ?? 2
  const random = opts.random ?? Math.random
  const exp = Math.min(opts.maxMs, opts.baseMs * factor ** attempt)
  return Math.round(exp / 2 + random() * (exp / 2))
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into ms. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000)
  const at = Date.parse(trimmed)
  if (Number.isNaN(at)) return undefined
  return Math.max(0, at - now)
}

/** Status codes that are safe to retry for idempotent requests. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

export function isRetryable(err: unknown): boolean {
  return err instanceof DrumreelError && err.retryable
}

/** Delay before the next retry: server Retry-After wins over computed backoff. */
export function retryDelay(err: unknown, attempt: number, opts: BackoffOptions): number {
  if (err instanceof DrumreelError && err.retryAfterMs !== undefined) {
    return Math.max(err.retryAfterMs, 0)
  }
  return backoffDelay(attempt, opts)
}

/** Sleep that rejects with AbortedError when `signal` fires; always cleans up its listener. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal))
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(abortReason(signal))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Turn an aborted signal's reason into a DrumreelError. */
export function abortReason(signal?: AbortSignal): DrumreelError {
  const reason: unknown = signal?.reason
  if (reason instanceof DrumreelError) return reason
  return new AbortedError()
}
