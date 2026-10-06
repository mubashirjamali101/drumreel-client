import type { Command } from 'commander'
import { ConfigError } from '../../errors.js'
import type { RerunMode } from '../../types.js'
import { type Ctx, makeClient } from '../context.js'
import { EXIT } from '../exit-codes.js'
import { printJobHuman, printJson } from '../output.js'
import { parseLimit } from '../parse.js'

export function registerJobs(program: Command, ctx: Ctx): void {
  const out = ctx.io.stdout

  program
    .command('jobs')
    .description('List recent jobs')
    .option('--cursor <c>', 'Opaque pagination cursor')
    .option('--limit <n>', 'Page size (1-100)')
    .option('--json', 'Machine-readable JSON output')
    .action(async (opts: { cursor?: string; limit?: string; json?: boolean }, cmd: Command) => {
      const limit = opts.limit !== undefined ? parseLimit(opts.limit) : undefined
      const client = await makeClient(ctx, cmd)
      const res = await client.listJobs({ cursor: opts.cursor, limit })
      if (opts.json) {
        printJson(out, res)
      } else {
        if (res.items.length === 0) out.write('(no jobs)\n')
        for (const j of res.items) {
          out.write(`${j.id}\t${j.status}\t${j.video_ready ? 'video' : '-'}\t${j.share_url ?? ''}\n`)
        }
        if (res.next_cursor) out.write(`next_cursor: ${res.next_cursor}\n`)
      }
      ctx.setCode(EXIT.OK)
    })

  program
    .command('status')
    .description('Get job status')
    .argument('<id>', 'Job id')
    .option('--json', 'Machine-readable JSON output')
    .action(async (id: string, opts: { json?: boolean }, cmd: Command) => {
      const client = await makeClient(ctx, cmd)
      const job = await client.getJob(id)
      if (opts.json) printJson(out, job)
      else printJobHuman(out, job)
      ctx.setCode(EXIT.OK)
    })

  program
    .command('video')
    .description('Get signed video URL for a job (exit 5 / HTTP 404 until the video is ready)')
    .argument('<id>', 'Job id')
    .option('--json', 'Machine-readable JSON output')
    .action(async (id: string, opts: { json?: boolean }, cmd: Command) => {
      const client = await makeClient(ctx, cmd)
      const video = await client.getVideo(id)
      if (opts.json) printJson(out, video)
      else out.write(`url:        ${video.url}\nexpires_at: ${video.expires_at}\n`)
      ctx.setCode(EXIT.OK)
    })

  program
    .command('rerun')
    .description('Rerun a job (creates a new job)')
    .argument('<id>', 'Source job id')
    .option('--mode <mode>', 'full | script', 'full')
    .option('--json', 'Machine-readable JSON output')
    .action(async (id: string, opts: { mode: string; json?: boolean }, cmd: Command) => {
      if (opts.mode !== 'full' && opts.mode !== 'script') {
        throw new ConfigError('--mode must be full or script', 'usage')
      }
      const client = await makeClient(ctx, cmd)
      const created = await client.rerunJob(id, opts.mode as RerunMode)
      if (opts.json) printJson(out, created)
      else out.write(`id:     ${created.id}\nstatus: ${created.status}\n`)
      ctx.setCode(EXIT.OK)
    })
}
