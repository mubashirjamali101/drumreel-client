import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { pkgVersion } from '../version.js'
import { type ClientFactory, registerTools } from './tools.js'

const INSTRUCTIONS = `Drumreel thin client MCP — hosted walkthrough jobs via Agent API v1 only.
Use these tools for prompt+url jobs; use drumreel_wait_for_job to block until a job finishes.
Never clone the private recorder.
Never attempt local Playwright, scenario YAML, run:/eval:, or offline rehearse/render.`

export function createServer(makeClient?: ClientFactory): McpServer {
  const server = new McpServer(
    { name: 'drumreel', version: pkgVersion() },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  )
  registerTools(server, makeClient)
  return server
}

export async function startStdioServer(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  await new Promise<void>((resolve) => {
    process.stdin.on('close', resolve)
  })
}
