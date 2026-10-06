import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DrumreelClient } from '../src/client.js'
import type { CliIo } from '../src/cli/context.js'
import type { ClientOptions, Job, JobStatus } from '../src/types.js'

export const BASE = 'https://api.example.com'

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function apiError(status: number, code: string, message: string, headers?: Record<string, string>): Response {
  return jsonResponse(status, { error: { code, message } }, headers)
}

export function job(status: JobStatus, extra: Partial<Job> = {}): Job {
  return {
    id: 'job_1',
    status,
    phase: status,
    video_ready: status === 'done',
    share_url: status === 'done' ? `${BASE}/s/abc` : null,
    created_at: '2026-10-07T00:00:00.000Z',
    updated_at: '2026-10-07T00:00:00.000Z',
    ...extra,
  }
}

/** A fetch that never resolves until its signal aborts (simulates a hung server). */
export function hangingFetch(): typeof fetch {
  return ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })) as typeof fetch
}

type Step = Response | Error | (() => Response | Promise<Response>)

/** Fetch mock that replays `steps` in order (last step repeats). Records calls. */
export function scriptedFetch(steps: Step[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), init })
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]
    if (step instanceof Error) throw step
    if (typeof step === 'function') return step()
    return (step as Response).clone()
  }
  return { fetch: fn as typeof fetch, calls }
}

export function makeClient(fetchImpl: typeof fetch, opts: Partial<ClientOptions> = {}): DrumreelClient {
  return new DrumreelClient({
    apiKey: 'dr_test_abc',
    apiBase: BASE,
    fetch: fetchImpl,
    retryBaseMs: 1,
    retryMaxMs: 2,
    random: () => 0.5,
    ...opts,
  })
}

export async function tempConfigHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'drumreel-test-'))
}

export function captureIo(env: Record<string, string | undefined>, fetchImpl?: typeof fetch) {
  let stdout = ''
  let stderr = ''
  const io: CliIo = {
    stdout: { write: (s: string) => (stdout += s) },
    stderr: { write: (s: string) => (stderr += s) },
    env,
    fetch: fetchImpl,
    clientDefaults: { retryBaseMs: 1, retryMaxMs: 2 },
  }
  return { io, out: () => stdout, err: () => stderr }
}
