import { describe, expect, it } from 'vitest'
import { EXIT, exitCodeFor, formatError } from '../src/cli/exit-codes.js'
import { parseDuration, parseLimit } from '../src/cli/parse.js'
import { runCli } from '../src/cli/program.js'
import { AuthError, ConfigError, DrumreelError, ForbiddenError, TimeoutError } from '../src/errors.js'
import { apiError, BASE, captureIo, hangingFetch, job, jsonResponse, scriptedFetch, tempConfigHome } from './helpers.js'

async function env(extra: Record<string, string | undefined> = {}) {
  return { XDG_CONFIG_HOME: await tempConfigHome(), DRUMREEL_API_KEY: 'dr_test_abc', DRUMREEL_API_BASE: BASE, ...extra }
}

describe('exit-code mapping', () => {
  it.each([
    [new ConfigError('x'), EXIT.USAGE],
    [new AuthError(), EXIT.AUTH],
    [new ForbiddenError(), EXIT.FORBIDDEN],
    [new DrumreelError('x', { status: 404 }), EXIT.NOT_FOUND],
    [new DrumreelError('x', { status: 422 }), EXIT.API_ERROR],
    [new DrumreelError('x', { status: 408 }), EXIT.UNAVAILABLE],
    [new DrumreelError('x', { status: 429 }), EXIT.UNAVAILABLE],
    [new DrumreelError('x', { status: 503 }), EXIT.UNAVAILABLE],
    [new DrumreelError('x', { code: 'network' }), EXIT.UNAVAILABLE],
    [new TimeoutError('x'), EXIT.TIMEOUT],
    [new Error('x'), EXIT.FAILURE],
  ])('%s → %i', (err, code) => {
    expect(exitCodeFor(err)).toBe(code)
  })

  it('formats status and server code', () => {
    expect(formatError(new ForbiddenError('upgrade required', { code: 'plan_limit' }))).toBe(
      'drumreel: upgrade required (HTTP 403, code: plan_limit)',
    )
  })
})

describe('flag parsing', () => {
  it('parses durations', () => {
    expect(parseDuration('90s')).toBe(90_000)
    expect(parseDuration('10m')).toBe(600_000)
    expect(parseDuration('1h')).toBe(3_600_000)
    expect(parseDuration('1500ms')).toBe(1500)
    expect(parseDuration('45')).toBe(45_000)
    expect(() => parseDuration('0s')).toThrow(ConfigError)
    expect(() => parseDuration('soon')).toThrow(ConfigError)
  })
  it('validates --limit as an integer in 1..100', () => {
    expect(parseLimit('25')).toBe(25)
    for (const bad of ['0', '-1', '1.5', 'abc', '101', '']) expect(() => parseLimit(bad)).toThrow(ConfigError)
  })
})

