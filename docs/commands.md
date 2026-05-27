# Commands

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
threadline resume <handoff-id>
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

## `threadline handoff create`

Writes a Markdown handoff into an Obsidian-compatible vault path and updates the local handoff index.

```bash
threadline handoff create --title "Feature name" --summary "Current state"
threadline handoff create --vault ~/Documents/Obsidian
```
