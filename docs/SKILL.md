# Drumreel agent skill (docs copy)

Identical guidance to the root [`SKILL.md`](../SKILL.md). Keep both in sync.

## Hard constraints for agents

1. Install / invoke **`drumreel`** from [mubashirjamali101/drumreel-client](https://github.com/mubashirjamali101/drumreel-client) (npm package name `drumreel` when published).
2. **Never** clone or depend on the private Drumreel recorder.
3. Send **url + prompt** only; poll job status; fetch share/video URLs.
4. No local browser automation, no YAML scenarios, no `run:` / `eval:` / `${env:}`.

## Commands

| Command | Purpose |
|---------|---------|
| `drumreel login` / `logout` | Store or clear API key under XDG/`~/.config/drumreel/` |
| `drumreel run --url … --prompt …` | Create + poll job |
| `drumreel jobs` | List |
| `drumreel status <id>` | Get job |
| `drumreel video <id>` | Signed video URL |
| `drumreel rerun <id> [--mode full\|script]` | New job from prior |
| `drumreel setup --agent` | MCP config snippet |
| `drumreel mcp` | MCP stdio |

## MCP tools

Same HTTP surface as the CLI: create / get / list / video / rerun.
