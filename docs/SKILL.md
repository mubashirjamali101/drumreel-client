# Drumreel (public thin client) — agent skill

> Canonical copy. `docs/SKILL.md` must stay byte-identical (enforced by `test/skill-sync.test.ts`).

## Rule (hard)

Use **only** the public npm package / repo **`drumreel`** ([mubashirjamali101/drumreel-client](https://github.com/mubashirjamali101/drumreel-client)).

- **Do not** clone, install, or document the private recorder repository.
- **Do not** add Playwright, scenario YAML runners, or offline rehearse/record/render.
- No `run:` / `eval:` / `${env:…}`. Hosted jobs accept **prompt + url only** via Agent API v1.

## Install

```bash
npx -y drumreel --help          # once published to npm
npm install -g drumreel          # once published to npm

# until then, from source:
git clone https://github.com/mubashirjamali101/drumreel-client.git
cd drumreel-client && npm ci && npm run build && node dist/cli.js --help
```

## Configure (API base is required)

There is **no built-in default host**. Set the API base one of these ways (highest priority first):

1. `--api-base <url>` flag
2. `DRUMREEL_API_BASE` env var
3. base saved by `drumreel login --api-base <url>`

```bash
drumreel login --api-base https://<your-drumreel-app-host>   # hidden key prompt, saves 0600 file
# or
export DRUMREEL_API_KEY=dr_live_…   # or dr_test_…
export DRUMREEL_API_BASE=https://<your-drumreel-app-host>
```

`https://` is required; plain `http://` is only accepted for `localhost`, `127.0.0.1` and `::1`.
Credentials live in `$XDG_CONFIG_HOME/drumreel/credentials.json` (default `~/.config/drumreel/`), dir `0700`, file `0600`.

## Typical flow

```bash
drumreel run --url https://example.com --prompt "Walk through signup" --json [--timeout 20m]
drumreel status <id> --json
drumreel video <id> --json      # exit 5 (HTTP 404) until video_ready is true
drumreel jobs --limit 20 --json
drumreel rerun <id> --mode script --json
```

`run` creates a job, polls until `done` / `error`, then fetches the signed video URL.
If `--timeout` (default `30m`) passes, `run` exits `7`; the job **keeps running** server-side — check it with `drumreel status <id>`.
If creating the job itself times out (`7`) or fails with a network / 5xx error (`8`), the job **may already exist** — check `drumreel jobs --limit 5` before retrying to avoid a duplicate.

## Exit codes

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

## Rate limits, retries, timeouts

- Every request has a 30 s timeout.
- `GET` requests retry `408/429/5xx`, network errors and timeouts up to 3 times with exponential backoff + jitter; `POST` (create/rerun) only retries `429`, so jobs are never duplicated.
- `Retry-After` (seconds or HTTP-date) is honored; if it asks for more than 60 s the CLI stops and exits `8`.
- While waiting for a job, transient errors never abort the wait: polling backs off (2 s growing to 15 s while status is unchanged; error backoff up to 60 s or `Retry-After`) until the deadline.

## MCP

```bash
drumreel setup --agent   # prints snippet: npx -y drumreel mcp + DRUMREEL_API_KEY / DRUMREEL_API_BASE
drumreel mcp             # stdio server
```

| Tool | Maps to |
|------|---------|
| `drumreel_create_job` | `POST /api/v1/jobs` |
| `drumreel_get_job` | `GET /api/v1/jobs/:id` |
| `drumreel_wait_for_job` | polls `GET /api/v1/jobs/:id` until `done`/`error` (`timeout_seconds`, default 300, max 3600) |
| `drumreel_list_jobs` | `GET /api/v1/jobs` |
| `drumreel_get_video` | `GET /api/v1/jobs/:id/video` (404 until video ready) |
| `drumreel_rerun_job` | `POST /api/v1/jobs/:id/rerun` |

Tool failures return `isError: true` with `{"error": {"message", "status", "code", "retry_after_ms"?, "retryable"}}`.
On timeout, `drumreel_wait_for_job` returns code `timeout` plus the last seen `job`; call it again to keep waiting.

## API (summary)

Base: `<api base>/api/v1` · Auth: `Authorization: Bearer dr_live_…|dr_test_…` (only header sent)
Statuses: `queued|exploring|authoring|validating|recording|uploading|done|error`

- `POST /jobs` `{url, prompt, options?: {model?, enable_voiceover?}}` → `{id, status}`
- `GET /jobs/:id` → `{id, status, phase, error?, share_url?, video_ready, progress?, created_at, updated_at}`
- `GET /jobs?cursor=&limit=` → `{items, next_cursor?}`
- `GET /jobs/:id/video` → `{url, expires_at}` (404 before ready)
- `POST /jobs/:id/rerun` `{mode: full|script}` → `{id, status}`
