import { normalizeApiBase } from './api-base.js'
import { AuthError, DrumreelError, ForbiddenError, TimeoutError } from './errors.js'
import { parseJob, parseListJobs } from './schema.js'
import { abortReason, isRetryable, isRetryableStatus, parseRetryAfter, retryDelay, sleep } from './retry.js'
import type {
  ClientOptions,
  CreateJobRequest,
  CreateJobResponse,
  Job,
  ListJobsResponse,
  RequestOptions,
  RerunMode,
  VideoResponse,
} from './types.js'

const DEFAULTS = {
  requestTimeoutMs: 30_000,
  retries: 3,
  retryBaseMs: 500,
  retryMaxMs: 8_000,
  maxRetryAfterMs: 60_000,
}

function joinBase(apiBase: string): string {
  return apiBase.endsWith('/api/v1') ? apiBase : `${apiBase}/api/v1`
}

export class DrumreelClient {
  readonly apiBase: string
  private readonly apiKey: string
  private readonly root: string
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly cfg: typeof DEFAULTS & { random?: () => number }

  constructor(opts: ClientOptions) {
    if (!opts.apiKey) throw new AuthError()
    this.apiKey = opts.apiKey
    this.apiBase = normalizeApiBase(opts.apiBase ?? '')
    this.root = joinBase(this.apiBase)
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis)
    this.cfg = {
      requestTimeoutMs: opts.requestTimeoutMs ?? DEFAULTS.requestTimeoutMs,
      retries: opts.retries ?? DEFAULTS.retries,
      retryBaseMs: opts.retryBaseMs ?? DEFAULTS.retryBaseMs,
      retryMaxMs: opts.retryMaxMs ?? DEFAULTS.retryMaxMs,
      maxRetryAfterMs: opts.maxRetryAfterMs ?? DEFAULTS.maxRetryAfterMs,
      random: opts.random,
    }
  }

  createJob(req: CreateJobRequest, opts?: RequestOptions): Promise<CreateJobResponse> {
    return this.request<CreateJobResponse>('POST', '/jobs', req, opts)
  }

  getJob(id: string, opts?: RequestOptions): Promise<Job> {
    return this.request<unknown>('GET', `/jobs/${encodeURIComponent(id)}`, undefined, opts).then(parseJob)
  }

  listJobs(q?: { cursor?: string; limit?: number }, opts?: RequestOptions): Promise<ListJobsResponse> {
    const params = new URLSearchParams()
    if (q?.cursor) params.set('cursor', q.cursor)
    if (q?.limit !== undefined) params.set('limit', String(q.limit))
    const qs = params.toString()
    return this.request<unknown>('GET', `/jobs${qs ? `?${qs}` : ''}`, undefined, opts).then(parseListJobs)
  }

  /** Signed video URL. The API returns 404 until the job's video is ready. */
  getVideo(id: string, opts?: RequestOptions): Promise<VideoResponse> {
    return this.request<VideoResponse>('GET', `/jobs/${encodeURIComponent(id)}/video`, undefined, opts)
  }

  rerunJob(id: string, mode: RerunMode = 'full', opts?: RequestOptions): Promise<CreateJobResponse> {
    return this.request<CreateJobResponse>('POST', `/jobs/${encodeURIComponent(id)}/rerun`, { mode }, opts)
  }

  /**
   * Send a request with per-request timeout + bounded retries.
   * GETs retry on 408/429/5xx/network/timeout; POSTs retry only on 429 (never processed),
   * so a job is never created twice by the client.
   */
  private async request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    const retries = opts.retries ?? this.cfg.retries
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once<T>(method, path, body, opts.signal)
      } catch (err) {
        const allowed = method === 'GET' || (err instanceof DrumreelError && err.status === 429)
        if (attempt >= retries || !allowed || !isRetryable(err)) throw err
        const delay = retryDelay(err, attempt, {
          baseMs: this.cfg.retryBaseMs,
          maxMs: this.cfg.retryMaxMs,
          random: this.cfg.random,
        })
        if (delay > this.cfg.maxRetryAfterMs) throw err
        await sleep(delay, opts.signal)
      }
    }
  }

  private async once<T>(method: string, path: string, body: unknown, callerSignal?: AbortSignal): Promise<T> {
    if (callerSignal?.aborted) throw abortReason(callerSignal)
    const timeoutSignal = AbortSignal.timeout(this.cfg.requestTimeoutMs)
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    let res: Response
    let text: string
    try {
      res = await this.fetchImpl(`${this.root}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      })
      text = await res.text()
    } catch (err) {
      if (callerSignal?.aborted) throw abortReason(callerSignal)
      if (timeoutSignal.aborted) {
        throw new TimeoutError(`Request timed out after ${this.cfg.requestTimeoutMs}ms: ${method} ${path}`, {
          retryable: true,
          cause: err,
        })
      }
      throw new DrumreelError(`Network error calling ${method} ${path}: ${(err as Error).message}`, {
        code: 'network',
        retryable: true,
        cause: err,
      })
    }

    let data: unknown
    let parsed = true
    if (text.length > 0) {
      try {
        data = JSON.parse(text)
      } catch {
        parsed = false
      }
    }

    if (!res.ok) throw toApiError(res, data, method, path)
    if (!parsed) {
      throw new DrumreelError(`Invalid JSON from ${method} ${path} (${res.status})`, {
        status: res.status,
        code: 'invalid_response',
      })
    }
    return data as T
  }
}

/** Map a non-2xx response to a typed error, preserving status, server code and message. */
function toApiError(res: Response, data: unknown, method: string, path: string): DrumreelError {
  const obj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  const nested = typeof obj['error'] === 'object' && obj['error'] !== null ? (obj['error'] as Record<string, unknown>) : {}
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined)
  const code = str(nested['code']) ?? str(obj['code'])
  const message =
    str(nested['message']) ?? str(obj['message']) ?? str(obj['error']) ?? `HTTP ${res.status} from ${method} ${path}`

  if (res.status === 401) return new AuthError(message, { code })
  if (res.status === 403) return new ForbiddenError(message, { code })
  return new DrumreelError(message, {
    status: res.status,
    code,
    retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
    retryable: isRetryableStatus(res.status),
  })
}
