# Commands

> **Note:** After a global install (`npm install -g threadline-cli`), use `threadline <command>`. With `npx`, use `npx threadline-cli <command>`.

## `threadline setup`

Installs or syncs user-level runtime setup.

```bash
threadline setup --dry-run
threadline setup --merge --runtimes claude,codex
threadline setup --adopt --runtimes claude,codex
threadline setup --replace --yes --runtimes codex
```

Modes:

| Mode | Behavior |
| --- | --- |
| `merge` | Add missing managed sections and preserve existing config |
| `adopt` | Inspect current setup and write an adoption report |
| `replace` | Replace Threadline-managed/core runtime files; requires `--yes` |

## `threadline init`

Detects the current project and generates a project profile.

```bash
threadline init --dry-run
threadline init --local
```

Modes:

| Mode | Behavior |
| --- | --- |
| `local` | Store profile outside repo under XDG state |
| `repo` | Planned materialization into the repo |

## `threadline detect`

Prints project detection output.

```bash
threadline detect
threadline detect --json
threadline detect --path /path/to/repo
```

## `threadline skills`

Lists or recommends skills from the registry.

```bash
threadline skills list
threadline skills list --json
threadline skills recommend
threadline skills recommend --path /path/to/repo
```

## Planned Commands

```bash
threadline context <query>
threadline learnings
```

## `threadline index`

Writes a manifest-based RAG index under the local project profile.

```bash
threadline index
threadline index --path /path/to/repo
```

This is not yet an embedding/vector index.

## `threadline handoff`

Capture, list, and resume git-grounded handoffs. See [handoff-and-obsidian.md](handoff-and-obsidian.md) for the full model.

```bash
# create — captures git state automatically; title/summary optional
threadline handoff create --title "Feature name" --summary "Current state"
threadline handoff create --vault ~/Documents/Obsidian
threadline handoff create --auto            # no prompts; derive title/summary from git

# list — newest first
threadline handoff list
threadline handoff list --json

# resume — prints an agent-replayable brief on stdout
threadline handoff resume <handoff-id>
threadline handoff resume --latest
threadline handoff resume --latest --format codex   # plain | claude | codex
```

## `threadline watch` / `threadline unwatch`

Install or remove auto-capture hooks so a handoff is written automatically at session end and pre-compaction. Merges into `~/.claude/settings.json` idempotently and reversibly; preserves unrelated hooks and settings.

```bash
threadline watch                       # claude; SessionEnd + PreCompact
threadline watch --on sessionend       # choose events
threadline unwatch
```

Currently targets the `claude` runtime.