describe('runCli', () => {
  it('exits 2 with guidance when no API base is configured', async () => {
    const { io, err } = captureIo(await env({ DRUMREEL_API_BASE: undefined }), scriptedFetch([]).fetch)
    expect(await runCli(['status', 'job_1'], io)).toBe(EXIT.USAGE)
    expect(err()).toMatch(/No Drumreel API base configured.*--api-base/)
  })

  it('exits 2 for plain http:// api base and for usage errors', async () => {
    const e = await env()
    expect(await runCli(['--api-base', 'http://api.example.com', 'status', 'x'], captureIo(e).io)).toBe(EXIT.USAGE)
    expect(await runCli(['jobs', '--limit', '0'], captureIo(e).io)).toBe(EXIT.USAGE)
    expect(await runCli(['run', '--url', 'https://x.test'], captureIo(e).io)).toBe(EXIT.USAGE)
    expect(await runCli(['nope'], captureIo(e).io)).toBe(EXIT.USAGE)
    expect(await runCli(['run', '--url', 'u', '--prompt', 'p', '--timeout', 'x'], captureIo(e).io)).toBe(EXIT.USAGE)
  })

  it('exits 3 when no API key is available', async () => {
    const { io } = captureIo(await env({ DRUMREEL_API_KEY: undefined }))
    expect(await runCli(['status', 'job_1'], io)).toBe(EXIT.AUTH)
  })

  it.each([
    [apiError(401, 'unauthorized', 'bad key'), EXIT.AUTH, /bad key \(HTTP 401, code: unauthorized\)/],
    [apiError(403, 'forbidden', 'nope'), EXIT.FORBIDDEN, /nope \(HTTP 403, code: forbidden\)/],
    [apiError(404, 'not_found', 'no job'), EXIT.NOT_FOUND, /HTTP 404/],
    [apiError(422, 'invalid', 'bad id'), EXIT.API_ERROR, /code: invalid/],
    [apiError(503, 'unavailable', 'down'), EXIT.UNAVAILABLE, /HTTP 503/],
    [apiError(408, 'request_timeout', 'slow upstream'), EXIT.UNAVAILABLE, /HTTP 408/],
  ])('maps API responses to exit codes (%#)', async (res, code, msg) => {
    const { io, err } = captureIo(await env(), scriptedFetch([res]).fetch)
    expect(await runCli(['status', 'job_1'], io)).toBe(code)
    expect(err()).toMatch(msg)
  })

  it('run: exits 0 and prints share + video URLs when done', async () => {
    const { fetch } = scriptedFetch([
      jsonResponse(201, { id: 'job_1', status: 'queued' }),
      jsonResponse(200, job('recording')),
      jsonResponse(200, job('done')),
      jsonResponse(200, { url: 'https://cdn.example.com/v.mp4', expires_at: 'later' }),
    ])
    const { io, out } = captureIo(await env(), fetch)
    expect(await runCli(['run', '--url', 'https://x.test', '--prompt', 'p', '--poll-ms', '1', '--json'], io)).toBe(
      EXIT.OK,
    )
    expect(JSON.parse(out())).toMatchObject({ status: 'done', video_url: 'https://cdn.example.com/v.mp4' })
  })

  it('run: exits 1 when the job ends in error', async () => {
    const { fetch } = scriptedFetch([
      jsonResponse(201, { id: 'job_1', status: 'queued' }),
      jsonResponse(200, job('error', { error: { code: 'nav_failed', message: 'page 500' } })),
    ])
    const { io } = captureIo(await env(), fetch)
    expect(await runCli(['run', '--url', 'https://x.test', '--prompt', 'p', '--poll-ms', '1'], io)).toBe(EXIT.FAILURE)
  })

  it('run: does not swallow video errors', async () => {
    const { fetch } = scriptedFetch([
      jsonResponse(201, { id: 'job_1', status: 'queued' }),
      jsonResponse(200, job('done')),
      apiError(403, 'forbidden', 'video access denied'),
    ])
    const { io, out, err } = captureIo(await env(), fetch)
    const code = await runCli(['run', '--url', 'https://x.test', '--prompt', 'p', '--poll-ms', '1', '--json'], io)
    expect(code).toBe(EXIT.FORBIDDEN)
    expect(JSON.parse(out())).toMatchObject({ video_url: null, video_error: { status: 403, code: 'forbidden' } })
    expect(err()).toMatch(/video access denied/)
  })

  it('run --timeout: exits 7 when the deadline passes and says the job keeps running', async () => {
    // POST /jobs succeeds, then every GET /jobs/:id hangs until aborted.
    const created = scriptedFetch([jsonResponse(201, { id: 'job_1', status: 'queued' })]).fetch
    const hang = hangingFetch()
    let n = 0
    const f = ((input: string | URL | Request, init?: RequestInit) =>
      n++ === 0 ? created(input, init) : hang(input, init)) as typeof globalThis.fetch
    const { io, err } = captureIo(await env(), f)
    const code = await runCli(['run', '--url', 'https://x.test', '--prompt', 'p', '--timeout', '100ms'], io)
    expect(code).toBe(EXIT.TIMEOUT)
    expect(err()).toMatch(/Timed out after 100ms waiting for job job_1/)
    expect(err()).toMatch(/drumreel status job_1/)
  })

  it('408 still failing after retries exits 8 (not 6)', async () => {
    const { fetch, calls } = scriptedFetch([apiError(408, 'request_timeout', 'slow upstream')])
    const { io } = captureIo(await env(), fetch)
    expect(await runCli(['status', 'job_1'], io)).toBe(EXIT.UNAVAILABLE)
    expect(calls).toHaveLength(4) // 1 attempt + 3 retries
  })

  const CREATE_HINT = /may already have been created; check `drumreel jobs --limit 5`/

  it('run: create network error exits 8 and suggests `drumreel jobs`', async () => {
    const { io, err } = captureIo(await env(), scriptedFetch([new TypeError('socket hang up')]).fetch)
    expect(await runCli(['run', '--url', 'https://x.test', '--prompt', 'p'], io)).toBe(EXIT.UNAVAILABLE)
    expect(err()).toMatch(CREATE_HINT)
  })

  it('run: create request timeout exits 7 and suggests `drumreel jobs`', async () => {
    const { io, err } = captureIo(await env(), hangingFetch())
    io.clientDefaults = { ...io.clientDefaults, requestTimeoutMs: 30 }
    expect(await runCli(['run', '--url', 'https://x.test', '--prompt', 'p'], io)).toBe(EXIT.TIMEOUT)
    expect(err()).toMatch(CREATE_HINT)
  })

  it('run: create 5xx suggests `drumreel jobs`; 429 and 4xx do not', async () => {
    const five = captureIo(await env(), scriptedFetch([apiError(502, 'bad_gateway', 'upstream')]).fetch)
    expect(await runCli(['run', '--url', 'https://x.test', '--prompt', 'p'], five.io)).toBe(EXIT.UNAVAILABLE)
    expect(five.err()).toMatch(CREATE_HINT)

    const rl = captureIo(await env(), scriptedFetch([apiError(429, 'rate_limited', 'slow', { 'Retry-After': '3600' })]).fetch)
    expect(await runCli(['run', '--url', 'https://x.test', '--prompt', 'p'], rl.io)).toBe(EXIT.UNAVAILABLE)
    expect(rl.err()).not.toMatch(CREATE_HINT)

    const bad = captureIo(await env(), scriptedFetch([apiError(422, 'invalid_url', 'bad url')]).fetch)
    expect(await runCli(['run', '--url', 'https://x.test', '--prompt', 'p'], bad.io)).toBe(EXIT.API_ERROR)
    expect(bad.err()).not.toMatch(CREATE_HINT)
  })

  it('--help exits 0', async () => {
    const { io, out } = captureIo(await env())
    expect(await runCli(['--help'], io)).toBe(EXIT.OK)
    expect(out()).toMatch(/Usage: drumreel/)
  })
})
