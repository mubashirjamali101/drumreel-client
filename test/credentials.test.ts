import { chmod, mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { credentialsPath, loadCredentials, resolveApiBase, saveCredentials } from '../src/credentials.js'
import { ConfigError } from '../src/errors.js'
import { tempConfigHome } from './helpers.js'

const mode = async (p: string): Promise<number> => (await stat(p)).mode & 0o777
const posix = process.platform !== 'win32'

describe('saveCredentials', () => {
  it.runIf(posix)('creates a 0700 dir and 0600 file', async () => {
    const env = { XDG_CONFIG_HOME: await tempConfigHome() }
    const path = await saveCredentials({ api_key: 'dr_test_1' }, env)
    expect(await mode(path)).toBe(0o600)
    expect(await mode(join(env.XDG_CONFIG_HOME, 'drumreel'))).toBe(0o700)
    expect(await loadCredentials(env)).toEqual({ api_key: 'dr_test_1' })
  })

  it.runIf(posix)('tightens pre-existing loose permissions on every write', async () => {
    const env = { XDG_CONFIG_HOME: await tempConfigHome() }
    const dir = join(env.XDG_CONFIG_HOME, 'drumreel')
    await mkdir(dir, { recursive: true })
    await chmod(dir, 0o755)
    await writeFile(credentialsPath(env), '{"api_key":"old"}', { mode: 0o644 })
    await chmod(credentialsPath(env), 0o644)
    await saveCredentials({ api_key: 'dr_test_2', api_base: 'https://app.example.com' }, env)
    expect(await mode(credentialsPath(env))).toBe(0o600)
    expect(await mode(dir)).toBe(0o700)
  })
})

describe('resolveApiBase', () => {
  it('prefers --api-base, then DRUMREEL_API_BASE, then the saved base', async () => {
    const env: Record<string, string> = { XDG_CONFIG_HOME: await tempConfigHome() }
    await saveCredentials({ api_key: 'k', api_base: 'https://saved.example.com/' }, env)
    expect(await resolveApiBase(undefined, env)).toBe('https://saved.example.com')
    env['DRUMREEL_API_BASE'] = 'https://env.example.com'
    expect(await resolveApiBase(undefined, env)).toBe('https://env.example.com')
    expect(await resolveApiBase('https://flag.example.com', env)).toBe('https://flag.example.com')
  })

  it('fails with a clear ConfigError when nothing is configured (no default host)', async () => {
    const env = { XDG_CONFIG_HOME: await tempConfigHome() }
    const err = await resolveApiBase(undefined, env).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConfigError)
    expect((err as Error).message).toMatch(/--api-base.*DRUMREEL_API_BASE.*login/)
    expect((err as Error).message).not.toMatch(/api\.drumreel\.com/)
  })

  it('refuses plain http:// except loopback', async () => {
    const env = { XDG_CONFIG_HOME: await tempConfigHome() }
    await expect(resolveApiBase('http://evil.example.com', env)).rejects.toMatchObject({ code: 'insecure_api_base' })
    await expect(resolveApiBase('http://localhost:3000/', env)).resolves.toBe('http://localhost:3000')
    await expect(resolveApiBase('http://127.0.0.1:3000', env)).resolves.toBe('http://127.0.0.1:3000')
    await expect(resolveApiBase('http://[::1]:3000', env)).resolves.toBe('http://[::1]:3000')
  })
})
