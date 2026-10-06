import { afterEach, describe, expect, it, vi } from 'vitest'
import { AbortedError, AuthError, TimeoutError } from '../src/errors.js'
import { waitForJob } from '../src/poll.js'
import { apiError, hangingFetch, job, jsonResponse, makeClient, scriptedFetch } from './helpers.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('waitForJob', () => {
  it('polls until done', async () => {
    const { fetch, calls } = scriptedFetch([
      jsonResponse(200, job('queued')),
      jsonResponse(200, job('recording')),
      jsonResponse(200, job('done')),
    ])
    const done = await waitForJob(makeClient(fetch), 'job_1', { intervalMs: 1 })
    expect(done.status).toBe('done')
    expect(done.share_url).toContain('/s/')
    expect(calls).toHaveLength(3)
  })

  it('survives 429 (honoring Retry-After), 5xx and network errors mid-run', async () => {
    vi.useFakeTimers()
    const { fetch, calls } = scriptedFetch([
      jsonResponse(200, job('recording')),
      apiError(429, 'rate_limited', 'slow down', { 'Retry-After': '7' }),
      apiError(503, 'unavailable', 'deploying'),
      new TypeError('fetch failed'),
      jsonResponse(200, job('done')),
    ])
    const retries: number[] = []
    const p = waitForJob(makeClient(fetch), 'job_1', {
      intervalMs: 10,
      random: () => 0,
      onRetry: (_e, delay) => retries.push(delay),
    })
    await vi.advanceTimersByTimeAsync(10)
    expect(calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(6_999)
    expect(calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(p).resolves.toMatchObject({ status: 'done' })
    expect(calls).toHaveLength(5)
    expect(retries[0]).toBe(7000)
    expect(retries[1]).toBeLessThan(retries[2] ?? 0) // exponential growth
  })

  it('backs off the poll interval while status is unchanged and resets on change', async () => {
    vi.useFakeTimers()
    const { fetch, calls } = scriptedFetch([
      jsonResponse(200, job('recording')),
      jsonResponse(200, job('recording')),
      jsonResponse(200, job('recording')),
      jsonResponse(200, job('done')),
    ])
    const at: number[] = []
    const p = waitForJob(makeClient(fetch), 'job_1', { intervalMs: 100, onUpdate: () => at.push(Date.now()) })
    await vi.advanceTimersByTimeAsync(1000)
    await p
    expect(calls).toHaveLength(4)
    expect((at[2] ?? 0) - (at[1] ?? 0)).toBe(150)
    expect((at[3] ?? 0) - (at[2] ?? 0)).toBe(225)
  })

  it('fails fast on non-retryable errors (401)', async () => {
    const { fetch, calls } = scriptedFetch([apiError(401, 'unauthorized', 'bad key')])
    await expect(waitForJob(makeClient(fetch), 'job_1', { intervalMs: 1 })).rejects.toBeInstanceOf(AuthError)
    expect(calls).toHaveLength(1)
  })

  it('enforces the overall deadline even when the server never responds', async () => {
    const started = Date.now()
    const err = await waitForJob(makeClient(hangingFetch()), 'job_1', { timeoutMs: 50 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TimeoutError)
    expect((err as TimeoutError).message).toMatch(/last status: unknown/)
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('times out with the last seen job while the job keeps running', async () => {
    const { fetch } = scriptedFetch([jsonResponse(200, job('recording'))])
    const err = await waitForJob(makeClient(fetch), 'job_1', { intervalMs: 5, timeoutMs: 60 }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(TimeoutError)
    expect((err as TimeoutError).lastJob).toMatchObject({ status: 'recording' })
  })

  it('stops promptly when the caller aborts', async () => {
    const ac = new AbortController()
    const { fetch } = scriptedFetch([jsonResponse(200, job('recording'))])
    const p = waitForJob(makeClient(fetch), 'job_1', { intervalMs: 10_000, signal: ac.signal })
    setTimeout(() => ac.abort(), 10)
    await expect(p).rejects.toBeInstanceOf(AbortedError)
  })
})
