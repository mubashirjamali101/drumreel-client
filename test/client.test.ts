import { afterEach, describe, expect, it, vi } from 'vitest'
import { DrumreelClient } from '../src/client.js'
import { AbortedError, AuthError, ConfigError, DrumreelError, ForbiddenError, TimeoutError } from '../src/errors.js'
import { apiError, BASE, hangingFetch, job, jsonResponse, makeClient, scriptedFetch } from './helpers.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('DrumreelClient requests', () => {
  it('POSTs /api/v1/jobs with only the Bearer auth header', async () => {
    const { fetch, calls } = scriptedFetch([jsonResponse(201, { id: 'job_1', status: 'queued' })])
    const res = await makeClient(fetch).createJob({
      url: 'https://app.example.com',
      prompt: 'Show signup',
      options: { enable_voiceover: true },
    })
    expect(res).toEqual({ id: 'job_1', status: 'queued' })
    expect(calls[0]?.url).toBe(`${BASE}/api/v1/jobs`)
    expect(calls[0]?.init?.method).toBe('POST')
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer dr_test_abc')
    expect(headers.get('X-Api-Key')).toBeNull()
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      url: 'https://app.example.com',
      prompt: 'Show signup',
      options: { enable_voiceover: true },
    })
  })

  it('normalizes a base that already includes /api/v1', async () => {
    const { fetch, calls } = scriptedFetch([jsonResponse(200, job('done'))])
    await makeClient(fetch, { apiBase: `${BASE}/api/v1/` }).getJob('job_1')
    expect(calls[0]?.url).toBe(`${BASE}/api/v1/jobs/job_1`)
  })

  it('lists jobs with cursor + limit query', async () => {
    const { fetch, calls } = scriptedFetch([jsonResponse(200, { items: [], next_cursor: 'c2' })])
    const res = await makeClient(fetch).listJobs({ cursor: 'c1', limit: 10 })
    expect(calls[0]?.url).toBe(`${BASE}/api/v1/jobs?cursor=c1&limit=10`)
    expect(res.next_cursor).toBe('c2')
  })

  it('gets video url and reruns with mode', async () => {
    const { fetch, calls } = scriptedFetch([
      jsonResponse(200, { url: 'https://cdn.example.com/v.mp4?sig=1', expires_at: '2026-10-07T12:00:00Z' }),
      jsonResponse(201, { id: 'job_2', status: 'queued' }),
    ])
    const client = makeClient(fetch)
    expect((await client.getVideo('job_1')).url).toContain('cdn.example.com')
    expect((await client.rerunJob('job_1', 'script')).id).toBe('job_2')
    expect(calls[1]?.url).toBe(`${BASE}/api/v1/jobs/job_1/rerun`)
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ mode: 'script' })
  })
})

describe('DrumreelClient API base safety', () => {
  const f = scriptedFetch([jsonResponse(200, {})]).fetch
  it('refuses plain http:// for non-loopback hosts', () => {
    expect(() => makeClient(f, { apiBase: 'http://api.example.com' })).toThrow(ConfigError)
  })
  it.each(['http://localhost:3000', 'http://127.0.0.1:8787', 'http://[::1]:3000'])('allows %s', (base) => {
    expect(new DrumreelClient({ apiKey: 'k', apiBase: base, fetch: f }).apiBase).toBe(base)
  })
  it('requires an API base', () => {
    expect(() => new DrumreelClient({ apiKey: 'k', apiBase: '', fetch: f })).toThrow(/No built-in default|empty/)
  })
})

describe('DrumreelClient error mapping', () => {
  it('maps 401 to AuthError and keeps the server code/message', async () => {
    const { fetch } = scriptedFetch([apiError(401, 'key_revoked', 'key revoked')])
    const err = await makeClient(fetch).getJob('x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AuthError)
    expect(err).toMatchObject({ status: 401, code: 'key_revoked', message: 'key revoked' })
  })

  it('maps 403 to ForbiddenError, distinct from 401', async () => {
    const { fetch } = scriptedFetch([apiError(403, 'plan_limit', 'upgrade required')])
    const err = await makeClient(fetch).createJob({ url: 'https://x.test', prompt: 'p' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err).not.toBeInstanceOf(AuthError)
    expect(err).toMatchObject({ status: 403, code: 'plan_limit', message: 'upgrade required' })
  })

  it('maps other errors to DrumreelError with status + code', async () => {
    const { fetch } = scriptedFetch([apiError(404, 'not_found', 'video not ready')])
    const err = await makeClient(fetch).getVideo('job_1').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DrumreelError)
    expect(err).toMatchObject({ status: 404, code: 'not_found', message: 'video not ready', retryable: false })
  })

  it('keeps status for non-JSON error bodies (e.g. proxy 502 HTML)', async () => {
    const { fetch } = scriptedFetch([new Response('<html>bad gateway</html>', { status: 502 })])
    const err = await makeClient(fetch, { retries: 0 }).getJob('x').catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 502, retryable: true })
  })
})

