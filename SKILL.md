# Drumreel (public thin client) — agent skill

## Rule (hard)

Use **only** the public npm package / repo **`drumreel`** (`mubashirjamali101/drumreel-client`).

- **Do not** clone, install, or document the private recorder repository.
- **Do not** add Playwright, scenario YAML runners, or offline rehearse/record/render.
- Hosted jobs accept **prompt + url only** via Agent API v1.

## Install

```bash
# when published:
npm install -g drumreel

# until publish:
git clone https://github.com/mubashirjamali101/drumreel-client.git
cd drumreel-client && npm install && npm run build
```

## Auth

```bash
drumreel login
# or export DRUMREEL_API_KEY=dr_live_… / dr_test_…
# optional: DRUMREEL_API_BASE=https://api.drumreel.com
```

## Typical flow

```bash
drumreel run --url https://example.com --prompt "Walk through signup" --json
drumreel status <id> --json
drumreel video <id> --json
```

## MCP

```bash
drumreel setup --agent   # paste snippet into Claude Code / Codex
drumreel mcp             # stdio server
```

Tools: `drumreel_create_job`, `drumreel_get_job`, `drumreel_list_jobs`, `drumreel_get_video`, `drumreel_rerun_job`.

## API (summary)

Base: `https://<host>/api/v1`  
Auth: `Authorization: Bearer <key>` or `X-Api-Key`  
Statuses: `queued|exploring|authoring|validating|recording|uploading|done|error`

See README for full contract.
