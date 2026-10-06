import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import type { DrumreelClient } from '../src/client.js'
import { createServer } from '../src/mcp/server.js'
import { apiError, job, jsonResponse, makeClient, scriptedFetch } from './helpers.js'

async function connect(client: DrumreelClient) {
  const server = createServer(async () => client)
  const [a, b] = InMemoryTransport.createLinkedPair()
  const mcp = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([server.connect(a), mcp.connect(b)])
  return mcp
}

function parse(res: unknown): { isError?: boolean; body: Record<string, any> } {
  const r = res as { isError?: boolean; content: { type: string; text: string }[] }
  return { isError: r.isError, body: JSON.parse(r.content[0]?.text ?? '{}') }
}

describe('MCP tools', () => {
  it('lists drumreel_wait_for_job alongside the HTTP tools', async () => {
    const mcp = await connect(makeClient(scriptedFetch([]).fetch))
    const names = (await mcp.listTools()).tools.map((t) => t.name).sort()
    expect(names).toEqual([
      'drumreel_create_job',
      'drumreel_get_job',
      'drumreel_get_video',
      'drumreel_list_jobs',
      'drumreel_rerun_job',
      'drumreel_wait_for_job',
    ])
  })

  it.each([
    [apiError(401, 'unauthorized', 'bad key'), 401, 'unauthorized'],
    [apiError(403, 'plan_limit', 'upgrade'), 403, 'plan_limit'],
    [apiError(404, 'not_found', 'video not ready'), 404, 'not_found'],
  ])('maps API errors to isError results with HTTP status + code (%#)', async (res, status, code) => {
    const mcp = await connect(makeClient(scriptedFetch([res]).fetch))
    const out = parse(await mcp.callTool({ name: 'drumreel_get_video', arguments: { id: 'job_1' } }))
    expect(out.isError).toBe(true)
    expect(out.body.error).toMatchObject({ status, code })
  })

  it('includes retry_after_ms for 429', async () => {
    const res = apiError(429, 'rate_limited', 'slow', { 'Retry-After': '120' })
    const mcp = await connect(makeClient(scriptedFetch([res]).fetch, { retries: 0 }))
    const out = parse(await mcp.callTool({ name: 'drumreel_get_job', arguments: { id: 'job_1' } }))
    expect(out.body.error).toMatchObject({ status: 429, code: 'rate_limited', retry_after_ms: 120_000, retryable: true })
  })

  it('drumreel_wait_for_job polls until done via the shared poller', async () => {
    const { fetch, calls } = scriptedFetch([
      jsonResponse(200, job('queued')),
      apiError(503, 'unavailable', 'blip'),
      jsonResponse(200, job('done')),
    ])
    const mcp = await connect(makeClient(fetch))
    const out = parse(
      await mcp.callTool({ name: 'drumreel_wait_for_job', arguments: { id: 'job_1', timeout_seconds: 60 } }),
    )
    expect(out.isError).toBeFalsy()
    expect(out.body).toMatchObject({ status: 'done', video_ready: true })
    expect(calls.length).toBe(3)
  }, 15_000)

  it('drumreel_wait_for_job rejects out-of-range timeouts', async () => {
    const mcp = await connect(makeClient(scriptedFetch([]).fetch))
    const res = (await mcp.callTool({
      name: 'drumreel_wait_for_job',
      arguments: { id: 'job_1', timeout_seconds: 999_999 },
    })) as { isError?: boolean }
    expect(res.isError).toBe(true)
  })
})
