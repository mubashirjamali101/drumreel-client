import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { DrumreelClient } from '../client.js'
import { resolveApiBase, resolveApiKey } from '../credentials.js'
import { AuthError } from '../errors.js'
import { waitForJob } from '../poll.js'
import { errText, jsonText } from './result.js'

export type ClientFactory = () => Promise<DrumreelClient>

/** Default factory: key and base from env / credentials file (no default host). */
export async function clientFromEnv(): Promise<DrumreelClient> {
  const apiKey = await resolveApiKey()
  if (!apiKey) throw new AuthError()
  const apiBase = await resolveApiBase()
  return new DrumreelClient({ apiKey, apiBase })
}

export const WAIT_DEFAULT_SECONDS = 300
export const WAIT_MAX_SECONDS = 3600

/** Wrap a tool body: any thrown error becomes an isError result with status/code. */
function safe<A>(fn: (args: A, signal: AbortSignal) => Promise<unknown>) {
  return async (args: A, extra: { signal: AbortSignal }) => {
    try {
      return jsonText(await fn(args, extra.signal))
    } catch (err) {
      return errText(err)
    }
  }
}

export function registerTools(server: McpServer, makeClient: ClientFactory = clientFromEnv): void {
  server.registerTool(
    'drumreel_create_job',
    {
      description: 'Create a hosted Drumreel walkthrough job (prompt + url only). Returns {id, status}.',
      inputSchema: {
        url: z.string().url().describe('Target page URL'),
        prompt: z.string().min(1).describe('Natural-language walkthrough intent'),
        model: z.string().optional().describe('Optional model hint'),
        enable_voiceover: z.boolean().optional().describe('Enable voiceover'),
      },
    },
    safe(async ({ url, prompt, model, enable_voiceover }, signal) => {
      const options =
        model !== undefined || enable_voiceover !== undefined
          ? {
              ...(model !== undefined ? { model } : {}),
              ...(enable_voiceover !== undefined ? { enable_voiceover } : {}),
            }
          : undefined
      return (await makeClient()).createJob({ url, prompt, options }, { signal })
    }),
  )

  server.registerTool(
    'drumreel_get_job',
    {
      description: 'Get job status/phase/share_url/video_ready.',
      inputSchema: { id: z.string().min(1).describe('Job id') },
    },
    safe(async ({ id }, signal) => (await makeClient()).getJob(id, { signal })),
  )

  server.registerTool(
    'drumreel_wait_for_job',
    {
      description:
        'Poll a job until it is done or error (backoff + Retry-After aware). Returns the final job. ' +
        `On timeout returns an error with code "timeout" and the last seen job; call again to keep waiting.`,
      inputSchema: {
        id: z.string().min(1).describe('Job id'),
        timeout_seconds: z
          .number()
          .int()
          .positive()
          .max(WAIT_MAX_SECONDS)
          .optional()
          .describe(`Max seconds to wait (default ${WAIT_DEFAULT_SECONDS}, max ${WAIT_MAX_SECONDS})`),
      },
    },
    safe(async ({ id, timeout_seconds }, signal) =>
      waitForJob(await makeClient(), id, {
        timeoutMs: (timeout_seconds ?? WAIT_DEFAULT_SECONDS) * 1000,
        signal,
      }),
    ),
  )

  server.registerTool(
    'drumreel_list_jobs',
    {
      description: 'List jobs with optional cursor pagination.',
      inputSchema: {
        cursor: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    safe(async ({ cursor, limit }, signal) => (await makeClient()).listJobs({ cursor, limit }, { signal })),
  )

  server.registerTool(
    'drumreel_get_video',
    {
      description: 'Get a signed video URL for a completed job. Returns 404 (code not_found) until video_ready is true.',
      inputSchema: { id: z.string().min(1).describe('Job id') },
    },
    safe(async ({ id }, signal) => (await makeClient()).getVideo(id, { signal })),
  )

  server.registerTool(
    'drumreel_rerun_job',
    {
      description: 'Rerun a job (creates a new job id). mode: full | script.',
      inputSchema: {
        id: z.string().min(1).describe('Source job id'),
        mode: z.enum(['full', 'script']).default('full'),
      },
    },
    safe(async ({ id, mode }, signal) => (await makeClient()).rerunJob(id, mode, { signal })),
  )
}
