import { describe, expect, it } from 'vitest'
import { DrumreelError } from '../src/errors.js'
import { parseJob, parseListJobs, parseWarning } from '../src/schema.js'
import { job, jsonResponse, makeClient, scriptedFetch } from './helpers.js'

const MISSING_KEY =
  'voiceover_missing_key: Voiceover was requested but no text-to-speech key is configured on the server; the video was rendered without narration.'

function withoutWarnings(): Record<string, unknown> {
  const { warnings: _omit, ...rest } = job('done')
  return rest
}

describe('job parsing (warnings)', () => {
  it('keeps warnings when present', () => {
    expect(parseJob(job('done', { warnings: [MISSING_KEY] })).warnings).toEqual([MISSING_KEY])
  })

  it('defaults warnings to [] when absent (older servers)', () => {
    expect(parseJob(withoutWarnings()).warnings).toEqual([])
  })

  it('tolerates malformed warnings and keeps unknown fields', () => {
    const parsed = parseJob({ ...job('done'), warnings: ['ok: fine', 42, null], future_field: 'x' })
    expect(parsed.warnings).toEqual(['ok: fine'])
    expect((parsed as unknown as Record<string, unknown>)['future_field']).toBe('x')
    expect(parseJob({ ...job('done'), warnings: null }).warnings).toEqual([])
  })

  it('rejects bodies that are not jobs', () => {
    expect(() => parseJob({ status: 'done' })).toThrow(DrumreelError)
    expect(() => parseJob('nope')).toThrow(/Invalid job from API/)
  })

  it('defaults warnings on each list item', () => {
    const res = parseListJobs({ items: [withoutWarnings(), job('done', { warnings: [MISSING_KEY] })] })
    expect(res.items.map((j) => j.warnings)).toEqual([[], [MISSING_KEY]])
  })

  it('client.getJob / listJobs return normalized warnings', async () => {
    const { fetch } = scriptedFetch([
      jsonResponse(200, withoutWarnings()),
      jsonResponse(200, { items: [withoutWarnings()], next_cursor: null }),
    ])
    const client = makeClient(fetch)
    expect((await client.getJob('job_1')).warnings).toEqual([])
    expect((await client.listJobs()).items[0]?.warnings).toEqual([])
  })

  it('getJob maps an invalid body to code invalid_response', async () => {
    const { fetch } = scriptedFetch([jsonResponse(200, { hello: 'world' })])
    await expect(makeClient(fetch).getJob('job_1')).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('parseWarning', () => {
  it('splits on the first ": "', () => {
    expect(parseWarning(MISSING_KEY)).toEqual({
      code: 'voiceover_missing_key',
      message: expect.stringContaining('no text-to-speech key'),
    })
    expect(parseWarning('voiceover_failed: a: b')).toEqual({ code: 'voiceover_failed', message: 'a: b' })
    expect(parseWarning('no separator')).toEqual({ code: 'unknown', message: 'no separator' })
  })
})
