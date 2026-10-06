import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { CredentialsFile } from './types.js'

/** XDG-aware config dir for drumreel credentials. */
export function configDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME']
  if (xdg && xdg.length > 0) return join(xdg, 'drumreel')
  return join(homedir(), '.config', 'drumreel')
}

export function credentialsPath(): string {
  return join(configDir(), 'credentials.json')
}

export async function loadCredentials(): Promise<CredentialsFile | null> {
  try {
    const raw = await readFile(credentialsPath(), 'utf8')
    const parsed = JSON.parse(raw) as CredentialsFile
    if (typeof parsed.api_key !== 'string' || parsed.api_key.length === 0) return null
    return parsed
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    throw err
  }
}

export async function saveCredentials(creds: CredentialsFile): Promise<string> {
  const path = credentialsPath()
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 })
  return path
}

export async function clearCredentials(): Promise<boolean> {
  try {
    await rm(credentialsPath(), { force: true })
    return true
  } catch {
    return false
  }
}

/** Resolve API key: env wins, then credentials file. */
export async function resolveApiKey(explicit?: string): Promise<string | undefined> {
  if (explicit) return explicit
  const fromEnv = process.env['DRUMREEL_API_KEY']
  if (fromEnv && fromEnv.length > 0) return fromEnv
  const file = await loadCredentials()
  return file?.api_key
}

export const DEFAULT_API_BASE = 'https://api.drumreel.com'

/** Resolve API base host (no /api/v1 suffix). Env DRUMREEL_API_BASE, credentials, or default. */
export async function resolveApiBase(explicit?: string): Promise<string> {
  if (explicit) return stripTrailingSlash(explicit)
  const fromEnv = process.env['DRUMREEL_API_BASE']
  if (fromEnv && fromEnv.length > 0) return stripTrailingSlash(fromEnv)
  const file = await loadCredentials()
  if (file?.api_base) return stripTrailingSlash(file.api_base)
  return DEFAULT_API_BASE
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '')
}
