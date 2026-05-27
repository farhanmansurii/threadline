# Commands

## `threadline setup`

Installs or syncs user-level runtime setup.

```bash
threadline setup --dry-run
threadline setup --merge --runtimes claude,codex
threadline setup --adopt
threadline setup --replace
```

Modes:

| Mode | Behavior |
| --- | --- |
| `merge` | Add missing managed sections and preserve existing config |
| `adopt` | Bring compatible existing setup under Threadline tracking after review |
| `replace` | Replace Threadline-managed sections after backup and approval |

## `threadline init`

Detects the current project and generates a project profile.

```bash
threadline init --dry-run
threadline init --local
threadline init --repo
```

Modes:

| Mode | Behavior |
| --- | --- |
| `local` | Store profile outside repo under XDG state |
| `repo` | Materialize profile/instructions into the repo |

## `threadline detect`

Prints project detection output.

```bash
threadline detect
threadline detect --json
threadline detect --path /path/to/repo
```

## Planned Commands

```bash
threadline skills list
threadline skills recommend
threadline handoff create
threadline resume <handoff-id>
threadline context <query>
threadline index
threadline learnings
```
