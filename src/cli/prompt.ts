import { createInterface } from 'node:readline'
import { AbortedError } from '../errors.js'
import type { Out } from './context.js'

/**
 * Read a secret without echoing it. On a TTY, input is read in raw mode and each
 * character is shown as `*`. When stdin is piped, the first line is read.
 */
export async function promptSecret(question: string, input: NodeJS.ReadStream, output: Out): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== 'function') return readFirstLine(input)

  output.write(question)
  return new Promise<string>((resolve, reject) => {
    let value = ''
    const finish = (err?: Error): void => {
      input.setRawMode(false)
      input.pause()
      input.removeListener('data', onData)
      output.write('\n')
      if (err) reject(err)
      else resolve(value.trim())
    }
    const onData = (chunk: Buffer | string): void => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') return finish()
        if (ch === '\u0003') return finish(new AbortedError('Login cancelled'))
        if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1)
            output.write('\b \b')
          }
          continue
        }
        if (ch >= ' ') {
          value += ch
          output.write('*')
        }
      }
    }
    input.setRawMode(true)
    input.on('data', onData)
    input.resume()
  })
}

async function readFirstLine(input: NodeJS.ReadableStream): Promise<string> {
  const rl = createInterface({ input, terminal: false })
  try {
    for await (const line of rl) return line.trim()
    return ''
  } finally {
    rl.close()
  }
}
