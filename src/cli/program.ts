import { Command, CommanderError } from 'commander'
import { pkgVersion } from '../version.js'
import { registerAuth } from './commands/auth.js'
import { registerJobs } from './commands/jobs.js'
import { registerRun } from './commands/run.js'
import { registerSetup } from './commands/setup.js'
import type { CliIo, Ctx } from './context.js'
import { EXIT, exitCodeFor, formatError } from './exit-codes.js'

export function buildProgram(ctx: Ctx): Command {
  const program = new Command()
    .name('drumreel')
    .description('Thin client for Drumreel hosted walkthrough jobs (API only)')
    .version(pkgVersion())
    .option('--api-base <url>', 'API host (overrides DRUMREEL_API_BASE and the base saved by `login`; required)')
    .exitOverride()
    .configureOutput({
      writeOut: (s) => void ctx.io.stdout.write(s),
      writeErr: (s) => void ctx.io.stderr.write(s),
    })
  registerAuth(program, ctx)
  registerRun(program, ctx)
  registerJobs(program, ctx)
  registerSetup(program, ctx)
  return program
}

/** Run the CLI and resolve to a process exit code (see EXIT). Never calls process.exit. */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  let code: number = EXIT.OK
  const program = buildProgram({ io, setCode: (c) => (code = c) })
  try {
    await program.parseAsync(argv, { from: 'user' })
    return code
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode === 0 ? EXIT.OK : EXIT.USAGE
    io.stderr.write(`${formatError(err)}\n`)
    return exitCodeFor(err)
  }
}
