import { z } from 'zod'
import { DrumreelError } from './errors.js'
import type { Job, JobWarning, ListJobsResponse } from './types.js'

/**
 * Runtime schemas for v1 job responses, mirroring drumreel-saas `docs/public-api-contract.md`.
 * Deliberately lenient so older/newer servers keep working: unknown fields pass through,
 * `status` is any string, and `warnings` defaults to [] when absent or malformed.
 */
const warningsSchema = z
  .unknown()
  .transform((v): string[] => (Array.isArray(v) ? v.filter((w): w is string => typeof w === 'string') : []))

export const JobSchema = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
    phase: z.string().optional(),
    video_ready: z.boolean().optional().default(false),
    warnings: warningsSchema,
  })
  .passthrough()

export const ListJobsSchema = z
  .object({
    items: z.array(JobSchema),
    next_cursor: z.string().nullish(),
  })
  .passthrough()

function invalid(what: string, err: z.ZodError): DrumreelError {
  const detail = err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
  return new DrumreelError(`Invalid ${what} from API: ${detail}`, { code: 'invalid_response' })
}

export function parseJob(data: unknown): Job {
  const r = JobSchema.safeParse(data)
  if (!r.success) throw invalid('job', r.error)
  return r.data as unknown as Job
}

export function parseListJobs(data: unknown): ListJobsResponse {
  const r = ListJobsSchema.safeParse(data)
  if (!r.success) throw invalid('job list', r.error)
  return r.data as unknown as ListJobsResponse
}

/** Known warning codes (contract). Unknown codes are informational: display the string as-is. */
export const KNOWN_WARNING_CODES = ['voiceover_missing_key', 'voiceover_skipped', 'voiceover_failed'] as const

/** Split "<code>: <message>" on the first ": ". Strings without a separator get code "unknown". */
export function parseWarning(raw: string): JobWarning {
  const i = raw.indexOf(': ')
  if (i <= 0) return { code: 'unknown', message: raw }
  return { code: raw.slice(0, i), message: raw.slice(i + 2) }
}
