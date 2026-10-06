import { ConfigError } from './errors.js'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export const API_BASE_HELP =
  'Set it with --api-base <url>, the DRUMREEL_API_BASE env var, or `drumreel login --api-base <url>` ' +
  '(e.g. https://<your-drumreel-app-host>). There is no built-in default host.'

/**
 * Validate and normalize an API base URL (no trailing slash).
 * Requires https://, except plain http:// on localhost / 127.0.0.1 / ::1 for local development.
 */
export function normalizeApiBase(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') throw new ConfigError(`Drumreel API base is empty. ${API_BASE_HELP}`, 'missing_api_base')
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new ConfigError(`Invalid Drumreel API base: ${JSON.stringify(trimmed)}. ${API_BASE_HELP}`, 'invalid_api_base')
  }
  if (url.username || url.password) {
    throw new ConfigError('Drumreel API base must not embed credentials; use an API key instead.', 'invalid_api_base')
  }
  if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new ConfigError(
      `Refusing plain http:// API base ${url.origin}: API keys would be sent unencrypted. ` +
        'Use https:// (http:// is only allowed for localhost, 127.0.0.1 and ::1).',
      'insecure_api_base',
    )
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError(`Unsupported API base protocol ${url.protocol} (use https://).`, 'invalid_api_base')
  }
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}
