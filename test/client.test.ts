import { afterEach, describe, expect, it, vi } from 'vitest'
import { DrumreelClient } from '../src/client.js'
import { AuthError, DrumreelError } from '../src/errors.js'
import { waitForJob } from '../src/poll.js'
import type { Job } from '../src/types.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('DrumreelClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs /api/v1/jobs with bearer + api key headers', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.example.com/api/v1/jobs')
      expect(init?.method).toBe('POST')
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer dr_test_abc')
      expect(headers.get('X-Api-Key')).toBe('dr_test_abc')
      expect(JSON.parse(String(init?.body))).toEqual({
        url: 'https://app.example.com',
        prompt: 'Show signup',
        options: { enable_voiceover: true },
      })
      return jsonResponse(201, { id: 'job_1', status: 'queued' })
    })

    const client = new DrumreelClient({
      apiKey: 'dr_test_abc',
      apiBase: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    })

    const res = await client.createJob({
      url: 'https://app.example.com',
      prompt: 'Show signup',
      options: { enable_voiceover: true },
    })
    expect(res).toEqual({ id: 'job_1', status: 'queued' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('normalizes base that already includes /api/v1', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('https://api.example.com/api/v1/jobs/job_1')
      return jsonResponse(200, {
        id: 'job_1',
        status: 'done',
        phase: 'done',
        video_ready: true,
        created_at: '2026-10-07T00:00:00.000Z',
        updated_at: '2026-10-07T00:01:00.000Z',
      })
    })

    const client = new DrumreelClient({
      apiKey: 'dr_test_abc',
      apiBase: 'https://api.example.com/api/v1',
      fetch: fetchMock as unknown as typeof fetch,
    })
    const job = await client.getJob('job_1')
    expect(job.status).toBe('done')
  })

  it('lists jobs with cursor query', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('https://api.example.com/api/v1/jobs?cursor=c1&limit=10')
      return jsonResponse(200, { items: [], next_cursor: 'c2' })
    })
    const client = new DrumreelClient({
      apiKey: 'dr_test_abc',
      apiBase: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    })
    const res = await client.listJobs({ cursor: 'c1', limit: 10 })
    expect(res.next_cursor).toBe('c2')
  })

  it('gets video url', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        url: 'https://cdn.example.com/v.mp4?sig=1',
        expires_at: '2026-10-07T12:00:00.000Z',
      }),
    )
    const client = new DrumreelClient({
      apiKey: 'dr_test_abc',
      apiBase: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    })
    const video = await client.getVideo('job_1')
    expect(video.url).toContain('cdn.example.com')
  })

  it('reruns with mode', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.example.com/api/v1/jobs/job_1/rerun')
      expect(JSON.parse(String(init?.body))).toEqual({ mode: 'script' })
      return jsonResponse(201, { id: 'job_2', status: 'queued' })
    })
    const client = new DrumreelClient({
      apiKey: 'dr_test_abc',
      apiBase: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    })
    const res = await client.rerunJob('job_1', 'script')
    expect(res.id).toBe('job_2')
  })

  it('maps 401 to AuthError', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, { error: { code: 'unauthorized', message: 'bad key' } }),
    )
    const client = new DrumreelClient({
      apiKey: 'dr_test_bad',
      apiBase: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    })
    await expect(client.getJob('x')).rejects.toBeInstanceOf(AuthError)
  })

  it('maps API errors to DrumreelError with status', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(404, { error: { code: 'not_found', message: 'missing' } }),
    )
    const client = new DrumreelClient({
      apiKey: 'dr_test_abc',
      apiBase: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    })
    try {
      await client.getVideo('missing')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(DrumreelError)
      expect((err as DrumreelError).status).toBe(404)
      expect((err as DrumreelError).code).toBe('not_found')
    }
  })
})

describe('waitForJob', () => {
  it('polls until done', async () => {
    const statuses: Job['status'][] = ['queued', 'recording', 'done']
    let i = 0
    const fetchMock = vi.fn(async () => {
      const status = statuses[i++] ?? 'done'
      return jsonResponse(200, {
        id: 'job_1',
        status,
        phase: status,
        video_ready: status === 'done',
        share_url: status === 'done' ? 'https://api.example.com/s/abc' : null,
        created_at: '2026-10-07T00:00:00.000Z',
        updated_at: '2026-10-07T00:00:00.000Z',
      })
    })
    const client = new DrumreelClient({
      apiKey: 'dr_test_abc',
      apiBase: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    })
    const job = await waitForJob(client, 'job_1', { intervalMs: 1 })
    expect(job.status).toBe('done')
    expect(job.share_url).toContain('/s/')
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})
