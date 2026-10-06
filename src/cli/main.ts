import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { Command } from 'commander'
import { DrumreelClient } from '../client.js'
import {
  clearCredentials,
  DEFAULT_API_BASE,
  resolveApiBase,
  resolveApiKey,
  saveCredentials,
} from '../credentials.js'
import { AuthError, DrumreelError } from '../errors.js'
import { waitForJob } from '../poll.js'
import type { Job, RerunMode } from '../types.js'
import { pkgVersion } from '../version.js'

const program = new Command()

program
  .name('drumreel')
  .description('Thin client for Drumreel hosted walkthrough jobs (API only)')
  .version(pkgVersion())
  .option('--api-base <url>', 'API host (default: DRUMREEL_API_BASE or https://api.drumreel.com)')

function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
}

function printJobHuman(job: Job): void {
  process.stdout.write(`id:         ${job.id}\n`)
  process.stdout.write(`status:     ${job.status}\n`)
  process.stdout.write(`phase:      ${job.phase}\n`)
  process.stdout.write(`video_ready:${job.video_ready ? ' yes' : ' no'}\n`)
  if (job.share_url) process.stdout.write(`share_url:  ${job.share_url}\n`)
  if (job.progress != null) process.stdout.write(`progress:   ${job.progress}\n`)
  if (job.error) {
    const msg = typeof job.error === 'string' ? job.error : JSON.stringify(job.error)
    process.stdout.write(`error:      ${msg}\n`)
  }
  process.stdout.write(`created_at: ${job.created_at}\n`)
  process.stdout.write(`updated_at: ${job.updated_at}\n`)
}

async function makeClient(cmd: Command): Promise<DrumreelClient> {
  const root = cmd.optsWithGlobals() as { apiBase?: string }
  const apiKey = await resolveApiKey()
  if (!apiKey) throw new AuthError()
  const apiBase = await resolveApiBase(root.apiBase)
  return new DrumreelClient({ apiKey, apiBase })
}

function guard(fn: () => Promise<number>): void {
  Promise.resolve()
    .then(fn)
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`drumreel: ${msg}\n`)
      if (err instanceof AuthError) process.exit(2)
      if (err instanceof DrumreelError && err.status && err.status >= 400 && err.status < 500) {
        process.exit(3)
      }
      process.exit(1)
    })
}

program
  .command('login')
  .description('Store API key in ~/.config/drumreel/credentials.json (or XDG)')
  .option('--key <apiKey>', 'API key (dr_live_… / dr_test_…). If omitted, prompt securely.')
  .option('--api-base <url>', 'Optional default API base to store with the key')
  .action((opts: { key?: string; apiBase?: string }, cmd: Command) =>
    guard(async () => {
      let key = opts.key
      if (!key) {
        const rl = createInterface({ input, output })
        try {
          key = (await rl.question('API key (dr_live_… / dr_test_…): ')).trim()
        } finally {
          rl.close()
        }
      }
      if (!key) {
        process.stderr.write('drumreel: empty API key\n')
        return 1
      }
      if (!key.startsWith('dr_live_') && !key.startsWith('dr_test_')) {
        process.stderr.write(
          'drumreel: warning — key does not start with dr_live_ or dr_test_\n',
        )
      }
      const root = cmd.optsWithGlobals() as { apiBase?: string }
      const apiBase = opts.apiBase ?? root.apiBase
      const path = await saveCredentials({
        api_key: key,
        ...(apiBase ? { api_base: apiBase.replace(/\/+$/, '') } : {}),
      })
      process.stdout.write(`Saved credentials to ${path}\n`)
      return 0
    }),
  )

program
  .command('logout')
  .description('Remove stored API credentials')
  .action(() =>
    guard(async () => {
      await clearCredentials()
      process.stdout.write('Logged out (credentials removed)\n')
      return 0
    }),
  )

program
  .command('run')
  .description('Create a hosted walkthrough job and wait until done/error')
  .requiredOption('--url <url>', 'Target page URL')
  .requiredOption('--prompt <text>', 'Natural-language walkthrough intent')
  .option('--voice', 'Enable voiceover (options.enable_voiceover)')
  .option('--model <name>', 'Optional model hint')
  .option('--json', 'Machine-readable JSON output')
  .option('--poll-ms <n>', 'Poll interval ms', '2000')
  .action(
    (
      opts: {
        url: string
        prompt: string
        voice?: boolean
        model?: string
        json?: boolean
        pollMs: string
      },
      cmd: Command,
    ) =>
      guard(async () => {
        const client = await makeClient(cmd)
        const created = await client.createJob({
          url: opts.url,
          prompt: opts.prompt,
          options: {
            ...(opts.model ? { model: opts.model } : {}),
            ...(opts.voice ? { enable_voiceover: true } : {}),
          },
        })
        if (!opts.json) {
          process.stderr.write(`created ${created.id} (${created.status})\n`)
        }
        const job = await waitForJob(client, created.id, {
          intervalMs: Number(opts.pollMs) || 2000,
          onUpdate: (j) => {
            if (!opts.json) process.stderr.write(`  → ${j.status}\n`)
          },
        })

        let videoUrl: string | undefined
        if (job.video_ready) {
          try {
            const video = await client.getVideo(job.id)
            videoUrl = video.url
          } catch {
            // video endpoint may 404 briefly; share_url is still useful
          }
        }

        if (opts.json) {
          printJson({ ...job, video_url: videoUrl ?? null })
        } else {
          printJobHuman(job)
          if (videoUrl) process.stdout.write(`video_url:  ${videoUrl}\n`)
        }
        return job.status === 'done' ? 0 : 1
      }),
  )

