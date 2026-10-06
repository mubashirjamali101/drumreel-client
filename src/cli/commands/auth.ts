import type { Command } from 'commander'
import { normalizeApiBase } from '../../api-base.js'
import { clearCredentials, loadCredentials, saveCredentials } from '../../credentials.js'
import { ConfigError } from '../../errors.js'
import { type Ctx, globalApiBase } from '../context.js'
import { EXIT } from '../exit-codes.js'
import { promptSecret } from '../prompt.js'

export function registerAuth(program: Command, ctx: Ctx): void {
  const { io } = ctx

  program
    .command('login')
    .description('Store API key (and optionally API base) in ~/.config/drumreel/credentials.json (or XDG)')
    .option('--key <apiKey>', 'API key (visible in shell history — prefer the hidden prompt or piping via stdin)')
    .option('--api-base <url>', 'API base to store with the key, e.g. https://<your-drumreel-app-host>')
    .action(async (opts: { key?: string; apiBase?: string }, cmd: Command) => {
      const rawBase = opts.apiBase ?? globalApiBase(cmd)
      const apiBase = rawBase ? normalizeApiBase(rawBase) : undefined

      let key = opts.key?.trim()
      if (!key) {
        const stdin = io.stdin ?? process.stdin
        key = await promptSecret('API key (dr_live_… / dr_test_…): ', stdin, io.stderr)
      }
      if (!key) throw new ConfigError('Empty API key', 'usage')
      if (!key.startsWith('dr_live_') && !key.startsWith('dr_test_')) {
        io.stderr.write('drumreel: warning — key does not start with dr_live_ or dr_test_\n')
      }

      const existing = await loadCredentials(io.env).catch(() => null)
      const savedBase = apiBase ?? existing?.api_base
      const path = await saveCredentials({ api_key: key, ...(savedBase ? { api_base: savedBase } : {}) }, io.env)
      io.stdout.write(`Saved credentials to ${path}\n`)
      if (!savedBase && !io.env['DRUMREEL_API_BASE']) {
        io.stderr.write(
          'drumreel: note — no API base saved. Re-run with --api-base <url> or set DRUMREEL_API_BASE before other commands.\n',
        )
      }
      ctx.setCode(EXIT.OK)
    })

  program
    .command('logout')
    .description('Remove stored API credentials')
    .action(async () => {
      await clearCredentials(io.env)
      io.stdout.write('Logged out (credentials removed)\n')
      ctx.setCode(EXIT.OK)
    })
}
