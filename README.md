# drumreel (public thin client)

> **npm package:** `drumreel` · **repo:** [mubashirjamali101/drumreel-client](https://github.com/mubashirjamali101/drumreel-client)

Thin CLI + MCP client for **hosted** Drumreel walkthrough jobs. Talks HTTP to the SaaS Agent API v1 only.

**This package is API-only.** It does **not** bundle Playwright, does **not** run scenario YAML, and does **not** rehearse/record/render offline. Agents must use this package — never clone or install the private recorder.

> **Publish status:** not on npm yet. Install from git or a local build until GM approves `npm publish`.

## Install (when published)

```bash
npm install -g drumreel
# or
npx drumreel --help
```

### From this repo (today)

```bash
git clone https://github.com/mubashirjamali101/drumreel-client.git
cd drumreel-client
npm install
npm run build
node dist/cli.js --help
# optional: npm link
```

## Auth

API keys look like `dr_live_…` (production) or `dr_test_…` (sandbox).

```bash
drumreel login
# stores ~/.config/drumreel/credentials.json (or $XDG_CONFIG_HOME/drumreel/)

# or:
export DRUMREEL_API_KEY=dr_test_…
export DRUMREEL_API_BASE=https://api.drumreel.com   # optional override
```

Send as `Authorization: Bearer <key>` or `X-Api-Key` (the client sends both).

Default API host: `https://api.drumreel.com` (override with `DRUMREEL_API_BASE` or `--api-base`). Paths are under `/api/v1/...`.

## CLI

```bash
drumreel login
drumreel logout

drumreel run --url https://example.com --prompt "Show me how to sign up" [--voice] [--json]
drumreel jobs [--json]
drumreel status <id> [--json]
drumreel video <id> [--json]
drumreel rerun <id> [--mode full|script] [--json]

drumreel setup --agent    # MCP config snippet for Claude Code / Codex
drumreel mcp              # stdio MCP server
```

`run` creates a job, polls until `done` / `error`, then prints `share_url` and a signed video URL when ready.

## MCP

```bash
drumreel setup --agent
drumreel mcp
```

Tools (same HTTP surface):

| Tool | Maps to |
|------|---------|
| `drumreel_create_job` | `POST /api/v1/jobs` |
| `drumreel_get_job` | `GET /api/v1/jobs/:id` |
| `drumreel_list_jobs` | `GET /api/v1/jobs` |
| `drumreel_get_video` | `GET /api/v1/jobs/:id/video` |
| `drumreel_rerun_job` | `POST /api/v1/jobs/:id/rerun` |

## Agent skill

See [`SKILL.md`](./SKILL.md) and [`docs/SKILL.md`](./docs/SKILL.md). **Use this package only** for Drumreel jobs.

## Library

```ts
import { DrumreelClient, waitForJob } from 'drumreel'

const client = new DrumreelClient({
  apiKey: process.env.DRUMREEL_API_KEY!,
  apiBase: process.env.DRUMREEL_API_BASE ?? 'https://api.drumreel.com',
})

const { id } = await client.createJob({
  url: 'https://example.com',
  prompt: 'Show signup',
})
const job = await waitForJob(client, id)
```

## Develop

```bash
npm install
npm test
npm run typecheck
npm run build
```

Tests mock `fetch` against the Agent API v1 contract. No live staging required.

## Explicit non-goals

- No Playwright / Chromium
- No offline record / rehearse / render
- No scenario YAML execution
- No `run:` / `eval:` / `${env:…}`
- Private recorder is **never** a dependency or documented install path

## License

MIT
