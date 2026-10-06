import type { Job } from '../types.js'
import type { Out } from './context.js'

export function printJson(out: Out, data: unknown): void {
  out.write(`${JSON.stringify(data, null, 2)}\n`)
}

export function printJobHuman(out: Out, job: Job): void {
  const row = (k: string, v: unknown): void => {
    out.write(`${`${k}:`.padEnd(12)}${String(v)}\n`)
  }
  row('id', job.id)
  row('status', job.status)
  row('phase', job.phase)
  row('video_ready', job.video_ready ? 'yes' : 'no')
  if (job.share_url) row('share_url', job.share_url)
  if (job.progress != null) row('progress', job.progress)
  if (job.error) row('error', typeof job.error === 'string' ? job.error : JSON.stringify(job.error))
  row('created_at', job.created_at)
  row('updated_at', job.updated_at)
}
