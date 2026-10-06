import { ConfigError } from '../errors.js'

export const MAX_LIST_LIMIT = 100

const UNITS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }

/** Parse "1500ms", "90s", "10m", "1h" (bare numbers are seconds) into ms. */
export function parseDuration(raw: string, flag = '--timeout'): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)?\s*$/i.exec(raw)
  const unit = UNITS[(m?.[2] ?? 's').toLowerCase()]
  const ms = m && unit ? Math.round(Number(m[1]) * unit) : NaN
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new ConfigError(`${flag} must be a positive duration like 90s, 10m or 1h (got ${JSON.stringify(raw)})`, 'usage')
  }
  return ms
}

/** Parse a positive integer flag within [1, max]. */
export function parsePositiveInt(raw: string, flag: string, max = Number.MAX_SAFE_INTEGER): number {
  const n = /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN
  if (!Number.isSafeInteger(n) || n < 1 || n > max) {
    throw new ConfigError(`${flag} must be an integer between 1 and ${max} (got ${JSON.stringify(raw)})`, 'usage')
  }
  return n
}

export function parseLimit(raw: string): number {
  return parsePositiveInt(raw, '--limit', MAX_LIST_LIMIT)
}
