import type { Command } from 'commander'
import { DrumreelClient } from '../client.js'
import { resolveApiBase, resolveApiKey } from '../credentials.js'
import { AuthError } from '../errors.js'

export interface Out {
  write(s: string): unknown
}

/** Everything the CLI touches from the outside world — injectable for tests. */
export interface CliIo {
  stdout: Out
  stderr: Out
  stdin?: NodeJS.ReadStream
  env: Record<string, string | undefined>
  fetch?: typeof globalThis.fetch
  /** Install a SIGINT handler during `run` (true for the real binary). */
  handleSignals?: boolean
  /** Client tuning overrides (tests use tiny delays). */
  clientDefaults?: { requestTimeoutMs?: number; retries?: number; retryBaseMs?: number; retryMaxMs?: number }
}

export interface Ctx {
  io: CliIo
  setCode(code: number): void
}

export function globalApiBase(cmd: Command): string | undefined {
  return (cmd.optsWithGlobals() as { apiBase?: string }).apiBase
}

export async function makeClient(ctx: Ctx, cmd: Command): Promise<DrumreelClient> {
  const { env, fetch } = ctx.io
  const apiKey = await resolveApiKey(undefined, env)
  if (!apiKey) throw new AuthError()
  const apiBase = await resolveApiBase(globalApiBase(cmd), env)
  return new DrumreelClient({ apiKey, apiBase, fetch, ...ctx.io.clientDefaults })
}
