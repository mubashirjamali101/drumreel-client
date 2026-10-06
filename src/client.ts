import { AuthError, DrumreelError } from './errors.js'
import type {
  ApiErrorBody,
  ClientOptions,
  CreateJobRequest,
  CreateJobResponse,
  Job,
  ListJobsResponse,
  RerunMode,
  VideoResponse,
} from './types.js'

function joinBase(apiBase: string): string {
  const base = apiBase.replace(/\/+$/, '')
  if (base.endsWith('/api/v1')) return base
  return `${base}/api/v1`
}

export class DrumreelClient {
  readonly apiBase: string
  readonly apiKey: string
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly root: string

  constructor(opts: ClientOptions & { apiKey: string; apiBase: string }) {
    this.apiKey = opts.apiKey
    this.apiBase = opts.apiBase.replace(/\/+$/, '')
    this.root = joinBase(this.apiBase)
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis)
  }

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'X-Api-Key': this.apiKey,
      Accept: 'application/json',
    }
    if (json) h['Content-Type'] = 'application/json'
    return h
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.root}${path}`
    let res: Response
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: this.headers(body !== undefined),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (err) {
      throw new DrumreelError(`Network error calling ${method} ${path}: ${(err as Error).message}`, {
        cause: err,
      })
    }

    const text = await res.text()
    let data: unknown = undefined
    if (text.length > 0) {
      try {
        data = JSON.parse(text)
      } catch {
        throw new DrumreelError(`Invalid JSON from ${method} ${path} (${res.status})`, {
          status: res.status,
        })
      }
    }

    if (!res.ok) {
      const errBody = data as ApiErrorBody | undefined
      const code = errBody?.error?.code
      const message =
        errBody?.error?.message ??
        (typeof data === 'object' && data && 'message' in data
          ? String((data as { message: unknown }).message)
          : `HTTP ${res.status} from ${method} ${path}`)
      if (res.status === 401 || res.status === 403) {
        throw new AuthError(message)
      }
      throw new DrumreelError(message, { status: res.status, code })
    }

    return data as T
  }

  createJob(req: CreateJobRequest): Promise<CreateJobResponse> {
    return this.request<CreateJobResponse>('POST', '/jobs', req)
  }

  getJob(id: string): Promise<Job> {
    return this.request<Job>('GET', `/jobs/${encodeURIComponent(id)}`)
  }

  listJobs(opts?: { cursor?: string; limit?: number }): Promise<ListJobsResponse> {
    const q = new URLSearchParams()
    if (opts?.cursor) q.set('cursor', opts.cursor)
    if (opts?.limit !== undefined) q.set('limit', String(opts.limit))
    const qs = q.toString()
    return this.request<ListJobsResponse>('GET', `/jobs${qs ? `?${qs}` : ''}`)
  }

  getVideo(id: string): Promise<VideoResponse> {
    return this.request<VideoResponse>('GET', `/jobs/${encodeURIComponent(id)}/video`)
  }

  rerunJob(id: string, mode: RerunMode = 'full'): Promise<CreateJobResponse> {
    return this.request<CreateJobResponse>('POST', `/jobs/${encodeURIComponent(id)}/rerun`, {
      mode,
    })
  }
}
