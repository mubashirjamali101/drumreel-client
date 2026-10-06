export class DrumreelError extends Error {
  readonly status?: number
  readonly code?: string

  constructor(message: string, opts?: { status?: number; code?: string; cause?: unknown }) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'DrumreelError'
    this.status = opts?.status
    this.code = opts?.code
  }
}

export class AuthError extends DrumreelError {
  constructor(message = 'Not authenticated. Run `drumreel login` or set DRUMREEL_API_KEY.') {
    super(message, { status: 401, code: 'unauthorized' })
    this.name = 'AuthError'
  }
}
