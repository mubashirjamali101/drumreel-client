import { runCli } from './program.js'

runCli(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  env: process.env,
  handleSignals: true,
}).then(
  (code) => {
    process.exitCode = code
  },
  (err: unknown) => {
    process.stderr.write(`drumreel: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  },
)
