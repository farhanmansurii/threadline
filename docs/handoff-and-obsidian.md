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

A handoff is a portable, git-grounded snapshot of in-progress work that any agent can resume from. Create, list, and resume them with explicit CLI commands; Claude Code can also expose `/handoff` as a slash command.

```bash
# Create — title/summary optional; git state is captured automatically.
threadline handoff create --title "RMS Dashboard" --summary "Continue dashboard work."
threadline handoff create --vault ~/Documents/Obsidian

# Create from git context with no prompts (used by hooks; see Auto-Capture).
threadline handoff create --auto

# List, newest first.
threadline handoff list
threadline handoff list --json

# Resume — prints an agent-replayable brief on stdout.
threadline handoff resume rms-dashboard-2026-05-27-a7f3
threadline handoff resume --latest                 # most recent for this project
threadline handoff resume --latest --format codex  # framed for the target tool
```

### What a handoff captures

Each handoff writes a human-readable Markdown file (in the Obsidian vault) and a machine-readable `.json` sibling. Captured automatically from git:

- stable handoff ID, project ID, created timestamp
- branch, HEAD sha, upstream, ahead/behind counts
- working-tree status: staged, unstaged, and untracked files
- recent commit subjects
- derived next actions (review N uncommitted files, push M commits, …)

Filled by you or the agent (left as `Pending` otherwise): summary, decisions, verification, blockers.

### Cross-tool resume

`resume` reduces a handoff to a compact brief designed to be injected into another agent's context. `--format` frames the same ground-truth payload for the target tool:

- `plain` (default) — the raw brief
- `claude` — prefixed as a resume directive for Claude Code
- `codex` — framed as an AGENTS-style resume preamble for Codex

Start work in one tool, hit a context wall, then continue in another:

```bash
threadline handoff create --auto
threadline handoff resume --latest --format codex | <pipe into Codex>
```

## Auto-Capture (`watch` / `unwatch`)

Manual handoffs only happen if you remember. `watch` installs runtime hooks so a handoff is captured automatically at natural boundaries — session end and pre-compaction — when continuity matters most.

```bash
threadline watch                              # Claude: SessionEnd + PreCompact
threadline watch --runtime codex              # Codex:  Stop + PreCompact
threadline watch --on sessionend              # choose events
threadline unwatch                            # remove Threadline's hooks
threadline unwatch --runtime codex
```

`watch` merges idempotently into the runtime's hook file, preserving existing hooks and unrelated keys, marking its own entries with a stable command sentinel; `unwatch` removes exactly those. Auto-fired captures skip writing when the working tree is clean and in sync, so the vault is not spammed with empty handoffs.

| Runtime | Hook file | Default events | Notes |
|---------|-----------|----------------|-------|
| `claude` | `~/.claude/settings.json` | `SessionEnd`, `PreCompact` | — |
| `codex` | `~/.codex/hooks.json` | `Stop`, `PreCompact` | requires `features.hooks = true` in `~/.codex/config.toml` |

> Cursor, Kimi, and OpenCode use manual or skill-driven capture until their hook adapters land.

### A note on invocation per runtime

- **Claude Code**: Threadline installs `/handoff` and `/resume` as slash commands.
- **Codex**: Threadline installs `handoff`/`resume` as Agent Skills under `~/.codex/skills/`. Codex invokes a skill by description match or explicitly with `$handoff` / `$resume` — not `/` slash commands (those are Codex's deprecated custom prompts).

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
