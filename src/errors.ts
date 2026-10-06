export interface DrumreelErrorOptions {
  status?: number
  code?: string
  cause?: unknown
  /** Server-requested delay (from Retry-After) before retrying, in ms. */
  retryAfterMs?: number
  /** True when the failure is transient and the request may be retried. */
  retryable?: boolean
}

export class DrumreelError extends Error {
  readonly status?: number
  readonly code?: string
  readonly retryAfterMs?: number
  readonly retryable: boolean

  constructor(message: string, opts: DrumreelErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'DrumreelError'
    this.status = opts.status
    this.code = opts.code
    this.retryAfterMs = opts.retryAfterMs
    this.retryable = opts.retryable ?? false
  }
}

/** 401 from the API, or no API key configured locally (then `status` is undefined). */
export class AuthError extends DrumreelError {
  constructor(message?: string, opts: { code?: string } = {}) {
    const local = message === undefined
    super(message ?? 'Not authenticated. Run `drumreel login` or set DRUMREEL_API_KEY.', {
      status: local ? undefined : 401,
      code: opts.code ?? (local ? 'missing_api_key' : 'unauthorized'),
    })
    this.name = 'AuthError'
  }
}

/** 403 — key is valid but not allowed to perform this action. */
export class ForbiddenError extends DrumreelError {
  constructor(message = 'Forbidden', opts: { code?: string } = {}) {
    super(message, { status: 403, code: opts.code ?? 'forbidden' })
    this.name = 'ForbiddenError'
  }
}

/** Local configuration / usage problem (bad flag, missing or unsafe API base). */
export class ConfigError extends DrumreelError {
  constructor(message: string, code = 'config') {
    super(message, { code })
    this.name = 'ConfigError'
  }
}

/** A per-request timeout or overall wait deadline elapsed. */
export class TimeoutError extends DrumreelError {
  readonly lastJob?: unknown

  constructor(message: string, opts: { lastJob?: unknown; retryable?: boolean; cause?: unknown } = {}) {
    super(message, { code: 'timeout', retryable: opts.retryable, cause: opts.cause })
    this.name = 'TimeoutError'
    this.lastJob = opts.lastJob
  }
}

/** The caller's AbortSignal fired (e.g. Ctrl-C or MCP cancellation). */
export class AbortedError extends DrumreelError {
  constructor(message = 'Aborted') {
    super(message, { code: 'aborted' })
    this.name = 'AbortedError'
  }
}
