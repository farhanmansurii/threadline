<div align="center">

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   ████████╗██╗  ██╗██████╗ ███████╗ █████╗ ██████╗ ██╗     ██╗   ║
║   ╚══██╔══╝██║  ██║██╔══██╗██╔════╝██╔══██╗██╔══██╗██║     ██║   ║
║      ██║   ███████║██████╔╝█████╗  ███████║██║  ██║██║     ██║   ║
║      ██║   ██╔══██║██╔══██╗██╔══╝  ██╔══██║██║  ██║██║     ██║   ║
║      ██║   ██║  ██║██║  ██║███████╗██║  ██║██████╔╝███████╗██║   ║
║      ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝   ║
║                                                                  ║
║              Portable Agent Runtime Manager v0.1.0               ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**One config. Every AI tool. Zero repo clutter.**

[![npm version](https://img.shields.io/npm/v/threadline?style=flat-square&color=0EA5E9)](https://www.npmjs.com/package/threadline)
[![license](https://img.shields.io/npm/l/threadline?style=flat-square&color=8B5CF6)](LICENSE)
[![Node.js](https://img.shields.io/node/v/threadline?style=flat-square&color=10B981)](https://nodejs.org/)
[![downloads](https://img.shields.io/npm/dm/threadline?style=flat-square&color=F59E0B)](https://www.npmjs.com/package/threadline)

**Claude · Codex · Cursor · Kimi · OpenCode · ANY CLI**

</div>

---

## What is Threadline?

Threadline is the missing layer between your machine, your repos, and your AI coding assistants. It detects your project stack, installs portable skills across every runtime you use, keeps project state *outside* your git history, and lets agents resume work through stable handoff IDs.

Stop copying `.claude/` folders into every repo. Stop maintaining five different config formats. Threadline normalizes it all.

## Why Threadline Exists

Most developers now switch between multiple AI coding tools — Claude Code for deep reasoning, Codex for agentic tasks, Cursor for IDE integration, Kimi for long context. Each one wants its own config directory, its own skills folder, its own project metadata. That creates three problems:

1. **Config sprawl.** Every repo grows a mess of `.claude/`, `.codex/`, `.cursor/` directories.
2. **Skill lock-in.** A skill you wrote for Claude Code doesn't work in Codex or Cursor.
3. **State loss.** Switch machines or tools and your project context disappears.

Threadline solves all three with a single, portable runtime layer.

## Features

- **Multi-Runtime Setup** — Configure Claude Code, Codex, Cursor, Kimi, OpenCode, or any generic CLI in one command.
- **Zero Repo Clutter** — Project profiles live under `~/.local/share/threadline/` by default. Your git history stays clean.
- **Automatic Stack Detection** — Detects Node.js, React, Vite, Next.js, TypeScript, Firebase, and more. Recommends only the skills you need.
- **Portable Skills** — Write skills once. Threadline adapts them for each runtime's expected format.
- **Obsidian Handoffs** — Generate Markdown handoffs with stable IDs that any agent can resume from.
- **RAG Indexing** — Manifest-based indexing prepares your repo for retrieval-augmented generation.
- **Atomic & Safe** — All writes are atomic and idempotent. Merge mode preserves your existing config. Replace mode requires an explicit `--yes`.
- **Modern CLI Tools** — Optionally integrates `fd`, `ripgrep`, `sd`, `bat`, `ast-grep`, and RTK for a better terminal experience.

## Quick Start

### One-Line Setup

```bash
npx threadline setup
```

This launches an interactive onboarding that scans your system, detects installed AI runtimes, and asks which ones to configure.

### Inside a Project

```bash
npx threadline init --local
npx threadline index
npx threadline handoff create --title "Implemented auth flow"
```

### Non-Interactive / CI Mode

```bash
npx threadline setup --replace --yes --runtimes claude,codex
npx threadline init --path ./my-project --local
npx threadline detect --path ./my-project --json
```

### Generic CLI Support

Threadline works with tools it has never heard of:

```bash
npx threadline setup --merge --runtimes gemini,pi,my-custom-cli
```

## Installation

Requires Node.js 20 or later.

```bash
# Run without installing
npx threadline setup

# Or install globally
npm install -g threadline
threadline setup
```

## How It Works

### Runtime Adapters

Each AI tool gets a normalized adapter. Threadline speaks their config language so you don't have to.

| Runtime | What Threadline Manages |
|--------|------------------------|
| Claude Code | Skills, slash commands, project hooks, local settings |
| Codex | Skills, `config.toml`, MCP configuration, agent roles |
| Cursor | Skills, `.cursor/config.toml`, rules files |
| Kimi | Skills, commands, `.kimi/config.toml` |
| OpenCode | Skills, commands, `.opencode/config.toml` |
| Any CLI | Generic adapter creates `~/.<cli>/skills` and `~/.<cli>/commands` |

### Project Detection

Threadline identifies a project by its git remote URL (or git root if no remote exists) and generates a stable 12-character hash. The same repo resolves to the same profile across machines.

```bash
$ threadline detect --json
{
  "id": "a1b2c3d4e5f6",
  "name": "my-app",
  "root": "/Users/you/code/my-app",
  "remote": "git@github.com:you/my-app.git",
  "packageManager": "npm",
  "stacks": ["node", "typescript", "react", "vite"],
  "recommendedPresets": ["minimal", "fullstack-js", "react-vite"]
}
```

### XDG Directory Layout

```text
~/.config/threadline/       # Human-editable config, dotfiles-friendly
~/.local/share/threadline/  # Generated state, profiles, handoffs, indexes
~/.cache/threadline/        # Temporary and cache data
```

### Local-First Project State

```text
~/.local/share/threadline/projects/<project-id>/
└── workspaces/
    └── <workspace-id>/
        ├── project-profile.json
        ├── generated/
        │   ├── AGENTS.generated.md
        │   ├── codex.generated.toml
        │   └── claude.generated.json
        ├── rag/
        ├── handoffs/
        ├── knowledge-graph/
        └── learnings/
```

## Commands

| Command | Purpose |
|--------|---------|
| `threadline setup` | Install or sync user-level runtime configuration |
| `threadline init` | Detect project and generate a project profile |
| `threadline detect` | Print project detection results |
| `threadline skills list` | List all available skills from the registry |
| `threadline skills recommend` | Recommend skills for the current project stack |
| `threadline index` | Build a manifest-based RAG index |
| `threadline handoff create` | Write an Obsidian-compatible Markdown handoff |
| `threadline tools list` | Show available modern CLI tool integrations |

See [docs/commands.md](docs/commands.md) for full command reference.

## Safety Model

Threadline never needs to overwrite your setup to become useful.

| Mode | Behavior |
|------|----------|
| `merge` (default) | Adds missing managed sections. Preserves everything else. |
| `adopt` | Inspects your current setup and writes an adoption report. |
| `replace` | Replaces Threadline-managed files. Requires `--yes`. |

Project setup is local by default:

| Mode | Behavior |
|------|----------|
| `local` | Stores profile under XDG state. Zero git changes. |
| `repo` | Materializes files into the repo. Intentionally git-visible. |

## Documentation

- [Architecture](docs/architecture.md) — Design principles, project identity, and state layout.
- [Commands](docs/commands.md) — Full CLI reference.
- [Skills](docs/skills.md) — How the skill registry and presets work.
- [RAG & Kimi](docs/rag-and-kimi.md) — Retrieval-augmented generation and Kimi integration.
- [Handoffs & Obsidian](docs/handoff-and-obsidian.md) — Session handoffs and Obsidian vault output.
- [Runtime Adapters](docs/runtime-adapters.md) — Adapter interface for adding new runtimes.
- [Roadmap](docs/roadmap.md) — What's shipped and what's next.

## Status

Threadline is in early alpha. The current CLI supports project detection, skill listing and recommendation, setup dry-runs, local project profile writes, multi-runtime setup writes, adoption reports, guarded replace mode, Obsidian Markdown handoffs, and manifest-based RAG indexing. Setup writes are atomic, idempotent, reject relative XDG state paths, and fail closed on conflicting unmanaged Codex TOML tables.

LightRAG embeddings, external skill fetching, `init --repo`, and advanced runtime adapters are staged for follow-up releases.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

Threadline is inspired by the frustration of maintaining five different agent configs across dozens of repos. Built for developers who treat AI tools as a toolchain, not a vendor lock-in.
