import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/cli/exit-codes.js'
import { runCli } from '../src/cli/program.js'
import { BASE, captureIo, job, jsonResponse, scriptedFetch, tempConfigHome } from './helpers.js'

const W1 = 'voiceover_missing_key: Voiceover was requested but no text-to-speech key is configured on the server; the video was rendered without narration.'
const W2 = 'voiceover_failed: Voiceover generation failed; the video was rendered without narration.'

async function env() {
  return { XDG_CONFIG_HOME: await tempConfigHome(), DRUMREEL_API_KEY: 'dr_test_abc', DRUMREEL_API_BASE: BASE }
}

const count = (hay: string, needle: string): number => hay.split(needle).length - 1

function runFetch() {
  return scriptedFetch([
    jsonResponse(201, { id: 'job_1', status: 'queued' }),
    jsonResponse(200, job('recording', { warnings: [W1] })),
    jsonResponse(200, job('recording', { warnings: [W1] })),
    jsonResponse(200, job('uploading', { warnings: [W1, W2] })),
    jsonResponse(200, job('done', { warnings: [W1, W2] })),
    jsonResponse(200, { url: 'https://cdn.example.com/v.mp4', expires_at: 'later' }),
  ]).fetch
}

describe('CLI job warnings', () => {
  it('run prints each distinct warning once to stderr; exit code unchanged', async () => {
    const { io, err } = captureIo(await env(), runFetch())
    expect(await runCli(['run', '--url', 'https://x.test', '--prompt', 'p', '--voice', '--poll-ms', '1'], io)).toBe(
      EXIT.OK,
    )
    expect(count(err(), `warning: ${W1}\n`)).toBe(1)
    expect(count(err(), `warning: ${W2}\n`)).toBe(1)
    expect(err().indexOf(W1)).toBeLessThan(err().indexOf(W2))
  })

  it('run --json includes warnings in stdout and still prints them to stderr', async () => {
    const { io, out, err } = captureIo(await env(), runFetch())
    const code = await runCli(['run', '--url', 'https://x.test', '--prompt', 'p', '--poll-ms', '1', '--json'], io)
    expect(code).toBe(EXIT.OK)
    expect(JSON.parse(out())).toMatchObject({ status: 'done', warnings: [W1, W2] })
    expect(count(err(), 'warning: ')).toBe(2)
  })

  it('run with a failed job keeps exit 1 regardless of warnings', async () => {
    const { fetch } = scriptedFetch([
      jsonResponse(201, { id: 'job_1', status: 'queued' }),
      jsonResponse(200, job('error', { warnings: [W2] })),
    ])
    const { io, err } = captureIo(await env(), fetch)
    expect(await runCli(['run', '--url', 'https://x.test', '--prompt', 'p', '--poll-ms', '1'], io)).toBe(EXIT.FAILURE)
    expect(err()).toContain(`warning: ${W2}`)
  })

  it('status prints warnings to stderr and includes them in --json', async () => {
    const { fetch } = scriptedFetch([jsonResponse(200, job('done', { warnings: [W1] }))])
    const { io, out, err } = captureIo(await env(), fetch)
    expect(await runCli(['status', 'job_1', '--json'], io)).toBe(EXIT.OK)
    expect(JSON.parse(out()).warnings).toEqual([W1])
    expect(err()).toBe(`warning: ${W1}\n`)
  })

  it('status --json emits warnings: [] for servers that omit the field', async () => {
    const { warnings: _omit, ...legacy } = job('done')
    const { io, out, err } = captureIo(await env(), scriptedFetch([jsonResponse(200, legacy)]).fetch)
    expect(await runCli(['status', 'job_1', '--json'], io)).toBe(EXIT.OK)
    expect(JSON.parse(out()).warnings).toEqual([])
    expect(err()).toBe('')
  })
})
