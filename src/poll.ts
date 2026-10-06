import type { DrumreelClient } from './client.js'
import { DrumreelError } from './errors.js'
import { TERMINAL_STATUSES, type Job } from './types.js'

export interface PollOptions {
  intervalMs?: number
  timeoutMs?: number
  onUpdate?: (job: Job) => void
  signal?: AbortSignal
}

/** Poll GET /jobs/:id until done/error or timeout. */
export async function waitForJob(
  client: DrumreelClient,
  id: string,
  opts: PollOptions = {},
): Promise<Job> {
  const intervalMs = opts.intervalMs ?? 2000
  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000
  const started = Date.now()

  for (;;) {
    if (opts.signal?.aborted) {
      throw new DrumreelError('Polling aborted', { code: 'aborted' })
    }
    const job = await client.getJob(id)
    opts.onUpdate?.(job)
    if (TERMINAL_STATUSES.has(job.status)) return job
    if (Date.now() - started > timeoutMs) {
      throw new DrumreelError(`Timed out waiting for job ${id} (last status: ${job.status})`, {
        code: 'timeout',
      })
    }
    await sleep(intervalMs, opts.signal)
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DrumreelError('Polling aborted', { code: 'aborted' }))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DrumreelError('Polling aborted', { code: 'aborted' }))
      },
      { once: true },
    )
  })
}
