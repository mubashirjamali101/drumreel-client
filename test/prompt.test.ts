import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { promptSecret } from '../src/cli/prompt.js'
import { AbortedError } from '../src/errors.js'

function fakeTty() {
  const input = new PassThrough() as unknown as NodeJS.ReadStream & { rawCalls: boolean[] }
  input.isTTY = true
  input.rawCalls = []
  input.setRawMode = (mode: boolean) => {
    input.rawCalls.push(mode)
    return input
  }
  let echoed = ''
  return { input, output: { write: (s: string) => (echoed += s) }, echoed: () => echoed }
}

describe('promptSecret', () => {
  it('masks typed characters and handles backspace on a TTY', async () => {
    const t = fakeTty()
    const p = promptSecret('Key: ', t.input, t.output)
    t.input.write('dr_test_abX\u007fc\r')
    await expect(p).resolves.toBe('dr_test_abc')
    expect(t.echoed()).not.toContain('dr_test')
    expect(t.echoed()).toContain('*')
    expect(t.input.rawCalls).toEqual([true, false])
  })

  it('rejects on Ctrl-C', async () => {
    const t = fakeTty()
    const p = promptSecret('Key: ', t.input, t.output)
    t.input.write('\u0003')
    await expect(p).rejects.toBeInstanceOf(AbortedError)
  })

  it('reads the first line when stdin is piped', async () => {
    const input = new PassThrough() as unknown as NodeJS.ReadStream
    const p = promptSecret('Key: ', input, { write: () => true })
    ;(input as unknown as PassThrough).end('dr_live_xyz\nignored\n')
    await expect(p).resolves.toBe('dr_live_xyz')
  })
})
