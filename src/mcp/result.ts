import { DrumreelError, TimeoutError } from '../errors.js'

export function jsonText(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

/** `warnings` of a job-shaped result (empty when absent). */
export function warningsOf(data: unknown): string[] {
  const w = typeof data === 'object' && data !== null ? (data as { warnings?: unknown }).warnings : undefined
  return Array.isArray(w) ? w.filter((x): x is string => typeof x === 'string') : []
}

/**
 * Tool result for a value that may be a job: the JSON (which always carries `warnings`
 * for job objects) plus, when there are warnings, a second text block listing them so
 * agents notice non-fatal issues such as a missing voiceover.
 */
export function resultText(data: unknown) {
  const res = jsonText(data)
  const warnings = warningsOf(data)
  if (warnings.length > 0) {
    res.content.push({
      type: 'text' as const,
      text: `Job warnings (non-fatal):\n${warnings.map((w) => `- warning: ${w}`).join('\n')}`,
    })
  }
  return res
}

/** Tool error payload: message plus HTTP status, server code and Retry-After when known. */
export function errorPayload(err: unknown): Record<string, unknown> {
  const message = err instanceof Error ? err.message : String(err)
  const payload: Record<string, unknown> = { message }
  if (err instanceof DrumreelError) {
    if (err.status !== undefined) payload['status'] = err.status
    if (err.code) payload['code'] = err.code
    if (err.retryAfterMs !== undefined) payload['retry_after_ms'] = err.retryAfterMs
    payload['retryable'] = err.retryable || err.status === 429
  }
  if (err instanceof TimeoutError && err.lastJob !== undefined) {
    payload['job'] = err.lastJob
    payload['warnings'] = warningsOf(err.lastJob)
  }
  return payload
}

export function errText(err: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: errorPayload(err) }, null, 2) }],
    isError: true as const,
  }
}
