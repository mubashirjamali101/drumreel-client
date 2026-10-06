import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const read = (rel: string): Promise<string> => readFile(new URL(rel, import.meta.url), 'utf8')
const exitTable = (md: string): string | undefined => /\| Code \| Meaning \|\n(?:\|.*\|\n)+/.exec(md)?.[0]

describe('SKILL.md', () => {
  it('docs/SKILL.md is identical to the canonical root SKILL.md', async () => {
    expect(await read('../docs/SKILL.md')).toBe(await read('../SKILL.md'))
  })

  it('README exit-code table matches SKILL.md exactly', async () => {
    const skill = exitTable(await read('../SKILL.md'))
    expect(skill).toBeDefined()
    expect(exitTable(await read('../README.md'))).toBe(skill)
  })
})
