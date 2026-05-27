# Handoff and Obsidian

Threadline uses Obsidian as an optional human-readable knowledge and handoff layer.

## Vault Layout

```text
Obsidian Vault/
└── Threadline/
    ├── Projects/
    │   └── <project-slug>/
    │       ├── Overview.md
    │       ├── Knowledge Graph/
    │       ├── Features/
    │       ├── Decisions/
    │       └── Handoffs/
    └── Indexes/
        ├── projects.json
        └── handoffs.json
```

## Handoff Flow

Claude Code can expose `/handoff` through a slash command. Codex, Cursor, OpenCode, and Kimi use explicit CLI commands.

```bash
threadline handoff create
threadline handoff create --title "RMS Dashboard" --summary "Continue dashboard work."
threadline handoff create --vault ~/Documents/Obsidian
threadline resume rms-dashboard-2026-05-27-a7f3
```

The handoff writer should capture:

- human-readable ID
- current project ID
- active feature or folder
- summary of work
- decisions made
- changed files
- commands run
- verification status
- blockers
- next suggested action

## Hook Policy

Claude Code hooks may:

- observe session metadata
- draft handoff candidates
- update local indexes

Hooks must not silently:

- promote project memory to global
- rewrite runtime config
- rewrite repo instructions
- publish to third-party services
- store secrets

Rule:

```text
Hooks may observe and draft. Commands perform intentional writes.
```
