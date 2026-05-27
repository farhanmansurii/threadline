# Commands

## `relaykit setup`

Installs or syncs user-level runtime setup.

```bash
relaykit setup --dry-run
relaykit setup --merge --runtimes claude,codex
relaykit setup --adopt
relaykit setup --replace
```

Modes:

| Mode | Behavior |
| --- | --- |
| `merge` | Add missing managed sections and preserve existing config |
| `adopt` | Bring compatible existing setup under RelayKit tracking after review |
| `replace` | Replace RelayKit-managed sections after backup and approval |

## `relaykit init`

Detects the current project and generates a project profile.

```bash
relaykit init --dry-run
relaykit init --local
relaykit init --repo
```

Modes:

| Mode | Behavior |
| --- | --- |
| `local` | Store profile outside repo under XDG state |
| `repo` | Materialize profile/instructions into the repo |

## `relaykit detect`

Prints project detection output.

```bash
relaykit detect
relaykit detect --json
relaykit detect --path /path/to/repo
```

## Planned Commands

```bash
relaykit skills list
relaykit skills recommend
relaykit handoff create
relaykit resume <handoff-id>
relaykit context <query>
relaykit index
relaykit learnings
```
