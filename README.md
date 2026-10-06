# drumreel (public thin client)

> **npm package:** `drumreel` · **repo:** [mubashirjamali101/drumreel-client](https://github.com/mubashirjamali101/drumreel-client)

Thin CLI + MCP client for **hosted** Drumreel walkthrough jobs. Talks HTTP to the SaaS Agent API v1 only.

**This package is API-only.** It does **not** bundle Playwright, does **not** run scenario YAML, and does **not** rehearse/record/render offline. Agents must use this package — never clone or install the private recorder.

> **Publish status:** not on npm yet. Publishing (and reserving the `drumreel` name) is done manually by the maintainer — there is no automated publish workflow. Until then, install from git.

## Install

```bash
npx -y drumreel --help      # once published
npm install -g drumreel     # once published
```

### From this repo (today)

```bash
git clone https://github.com/mubashirjamali101/drumreel-client.git
cd drumreel-client
npm ci
npm run build
node dist/cli.js --help
# optional: npm link
```

Requires Node.js ≥ 20.3.

## Configure

### API base (required — no default)

The client has **no built-in default host**. It resolves the API base from, in order:

1. `--api-base <url>`
2. `DRUMREEL_API_BASE`
3. the base saved by `drumreel login --api-base <url>`

If none is set, commands exit with code `2` and explain how to set it. Paths are under `<base>/api/v1/...`.
`https://` is required; plain `http://` is accepted only for `localhost`, `127.0.0.1` and `::1`.

### API key

Keys look like `dr_live_…` (production) or `dr_test_…` (sandbox) and are sent only as `Authorization: Bearer <key>`.

```bash
drumreel login --api-base https://<your-drumreel-app-host>
# key is read with a hidden prompt (or from piped stdin) and stored in
# $XDG_CONFIG_HOME/drumreel/credentials.json (default ~/.config/drumreel/), dir 0700 / file 0600

# or:
export DRUMREEL_API_KEY=dr_test_…
export DRUMREEL_API_BASE=https://<your-drumreel-app-host>
```

## CLI

```bash
drumreel login [--api-base <url>]
drumreel logout

drumreel run --url https://example.com --prompt "Show me how to sign up" [--voice] [--json] [--timeout 30m] [--poll-ms 2000]
drumreel jobs [--limit 1-100] [--cursor <c>] [--json]
drumreel status <id> [--json]
drumreel video <id> [--json]          # HTTP 404 / exit 5 until the video is ready
drumreel rerun <id> [--mode full|script] [--json]

drumreel setup --agent    # MCP config snippet for Claude Code / Codex
drumreel mcp              # stdio MCP server
```

`run` creates a job, polls until `done` / `error`, then prints `share_url` and a signed video URL.
If `--timeout` passes, it exits `7` and the job keeps running server-side (`drumreel status <id>`).
If creating the job itself times out (`7`) or fails with a network / 5xx error (`8`), the job may already exist — check `drumreel jobs --limit 5` before retrying to avoid a duplicate.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success (`run`: job `done` and video URL fetched) |
| 1 | `run`: job finished with status `error`; or unexpected failure |
| 2 | Usage / config: bad flag, invalid `--limit`/`--timeout`, missing or insecure API base |
| 3 | Not authenticated: HTTP 401 or no API key |
| 4 | Forbidden: HTTP 403 (key valid, action not allowed) |
| 5 | Not found: HTTP 404 (unknown job, or video not ready yet) |
| 6 | Other API 4xx (validation, conflict, …) |
| 7 | Timeout: per-request timeout or `run --timeout` deadline |
| 8 | Unavailable: 408 / 429 / 5xx / network error after retries — retry later |
| 130 | Interrupted (Ctrl-C) |

Errors print to stderr as `drumreel: <message> (HTTP <status>, code: <server code>)`.

### Rate limits, retries and timeouts

- Each request times out after 30 s.
- `GET`s retry `408/429/5xx`, network errors and timeouts (3 retries, exponential backoff + jitter). `POST`s retry only `429`, so a job is never created twice.
- `Retry-After` (seconds or HTTP-date) is honored; waits longer than 60 s are not slept — the command fails with exit `8`.
- While `run` / `drumreel_wait_for_job` is waiting, transient errors never end the wait early; polling backs off (2 s → 15 s while status is unchanged) until the overall deadline.

## MCP

```bash
drumreel setup --agent    # snippet uses: npx -y drumreel mcp
drumreel mcp
```

| Tool | Maps to |
|------|---------|
| `drumreel_create_job` | `POST /api/v1/jobs` |
| `drumreel_get_job` | `GET /api/v1/jobs/:id` |
| `drumreel_wait_for_job` | polls `GET /api/v1/jobs/:id` until `done`/`error` (`timeout_seconds`, default 300, max 3600) |
| `drumreel_list_jobs` | `GET /api/v1/jobs` |
| `drumreel_get_video` | `GET /api/v1/jobs/:id/video` |
| `drumreel_rerun_job` | `POST /api/v1/jobs/:id/rerun` |

Errors come back as `isError: true` with `{"error": {"message", "status", "code", "retry_after_ms"?, "retryable"}}`.

## Agent skill

See [`SKILL.md`](./SKILL.md) (canonical; [`docs/SKILL.md`](./docs/SKILL.md) is an identical copy kept in sync by a test). **Use this package only** for Drumreel jobs.

## Library

```ts
import { DrumreelClient, waitForJob } from 'drumreel'

const client = new DrumreelClient({
  apiKey: process.env.DRUMREEL_API_KEY!,
  apiBase: process.env.DRUMREEL_API_BASE!, // required, e.g. https://<your-drumreel-app-host>
})

const { id } = await client.createJob({ url: 'https://example.com', prompt: 'Show signup' })
const job = await waitForJob(client, id, { timeoutMs: 20 * 60_000, signal: AbortSignal.timeout(25 * 60_000) })
```

## Develop

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Tests mock `fetch` against the Agent API v1 contract. No live staging required. CI runs the same steps on Node 20 and 22.

## Explicit non-goals

- No Playwright / Chromium
- No offline record / rehearse / render
- No scenario YAML execution
- No `run:` / `eval:` / `${env:…}`
- Private recorder is **never** a dependency or documented install path

## License

MIT
