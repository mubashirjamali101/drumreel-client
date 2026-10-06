import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('SKILL.md', () => {
  it('docs/SKILL.md is identical to the canonical root SKILL.md', async () => {
    const root = await readFile(new URL('../SKILL.md', import.meta.url), 'utf8')
    const docs = await readFile(new URL('../docs/SKILL.md', import.meta.url), 'utf8')
    expect(docs).toBe(root)
  })
})
