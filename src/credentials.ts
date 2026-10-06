import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { API_BASE_HELP, normalizeApiBase } from './api-base.js'
import { ConfigError } from './errors.js'
import type { CredentialsFile } from './types.js'

type Env = Record<string, string | undefined>

const DIR_MODE = 0o700
const FILE_MODE = 0o600

/** XDG-aware config dir for drumreel credentials. */
export function configDir(env: Env = process.env): string {
  const xdg = env['XDG_CONFIG_HOME']
  if (xdg && xdg.length > 0) return join(xdg, 'drumreel')
  return join(homedir(), '.config', 'drumreel')
}

export function credentialsPath(env: Env = process.env): string {
  return join(configDir(env), 'credentials.json')
}

export async function loadCredentials(env: Env = process.env): Promise<CredentialsFile | null> {
  let raw: string
  try {
    raw = await readFile(credentialsPath(env), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  let parsed: CredentialsFile
  try {
    parsed = JSON.parse(raw) as CredentialsFile
  } catch {
    throw new ConfigError(`Credentials file ${credentialsPath(env)} is not valid JSON; run \`drumreel login\` again.`)
  }
  if (typeof parsed.api_key !== 'string' || parsed.api_key.length === 0) return null
  return parsed
}

/**
 * Write credentials with 0700 dir / 0600 file on every write. The file is written to a
 * temp path and renamed, and both are chmod-ed explicitly so pre-existing, looser
 * permissions are tightened too.
 */
export async function saveCredentials(creds: CredentialsFile, env: Env = process.env): Promise<string> {
  const path = credentialsPath(env)
  const dir = dirname(path)
  await mkdir(dir, { recursive: true, mode: DIR_MODE })
  await chmod(dir, DIR_MODE)
  const tmp = `${path}.${process.pid}.tmp`
  try {
    await writeFile(tmp, `${JSON.stringify(creds, null, 2)}\n`, { mode: FILE_MODE })
    await chmod(tmp, FILE_MODE)
    await rename(tmp, path)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
  await chmod(path, FILE_MODE)
  return path
}

export async function clearCredentials(env: Env = process.env): Promise<boolean> {
  try {
    await rm(credentialsPath(env), { force: true })
    return true
  } catch {
    return false
  }
}

/** Resolve API key: explicit, then DRUMREEL_API_KEY, then credentials file. */
export async function resolveApiKey(explicit?: string, env: Env = process.env): Promise<string | undefined> {
  if (explicit) return explicit
  const fromEnv = env['DRUMREEL_API_KEY']
  if (fromEnv && fromEnv.length > 0) return fromEnv
  const file = await loadCredentials(env)
  return file?.api_key
}

/**
 * Resolve the API base (no /api/v1 suffix): `--api-base` > DRUMREEL_API_BASE > base saved at login.
 * There is deliberately no default host; throws ConfigError when none is configured or it is unsafe.
 */
export async function resolveApiBase(explicit?: string, env: Env = process.env): Promise<string> {
  if (explicit) return normalizeApiBase(explicit)
  const fromEnv = env['DRUMREEL_API_BASE']
  if (fromEnv && fromEnv.length > 0) return normalizeApiBase(fromEnv)
  const file = await loadCredentials(env)
  if (file?.api_base) return normalizeApiBase(file.api_base)
  throw new ConfigError(`No Drumreel API base configured. ${API_BASE_HELP}`, 'missing_api_base')
}
