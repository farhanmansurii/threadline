# Runtime Adapters

Threadline supports multiple agent runtimes through adapters.

## Claude Code

Owns:

- `~/.claude/skills`
- `~/.claude/commands`
- `~/.claude/settings.json`
- hooks where approved

## Codex

Owns:

- `~/.codex/skills`
- `~/.codex/config.toml`
- `.codex/config.toml` only when repo materialization is explicitly requested

## Cursor

Planned:

- `.cursor/rules`
- local project context pointer
- optional generated rules from the project profile

## OpenCode

Planned:

- config/rules adapter once the target config surface is selected

## Kimi

Planned:

- one-time knowledge graph generation
- feature/folder documentation generation
- no direct config ownership unless explicitly added later
