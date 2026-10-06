import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { DrumreelClient } from '../client.js'
import { resolveApiBase, resolveApiKey } from '../credentials.js'
import { AuthError } from '../errors.js'

function jsonText(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

function errText(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true as const,
  }
}

async function clientFromEnv(): Promise<DrumreelClient> {
  const apiKey = await resolveApiKey()
  if (!apiKey) throw new AuthError()
  const apiBase = await resolveApiBase()
  return new DrumreelClient({ apiKey, apiBase })
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    'drumreel_create_job',
    {
      description:
        'Create a hosted Drumreel walkthrough job (prompt + url only). Returns {id, status}.',
      inputSchema: {
        url: z.string().url().describe('Target page URL'),
        prompt: z.string().min(1).describe('Natural-language walkthrough intent'),
        model: z.string().optional().describe('Optional model hint'),
        enable_voiceover: z.boolean().optional().describe('Enable voiceover'),
      },
    },
    async ({ url, prompt, model, enable_voiceover }) => {
      try {
        const client = await clientFromEnv()
        const options =
          model !== undefined || enable_voiceover !== undefined
            ? {
                ...(model !== undefined ? { model } : {}),
                ...(enable_voiceover !== undefined ? { enable_voiceover } : {}),
              }
            : undefined
        return jsonText(await client.createJob({ url, prompt, options }))
      } catch (err) {
        return errText(err)
      }
    },
  )

  server.registerTool(
    'drumreel_get_job',
    {
      description: 'Get job status/phase/share_url/video_ready.',
      inputSchema: { id: z.string().describe('Job id') },
    },
    async ({ id }) => {
      try {
        const client = await clientFromEnv()
        return jsonText(await client.getJob(id))
      } catch (err) {
        return errText(err)
      }
    },
  )

  server.registerTool(
    'drumreel_list_jobs',
    {
      description: 'List jobs with optional cursor pagination.',
      inputSchema: {
        cursor: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async ({ cursor, limit }) => {
      try {
        const client = await clientFromEnv()
        return jsonText(await client.listJobs({ cursor, limit }))
      } catch (err) {
        return errText(err)
      }
    },
  )

  server.registerTool(
    'drumreel_get_video',
    {
      description: 'Get a signed video URL for a completed job.',
      inputSchema: { id: z.string().describe('Job id') },
    },
    async ({ id }) => {
      try {
        const client = await clientFromEnv()
        return jsonText(await client.getVideo(id))
      } catch (err) {
        return errText(err)
      }
    },
  )

  server.registerTool(
    'drumreel_rerun_job',
    {
      description: 'Rerun a job (creates a new job id). mode: full | script.',
      inputSchema: {
        id: z.string().describe('Source job id'),
        mode: z.enum(['full', 'script']).default('full'),
      },
    },
    async ({ id, mode }) => {
      try {
        const client = await clientFromEnv()
        return jsonText(await client.rerunJob(id, mode))
      } catch (err) {
        return errText(err)
      }
    },
  )
}
