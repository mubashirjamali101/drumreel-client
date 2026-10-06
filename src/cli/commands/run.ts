import type { Command } from 'commander'
import type { DrumreelClient } from '../../client.js'
import { AbortedError, DrumreelError, TimeoutError } from '../../errors.js'
import { waitForJob } from '../../poll.js'
import { sleep } from '../../retry.js'
import type { Job } from '../../types.js'
import { type Ctx, makeClient } from '../context.js'
import { EXIT, errorJson, exitCodeFor, formatError } from '../exit-codes.js'
import { printJobHuman, printJson } from '../output.js'
import { parseDuration, parsePositiveInt } from '../parse.js'

interface RunOpts {
  url: string
  prompt: string
  voice?: boolean
  model?: string
  json?: boolean
  pollMs: string
  timeout: string
}

export function registerRun(program: Command, ctx: Ctx): void {
  program
    .command('run')
    .description('Create a hosted walkthrough job and wait until done/error')
    .requiredOption('--url <url>', 'Target page URL')
    .requiredOption('--prompt <text>', 'Natural-language walkthrough intent')
    .option('--voice', 'Enable voiceover (options.enable_voiceover)')
    .option('--model <name>', 'Optional model hint')
    .option('--json', 'Machine-readable JSON output')
    .option('--poll-ms <n>', 'Initial poll interval in ms (backs off to 15s while status is unchanged)', '2000')
    .option('--timeout <dur>', 'Overall wait deadline, e.g. 90s, 10m, 1h', '30m')
    .action((opts: RunOpts, cmd: Command) => runAction(ctx, opts, cmd))
}

async function runAction(ctx: Ctx, opts: RunOpts, cmd: Command): Promise<void> {
  const { stdout, stderr } = ctx.io
  const intervalMs = parsePositiveInt(opts.pollMs, '--poll-ms', 600_000)
  const timeoutMs = parseDuration(opts.timeout)
  const client = await makeClient(ctx, cmd)

  const ac = new AbortController()
  const onSigint = (): void => ac.abort(new AbortedError('Interrupted'))
  if (ctx.io.handleSignals) process.once('SIGINT', onSigint)
  try {
    const created = await client.createJob(
      {
        url: opts.url,
        prompt: opts.prompt,
        options: {
          ...(opts.model ? { model: opts.model } : {}),
          ...(opts.voice ? { enable_voiceover: true } : {}),
        },
      },
      { signal: ac.signal },
    ).catch((err: unknown) => {
      if (maybeCreated(err)) {
        stderr.write(
          'drumreel: the job may already have been created; check `drumreel jobs --limit 5` before retrying to avoid a duplicate\n',
        )
      }
      throw err
    })
    if (!opts.json) stderr.write(`created ${created.id} (${created.status})\n`)

    let lastStatus: string | undefined
    const job = await waitForJob(client, created.id, {
      intervalMs,
      timeoutMs,
      signal: ac.signal,
      onUpdate: (j) => {
        if (!opts.json && j.status !== lastStatus) stderr.write(`  → ${j.status}\n`)
        lastStatus = j.status
      },
      onRetry: (err, delayMs) => {
        if (!opts.json) stderr.write(`  ! ${formatError(err).replace(/^drumreel: /, '')}; retrying in ${Math.ceil(delayMs / 1000)}s\n`)
      },
    }).catch((err: unknown) => {
      if (err instanceof TimeoutError || err instanceof AbortedError) {
        stderr.write(`drumreel: job ${created.id} keeps running on the server; check it with \`drumreel status ${created.id}\`\n`)
      }
      throw err
    })

    const video = job.video_ready ? await fetchVideo(client, job, ac.signal) : {}
    if (opts.json) {
      printJson(stdout, {
        ...job,
        video_url: video.url ?? null,
        ...(video.error ? { video_error: errorJson(video.error) } : {}),
      })
    } else {
      printJobHuman(stdout, job)
      if (video.url) stdout.write(`video_url:  ${video.url}\n`)
    }
    if (video.error) {
      stderr.write(`${formatError(video.error)} — while fetching the video URL; retry with \`drumreel video ${job.id}\`\n`)
    }
    if (job.status !== 'done') ctx.setCode(EXIT.FAILURE)
    else ctx.setCode(video.error ? exitCodeFor(video.error) : EXIT.OK)
  } finally {
    if (ctx.io.handleSignals) process.removeListener('SIGINT', onSigint)
  }
}

/**
 * True when a failed POST /jobs may still have created the job server-side:
 * request timeout, network failure, 5xx, or Ctrl-C mid-request. (A 429/4xx was rejected outright.)
 */
function maybeCreated(err: unknown): boolean {
  if (err instanceof TimeoutError || err instanceof AbortedError) return true
  if (!(err instanceof DrumreelError)) return false
  return err.code === 'network' || (err.status !== undefined && err.status >= 500)
}

/** GET /jobs/:id/video, tolerating a brief 404 right after video_ready flips. Errors are returned, not swallowed. */
async function fetchVideo(
  client: DrumreelClient,
  job: Job,
  signal: AbortSignal,
): Promise<{ url?: string; error?: unknown }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return { url: (await client.getVideo(job.id, { signal })).url }
    } catch (err) {
      if (err instanceof AbortedError) throw err
      if (err instanceof DrumreelError && err.status === 404 && attempt < 3) {
        await sleep(1000 * (attempt + 1), signal)
        continue
      }
      return { error: err }
    }
  }
}
