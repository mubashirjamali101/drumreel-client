import { startStdioServer } from './server.js'

startStdioServer().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`drumreel mcp: ${msg}\n`)
  process.exit(1)
})
