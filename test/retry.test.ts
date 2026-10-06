import { describe, expect, it } from 'vitest'
import { AbortedError } from '../src/errors.js'
import { backoffDelay, parseRetryAfter, sleep } from '../src/retry.js'

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-10-07T00:00:00Z')
  it('parses delta-seconds', () => {
    expect(parseRetryAfter('5', now)).toBe(5000)
    expect(parseRetryAfter(' 0 ', now)).toBe(0)
  })
  it('parses HTTP-date relative to now, clamped at 0', () => {
    expect(parseRetryAfter('Wed, 07 Oct 2026 00:00:10 GMT', now)).toBe(10_000)
    expect(parseRetryAfter('Tue, 06 Oct 2026 00:00:00 GMT', now)).toBe(0)
  })
  it('ignores missing or garbage values', () => {
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })
})

describe('backoffDelay', () => {
  it('grows exponentially with jitter and caps at maxMs', () => {
    const opts = { baseMs: 100, maxMs: 1000 }
    expect(backoffDelay(0, { ...opts, random: () => 0 })).toBe(50)
    expect(backoffDelay(0, { ...opts, random: () => 0.999 })).toBeLessThanOrEqual(100)
    expect(backoffDelay(3, { ...opts, random: () => 0 })).toBe(400)
    expect(backoffDelay(10, { ...opts, random: () => 0.999 })).toBeLessThanOrEqual(1000)
    expect(backoffDelay(10, { ...opts, random: () => 0 })).toBe(500)
  })
})

describe('sleep', () => {
  it('removes its abort listener after resolving', async () => {
    const ac = new AbortController()
    let added = 0
    let removed = 0
    const orig = { add: ac.signal.addEventListener.bind(ac.signal), rm: ac.signal.removeEventListener.bind(ac.signal) }
    ac.signal.addEventListener = ((...a: Parameters<AbortSignal['addEventListener']>) => {
      added++
      orig.add(...a)
    }) as AbortSignal['addEventListener']
    ac.signal.removeEventListener = ((...a: Parameters<AbortSignal['removeEventListener']>) => {
      removed++
      orig.rm(...a)
    }) as AbortSignal['removeEventListener']
    await sleep(1, ac.signal)
    await sleep(1, ac.signal)
    expect(added).toBe(2)
    expect(removed).toBe(2)
  })

  it('rejects with AbortedError when aborted', async () => {
    const ac = new AbortController()
    const p = sleep(10_000, ac.signal)
    ac.abort()
    await expect(p).rejects.toBeInstanceOf(AbortedError)
  })
})
