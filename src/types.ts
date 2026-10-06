/** Job lifecycle status / phase (v1: phase === status). */
export type JobStatus =
  | 'queued'
  | 'exploring'
  | 'authoring'
  | 'validating'
  | 'recording'
  | 'uploading'
  | 'done'
  | 'error'

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set(['done', 'error'])

export type RerunMode = 'full' | 'script'

export interface CreateJobRequest {
  url: string
  prompt: string
  options?: {
    model?: string
    enable_voiceover?: boolean
  }
}

export interface CreateJobResponse {
  id: string
  status: JobStatus
}

export interface Job {
  id: string
  status: JobStatus
  phase: JobStatus
  error?: string | { code?: string; message?: string } | null
  share_url?: string | null
  video_ready: boolean
  progress?: number | string | null
  /**
   * Non-fatal issues, each "<code>: <message>" (e.g. "voiceover_missing_key: …").
   * Always present from current servers; the client defaults it to [] for older ones.
   * A job can be `done` and still have warnings.
   */
  warnings: string[]
  created_at: string
  updated_at: string
}

/** Known codes: voiceover_missing_key | voiceover_skipped | voiceover_failed. Unknown codes are informational. */
export type JobWarningCode = 'voiceover_missing_key' | 'voiceover_skipped' | 'voiceover_failed' | (string & {})

export interface JobWarning {
  code: JobWarningCode
  message: string
}

export interface ListJobsResponse {
  items: Job[]
  next_cursor?: string | null
}

export interface VideoResponse {
  url: string
  expires_at: string
}

export interface RerunRequest {
  mode: RerunMode
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

export interface CredentialsFile {
  api_key: string
  api_base?: string
}

export interface ClientOptions {
  /** API host, e.g. https://<your-drumreel-app-host> — the client appends /api/v1. Required. */
  apiBase: string
  /** dr_live_… / dr_test_… key, sent as `Authorization: Bearer <key>`. */
  apiKey: string
  /** Injected fetch for tests */
  fetch?: typeof globalThis.fetch
  /** Per-request timeout in ms (default 30000). */
  requestTimeoutMs?: number
  /** Max retries for transient failures (default 3). GETs retry 429/5xx/network; POSTs retry 429 only. */
  retries?: number
  /** First retry delay in ms (default 500). */
  retryBaseMs?: number
  /** Max computed retry delay in ms (default 8000). */
  retryMaxMs?: number
  /** Give up instead of sleeping when Retry-After asks for longer than this (default 60000). */
  maxRetryAfterMs?: number
  /** Random source for jitter — injectable for tests. */
  random?: () => number
}

/** Per-call options accepted by every client method. */
export interface RequestOptions {
  /** Caller cancellation; combined with the per-request timeout. */
  signal?: AbortSignal
  /** Override the client's retry count for this call (0 disables retries). */
  retries?: number
}
