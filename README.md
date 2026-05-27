# Threadline

Portable agent runtime manager for Claude Code, Codex, Cursor, OpenCode, Kimi, and any CLI. Skills, project detection, RAG indexing, and Obsidian handoffs — with a generic adapter for runtimes Threadline doesn't know yet.

Threadline is the layer between your machine, your repos, and your AI coding tools. It installs a small shared agent runtime, detects each project dynamically, keeps project state outside git by default, and lets agents resume work through stable handoff IDs.

## What It Solves

- Keep skills/config portable across machines and runtimes.
- Avoid writing agent setup files into every repo unless explicitly requested.
- Detect project stacks and recommend only the required skill packs.
- Prepare the project profile and handoff config that future Obsidian/RAG integrations will consume.
- Keep auto-learning gated: agents may observe and suggest, but major policy/config/memory changes require approval.

## Install Shape

```bash
npx threadline setup --dry-run
npx threadline setup --merge --runtimes claude,codex,cursor,kimi
npx threadline setup --adopt --runtimes claude,codex
npx threadline setup --replace --yes --runtimes codex

# Generic adapter works for any CLI — just pass the runtime name
npx threadline setup --merge --runtimes gemini,pi,any-cli
```

Inside a project:

```bash
npx threadline init --dry-run
npx threadline init --local
npx threadline index
npx threadline handoff create --title "Feature name"
```

`--local` writes project profile state outside the repo:

```text
~/.local/share/threadline/projects/<project-id>/workspaces/<workspace-id>/
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
| Cursor | skills, `.cursor/config.toml`, rules |
| OpenCode | skills, commands, `.opencode/config.toml` |
| Kimi | skills, commands, `.kimi/config.toml` |
| Any CLI | generic adapter creates `~/.<cli>/skills` and `~/.<cli>/commands` |

## Safety Model

Threadline never needs to hard overwrite your setup to become useful.

```text
setup --merge    # default, additive managed sections
setup --adopt    # writes an adoption report
setup --replace  # requires --yes, replaces Threadline-managed/core runtime files
```

Project setup is local by default:

```text
init --local     # no repo git changes
init --repo      # planned explicit repo files
```

## Status

This repo is in early alpha. The current CLI supports project detection, skill listing/recommendation, setup dry-runs, local project profile writes, multi-runtime setup writes (Claude, Codex, Cursor, OpenCode, Kimi, and generic CLI), adoption reports, guarded replace mode, Obsidian Markdown handoffs, and manifest-based RAG indexing. Setup writes are atomic, idempotent, reject relative XDG state paths, and fail closed on conflicting unmanaged Codex TOML tables. LightRAG embeddings, external skill fetching, `init --repo`, and advanced runtime adapters are intentionally staged behind explicit follow-up work.