describe('DrumreelClient retries', () => {
  it('honors Retry-After seconds on 429 before retrying', async () => {
    vi.useFakeTimers()
    const { fetch, calls } = scriptedFetch([
      apiError(429, 'rate_limited', 'slow down', { 'Retry-After': '2' }),
      jsonResponse(200, job('queued')),
    ])
    const p = makeClient(fetch).getJob('job_1')
    await vi.advanceTimersByTimeAsync(1999)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(p).resolves.toMatchObject({ status: 'queued' })
    expect(calls).toHaveLength(2)
  })

  it('honors Retry-After as an HTTP-date', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-07T00:00:00Z') })
    const { fetch, calls } = scriptedFetch([
      apiError(429, 'rate_limited', 'slow down', { 'Retry-After': 'Wed, 07 Oct 2026 00:00:03 GMT' }),
      jsonResponse(200, job('queued')),
    ])
    const p = makeClient(fetch).getJob('job_1')
    await vi.advanceTimersByTimeAsync(2900)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(100)
    await expect(p).resolves.toMatchObject({ status: 'queued' })
  })

  it('retries GET on 5xx and network errors, then succeeds', async () => {
    const { fetch, calls } = scriptedFetch([
      apiError(503, 'unavailable', 'try later'),
      new TypeError('fetch failed'),
      jsonResponse(200, job('recording')),
    ])
    await expect(makeClient(fetch).getJob('job_1')).resolves.toMatchObject({ status: 'recording' })
    expect(calls).toHaveLength(3)
  })

  it('gives up after the retry budget with the last error', async () => {
    const { fetch, calls } = scriptedFetch([apiError(500, 'internal', 'boom')])
    const err = await makeClient(fetch, { retries: 2 }).getJob('x').catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 500, code: 'internal' })
    expect(calls).toHaveLength(3)
  })

  it('does not retry POST on 5xx (avoids duplicate jobs) but does on 429', async () => {
    const five = scriptedFetch([apiError(500, 'internal', 'boom')])
    await expect(makeClient(five.fetch).createJob({ url: 'https://x.test', prompt: 'p' })).rejects.toMatchObject({
      status: 500,
    })
    expect(five.calls).toHaveLength(1)

    const rl = scriptedFetch([
      apiError(429, 'rate_limited', 'slow', { 'Retry-After': '0' }),
      jsonResponse(201, { id: 'job_9', status: 'queued' }),
    ])
    await expect(makeClient(rl.fetch).createJob({ url: 'https://x.test', prompt: 'p' })).resolves.toMatchObject({
      id: 'job_9',
    })
    expect(rl.calls).toHaveLength(2)
  })

  it('does not sleep when Retry-After exceeds maxRetryAfterMs', async () => {
    const { fetch, calls } = scriptedFetch([apiError(429, 'rate_limited', 'slow', { 'Retry-After': '3600' })])
    const err = await makeClient(fetch).getJob('x').catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 429, retryAfterMs: 3_600_000 })
    expect(calls).toHaveLength(1)
  })
})

describe('DrumreelClient timeouts and cancellation', () => {
  it('aborts a hung request after requestTimeoutMs with a TimeoutError', async () => {
    const started = Date.now()
    const err = await makeClient(hangingFetch(), { requestTimeoutMs: 30, retries: 0 })
      .getJob('x')
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TimeoutError)
    expect(err).toMatchObject({ code: 'timeout', retryable: true })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('threads the caller signal into fetch', async () => {
    const ac = new AbortController()
    const p = makeClient(hangingFetch()).getJob('x', { signal: ac.signal })
    ac.abort()
    await expect(p).rejects.toBeInstanceOf(AbortedError)
  })
})
