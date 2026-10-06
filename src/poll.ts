import type { DrumreelClient } from './client.js'
import { TimeoutError } from './errors.js'
import { isRetryable, retryDelay, sleep } from './retry.js'
import { TERMINAL_STATUSES, type Job } from './types.js'

export interface PollOptions {
  /** First delay between polls in ms (default 2000). Reset whenever the status changes. */
  intervalMs?: number
  /** Cap for the growing poll delay while the status is unchanged (default 15000). */
  maxIntervalMs?: number
  /** Overall deadline in ms (default 30 min). Enforced by a timer, independent of responses. */
  timeoutMs?: number
  /** Cap for backoff after transient errors when no Retry-After is sent (default 60000). */
  maxErrorDelayMs?: number
  /** Stop after this many consecutive transient errors (default: keep retrying until the deadline). */
  maxConsecutiveErrors?: number
  /** Called after every successful poll. */
  onUpdate?: (job: Job) => void
  /** Called before sleeping after a transient (429/5xx/network/timeout) error. */
  onRetry?: (err: unknown, delayMs: number, consecutiveErrors: number) => void
  /** Caller cancellation (e.g. Ctrl-C, MCP request cancelled). */
  signal?: AbortSignal
  /** Random source for jitter — injectable for tests. */
  random?: () => number
}

export const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1000
const GROWTH = 1.5

/**
 * Poll GET /jobs/:id until the job is `done` or `error`.
 * Transient failures (429 honoring Retry-After, 5xx, network, request timeouts) are retried
 * with exponential backoff + jitter; non-transient ones (401/403/404/…) are thrown.
 * Throws TimeoutError (with `lastJob`) when the overall deadline passes.
 */
export async function waitForJob(client: DrumreelClient, id: string, opts: PollOptions = {}): Promise<Job> {
  const intervalMs = opts.intervalMs ?? 2000
  const maxIntervalMs = Math.max(opts.maxIntervalMs ?? 15_000, intervalMs)
  const timeoutMs = opts.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS
  const deadline = AbortSignal.timeout(timeoutMs)
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline

  let last: Job | undefined
  let interval = intervalMs
  let errors = 0
  try {
    for (;;) {
      let delay: number
      try {
        const job = await client.getJob(id, { signal, retries: 0 })
        errors = 0
        interval = last?.status === job.status ? Math.min(maxIntervalMs, interval * GROWTH) : intervalMs
        last = job
        opts.onUpdate?.(job)
        if (TERMINAL_STATUSES.has(job.status)) return job
        delay = interval
      } catch (err) {
        if (signal.aborted || !isRetryable(err)) throw err
        errors++
        if (opts.maxConsecutiveErrors !== undefined && errors > opts.maxConsecutiveErrors) throw err
        delay = retryDelay(err, errors - 1, {
          baseMs: intervalMs,
          maxMs: opts.maxErrorDelayMs ?? 60_000,
          random: opts.random,
        })
        opts.onRetry?.(err, delay, errors)
      }
      await sleep(delay, signal)
    }
  } catch (err) {
    if (deadline.aborted && !opts.signal?.aborted) {
      throw new TimeoutError(
        `Timed out after ${formatMs(timeoutMs)} waiting for job ${id} (last status: ${last?.status ?? 'unknown'})`,
        { lastJob: last, cause: err },
      )
    }
    throw err
  }
}

function formatMs(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`
  if (ms % 60_000 === 0) return `${ms / 60_000}m`
  if (ms % 1000 === 0) return `${ms / 1000}s`
  return `${ms}ms`
}
