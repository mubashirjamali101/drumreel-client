import type { Job } from '../types.js'
import type { Out } from './context.js'

/**
 * Returns a callback that prints each distinct job warning to `out` once, as
 * `warning: <code>: <message>`. Call it on every poll; repeats are suppressed.
 * Warnings are informational and never affect the exit code.
 */
export function warningPrinter(out: Out): (job: Pick<Job, 'warnings'>) => void {
  const seen = new Set<string>()
  return (job) => {
    for (const w of job.warnings ?? []) {
      if (seen.has(w)) continue
      seen.add(w)
      out.write(`warning: ${w}\n`)
    }
  }
}
