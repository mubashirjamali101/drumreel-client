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
  created_at: string
  updated_at: string
}

export interface ListJobsResponse {
  items: Job[]
  next_cursor?: string
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
  /** Base like https://api.drumreel.com — client appends /api/v1 */
  apiBase?: string
  apiKey?: string
  /** Injected fetch for tests */
  fetch?: typeof globalThis.fetch
}