program
  .command('jobs')
  .description('List recent jobs')
  .option('--cursor <c>', 'Opaque pagination cursor')
  .option('--limit <n>', 'Page size')
  .option('--json', 'Machine-readable JSON output')
  .action((opts: { cursor?: string; limit?: string; json?: boolean }, cmd: Command) =>
    guard(async () => {
      const client = await makeClient(cmd)
      const res = await client.listJobs({
        cursor: opts.cursor,
        limit: opts.limit ? Number(opts.limit) : undefined,
      })
      if (opts.json) {
        printJson(res)
      } else {
        if (res.items.length === 0) {
          process.stdout.write('(no jobs)\n')
        } else {
          for (const j of res.items) {
            process.stdout.write(
              `${j.id}\t${j.status}\t${j.video_ready ? 'video' : '-'}\t${j.share_url ?? ''}\n`,
            )
          }
        }
        if (res.next_cursor) process.stdout.write(`next_cursor: ${res.next_cursor}\n`)
      }
      return 0
    }),
  )

program
  .command('status')
  .description('Get job status')
  .argument('<id>', 'Job id')
  .option('--json', 'Machine-readable JSON output')
  .action((id: string, opts: { json?: boolean }, cmd: Command) =>
    guard(async () => {
      const client = await makeClient(cmd)
      const job = await client.getJob(id)
      if (opts.json) printJson(job)
      else printJobHuman(job)
      return 0
    }),
  )

program
  .command('video')
  .description('Get signed video URL for a job')
  .argument('<id>', 'Job id')
  .option('--json', 'Machine-readable JSON output')
  .action((id: string, opts: { json?: boolean }, cmd: Command) =>
    guard(async () => {
      const client = await makeClient(cmd)
      const video = await client.getVideo(id)
      if (opts.json) printJson(video)
      else {
        process.stdout.write(`url:        ${video.url}\n`)
        process.stdout.write(`expires_at: ${video.expires_at}\n`)
      }
      return 0
    }),
  )

program
  .command('rerun')
  .description('Rerun a job (creates a new job)')
  .argument('<id>', 'Source job id')
  .option('--mode <mode>', 'full | script', 'full')
  .option('--json', 'Machine-readable JSON output')
  .action((id: string, opts: { mode: string; json?: boolean }, cmd: Command) =>
    guard(async () => {
      const mode = opts.mode as RerunMode
      if (mode !== 'full' && mode !== 'script') {
        process.stderr.write('drumreel: --mode must be full or script\n')
        return 1
      }
      const client = await makeClient(cmd)
      const created = await client.rerunJob(id, mode)
      if (opts.json) printJson(created)
      else process.stdout.write(`id:     ${created.id}\nstatus: ${created.status}\n`)
      return 0
    }),
  )

program
  .command('setup')
  .description('Print agent / MCP setup helpers')
  .option('--agent', 'Print MCP config snippet for Claude Code / Codex')
  .action((opts: { agent?: boolean }) =>
    guard(async () => {
      if (!opts.agent) {
        process.stdout.write(
          'Thin client — no local browser/ffmpeg setup.\n' +
            '  1. npm install -g drumreel   # when published\n' +
            '  2. drumreel login\n' +
            '  3. drumreel setup --agent   # MCP snippet\n',
        )
        return 0
      }
      const apiBase = process.env['DRUMREEL_API_BASE'] ?? DEFAULT_API_BASE
      const snippet = {
        mcpServers: {
          drumreel: {
            command: 'npx',
            args: ['-y', 'drumreel', 'mcp'],
            env: {
              DRUMREEL_API_KEY: 'dr_live_YOUR_KEY',
              DRUMREEL_API_BASE: apiBase,
            },
          },
        },
      }
      process.stdout.write('# Claude Code / Codex MCP config snippet\n')
      process.stdout.write('# Paste under mcpServers (or merge with existing).\n')
      process.stdout.write('# Prefer credentials from `drumreel login` when DRUMREEL_API_KEY is unset.\n\n')
      process.stdout.write(`${JSON.stringify(snippet, null, 2)}\n`)
      process.stdout.write('\n# Or run the stdio server directly after a local build:\n')
      process.stdout.write('#   node dist/mcp.js\n')
      process.stdout.write('#   # / drumreel mcp\n')
      return 0
    }),
  )

program
  .command('mcp')
  .description('Start MCP stdio server (HTTP tools only)')
  .action(() =>
    guard(async () => {
      const { startStdioServer } = await import('../mcp/server.js')
      await startStdioServer()
      return 0
    }),
  )

program.parseAsync(process.argv)
