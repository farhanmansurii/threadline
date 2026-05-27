# Threadline

Portable agent environment manager for Claude Code, Codex, Cursor, OpenCode, Kimi, RAG, Obsidian handoffs, and project-aware workflows.

Threadline is the layer between your machine, your repos, and your AI coding tools. It installs a small shared agent runtime, detects each project dynamically, keeps project state outside git by default, and lets agents resume work through stable handoff IDs.

## What It Solves

- Keep Claude Code and Codex skills/config portable across machines.
- Avoid writing agent setup files into every repo unless explicitly requested.
- Detect project stacks and recommend only the required skill packs.
- Generate Obsidian handoff docs and knowledge graph entries that Claude, Codex, Cursor, OpenCode, or Kimi can consume.
- Keep auto-learning gated: agents may observe and suggest, but major policy/config/memory changes require approval.

## Install Shape

```bash
npx threadline setup --dry-run
npx threadline setup --merge --runtimes claude,codex
```

Inside a project:

```bash
npx threadline init --dry-run
npx threadline init --local
```

`--local` writes project profile state outside the repo:

```text
~/.local/share/threadline/projects/<project-id>/
```

`--repo` materializes files into the target repo and is intentionally git-visible.

## XDG Layout

```text
~/.config/threadline/       # human-editable config, dotfiles-friendly
~/.local/share/threadline/  # generated state, project profiles, handoffs, indexes
~/.cache/threadline/        # temporary/cache data
```

## Runtime Model

Threadline treats tools as adapters:

| Runtime | Adapter Responsibility |
| --- | --- |
| Claude Code | skills, slash commands, hooks, local settings |
| Codex | skills, `.codex/config.toml`, MCP config, agent roles |
| Cursor | `.cursor/rules` and project-context bridge |
| OpenCode | future adapter for rules/config |
| Kimi | one-time or periodic knowledge graph/doc generation |

## Safety Model

Threadline never needs to hard overwrite your setup to become useful.

```text
setup --merge    # default, additive managed sections
setup --adopt    # bring existing compatible config under Threadline tracking
setup --replace  # explicit reset with backup
```

Project setup is local by default:

```text
init --local     # no repo git changes
init --repo      # explicit repo files
```

## Status

This repo is in early scaffold stage. The current CLI supports detection and dry-run planning. Write/merge execution, Obsidian handoff writers, LightRAG indexing, and runtime installers are intentionally staged behind explicit follow-up work.
