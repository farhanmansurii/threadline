# Runtime Adapters

Threadline supports multiple agent runtimes through adapters. Each adapter knows where a runtime keeps its config, how to install skills, and how to merge or replace managed config sections.

## Built-in Adapters

### Claude Code

Owns:

- `~/.claude/skills`
- `~/.claude/commands`
- `~/.claude/settings.json` (read-only for now)
- hooks where approved

### Codex

Owns:

- `~/.codex/skills`
- `~/.codex/config.toml`
- `.codex/config.toml` only when repo materialization is explicitly requested
- preserve credentials and user-specific MCP config

### Cursor

Owns:

- `~/.cursor/skills`
- `~/.cursor/config.toml`
- `.cursor/rules` generation planned

### OpenCode

Owns:

- `~/.opencode/skills`
- `~/.opencode/commands`
- `~/.opencode/config.toml`

### Kimi

Owns:

- `~/.kimi/skills`
- `~/.kimi/commands`
- `~/.kimi/config.toml`
- knowledge graph/doc generation planned

## Generic Adapter

If you pass a runtime that Threadline doesn't recognise (e.g. `--runtimes gemini,pi,myco`), the generic adapter takes over. It creates a predictable home-directory structure:

```text
~/.<runtime>/
├── skills/
│   └── <pack>/
│       └── SKILL.md
├── commands/
│   └── <command>.md
└── config.toml
```

The generic adapter:
- Falls back to Claude command templates when a runtime-specific template doesn't exist.
- Installs `threadline-core` skills and default commands for any runtime.
- Merges a `THREADLINE_MANAGED` block into `config.toml`.
- Never overwrites user files unless `--replace --yes` is passed.

## Adapter Interface

Each adapter exports:

| Property | Type | Description |
| --- | --- | --- |
| `id` | `string` | Runtime identifier |
| `name` | `string` | Display name |
| `homeDir` | `string` | Config home, e.g. `~/.claude` |
| `supports` | `{ skills, commands, config }` | Capability flags |
| `installSkills(sourceDir, options)` | `async` | Copy a skill directory into the runtime |
| `installCommands(commands, options)` | `async` | Write command markdown files |
| `installConfig(options)` | `async` | Merge or replace runtime config |
| `adopt()` | `async` | Inspect existing setup and return findings |
| `preflight()` | `async` | Throw if merge would be unsafe |

Adapters live in `src/adapters/<runtime>/adapter.mjs`. Unknown runtimes are handled by `src/adapters/generic/adapter.mjs`.
