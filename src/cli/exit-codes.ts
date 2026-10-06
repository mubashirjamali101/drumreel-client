import {
  AbortedError,
  AuthError,
  ConfigError,
  DrumreelError,
  ForbiddenError,
  TimeoutError,
} from '../errors.js'

/** Process exit codes. Documented in README.md and SKILL.md — keep in sync. */
export const EXIT = {
  OK: 0,
  /** Job finished with status `error`, or an unexpected failure. */
  FAILURE: 1,
  /** Bad flags/arguments or missing/unsafe configuration (e.g. no API base). */
  USAGE: 2,
  /** 401 or no API key. */
  AUTH: 3,
  /** 403 — key not allowed to do this. */
  FORBIDDEN: 4,
  /** 404 — unknown job, or video not ready yet. */
  NOT_FOUND: 5,
  /** Any other 4xx from the API (validation, conflict, …). */
  API_ERROR: 6,
  /** Per-request timeout or `run --timeout` deadline exceeded. */
  TIMEOUT: 7,
  /** Transient: request timeout (408), rate limited (429), 5xx, or network failure after retries. */
  UNAVAILABLE: 8,
  /** Interrupted (Ctrl-C). */
  ABORTED: 130,
} as const

export function exitCodeFor(err: unknown): number {
  if (err instanceof ConfigError) return EXIT.USAGE
  if (err instanceof AuthError) return EXIT.AUTH
  if (err instanceof ForbiddenError) return EXIT.FORBIDDEN
  if (err instanceof AbortedError) return EXIT.ABORTED
  if (err instanceof TimeoutError) return EXIT.TIMEOUT
  if (err instanceof DrumreelError) {
    const s = err.status
    if (s === 404) return EXIT.NOT_FOUND
    if (s === 408 || s === 429 || (s !== undefined && s >= 500) || err.code === 'network') return EXIT.UNAVAILABLE
    if (s !== undefined && s >= 400) return EXIT.API_ERROR
  }
  return EXIT.FAILURE
}

/** One-line error for stderr: message plus HTTP status / server code when known. */
export function formatError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const meta: string[] = []
  if (err instanceof DrumreelError) {
    if (err.status !== undefined) meta.push(`HTTP ${err.status}`)
    if (err.code) meta.push(`code: ${err.code}`)
    if (err.retryAfterMs !== undefined) meta.push(`retry after ${Math.ceil(err.retryAfterMs / 1000)}s`)
  }
  return `drumreel: ${message}${meta.length ? ` (${meta.join(', ')})` : ''}`
}

/** Structured error for --json output. */
export function errorJson(err: unknown): { message: string; status?: number; code?: string } {
  const message = err instanceof Error ? err.message : String(err)
  if (!(err instanceof DrumreelError)) return { message }
  return {
    message,
    ...(err.status !== undefined ? { status: err.status } : {}),
    ...(err.code ? { code: err.code } : {}),
  }
}
