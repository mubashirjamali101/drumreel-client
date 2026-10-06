import type { Command } from 'commander'
import { resolveApiBase } from '../../credentials.js'
import { type Ctx, globalApiBase } from '../context.js'
import { EXIT } from '../exit-codes.js'

const PLACEHOLDER_BASE = 'https://<your-drumreel-app-host>'

export function registerSetup(program: Command, ctx: Ctx): void {
  const out = ctx.io.stdout

  program
    .command('setup')
    .description('Print agent / MCP setup helpers')
    .option('--agent', 'Print MCP config snippet for Claude Code / Codex')
    .action(async (opts: { agent?: boolean }, cmd: Command) => {
      if (!opts.agent) {
        out.write(
          'Thin client — no local browser/ffmpeg setup.\n' +
            '  1. npx -y drumreel --help   # or: npm install -g drumreel (once published)\n' +
            '  2. drumreel login --api-base https://<your-drumreel-app-host>\n' +
            '  3. drumreel setup --agent   # MCP snippet\n',
        )
        ctx.setCode(EXIT.OK)
        return
      }
      const apiBase = await resolveApiBase(globalApiBase(cmd), ctx.io.env).catch(() => undefined)
      const snippet = {
        mcpServers: {
          drumreel: {
            command: 'npx',
            args: ['-y', 'drumreel', 'mcp'],
            env: { DRUMREEL_API_KEY: 'dr_live_YOUR_KEY', DRUMREEL_API_BASE: apiBase ?? PLACEHOLDER_BASE },
          },
        },
      }
      out.write('# Claude Code / Codex MCP config snippet\n')
      out.write('# Paste under mcpServers (or merge with existing).\n')
      out.write('# Prefer credentials from `drumreel login` when DRUMREEL_API_KEY is unset.\n')
      if (!apiBase) out.write('# DRUMREEL_API_BASE is required — replace the placeholder with your Drumreel app host.\n')
      out.write(`\n${JSON.stringify(snippet, null, 2)}\n`)
      out.write('\n# Or run the stdio server directly after a local build:\n#   node dist/mcp.js   (same as: drumreel mcp)\n')
      ctx.setCode(EXIT.OK)
    })

  program
    .command('mcp')
    .description('Start MCP stdio server (HTTP tools only)')
    .action(async () => {
      const { startStdioServer } = await import('../../mcp/server.js')
      await startStdioServer()
      ctx.setCode(EXIT.OK)
    })
}
