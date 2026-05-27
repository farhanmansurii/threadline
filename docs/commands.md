# Commands

## `threadline setup`

Installs or syncs user-level runtime setup.

```bash
threadline setup --dry-run
threadline setup --merge --runtimes claude,codex
```

Modes:

| Mode | Behavior |
| --- | --- |
| `merge` | Add missing managed sections and preserve existing config |
| `adopt` | Planned |
| `replace` | Planned |

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
threadline handoff create
threadline resume <handoff-id>
threadline context <query>
threadline index
threadline learnings
```
