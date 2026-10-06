import { DrumreelError, TimeoutError } from '../errors.js'

export function jsonText(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
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
  if (err instanceof TimeoutError && err.lastJob !== undefined) payload['job'] = err.lastJob
  return payload
}

export function errText(err: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: errorPayload(err) }, null, 2) }],
    isError: true as const,
  }
}
