<div align="center">

```
   ▄    █                               █  ▀▀█      ▀
 ▄▄█▄▄  █ ▄▄    ▄ ▄▄   ▄▄▄    ▄▄▄    ▄▄▄█    █    ▄▄▄    ▄ ▄▄    ▄▄▄
   █    █▀  █   █▀  ▀ █▀  █  ▀   █  █▀ ▀█    █      █    █▀  █  █▀  █
   █    █   █   █     █▀▀▀▀  ▄▀▀▀█  █   █    █      █    █   █  █▀▀▀▀
   ▀▄▄  █   █   █     ▀█▄▄▀  ▀▄▄▀█  ▀█▄██    ▀▄▄  ▄▄█▄▄  █   █  ▀█▄▄▀

        ·──────────────────────────────────────────────────────·
        Portable memory for agentic coding.
        Any agent resumes where the last one left off.
```

**Portable memory & provenance for agentic coding. Switch tools, switch machines, never lose the thread.**

[![npm version](https://img.shields.io/npm/v/threadline-cli?style=flat-square&color=0EA5E9)](https://www.npmjs.com/package/threadline-cli)
[![license](https://img.shields.io/npm/l/threadline-cli?style=flat-square&color=8B5CF6)](LICENSE)
[![Node.js](https://img.shields.io/node/v/threadline?style=flat-square&color=10B981)](https://nodejs.org/)
[![downloads](https://img.shields.io/npm/dm/threadline-cli?style=flat-square&color=F59E0B)](https://www.npmjs.com/package/threadline-cli)

**Claude · Codex · Cursor · Kimi · OpenCode · ANY CLI**

</div>

---

## What is Threadline?

Threadline is the tool-neutral continuity layer for agentic coding. When an agent stops, runs out of context, or you switch from Claude Code to Codex (or to another machine), the state of *what was being done and why* normally evaporates — it's trapped inside each tool's private session store. Threadline sits **above** every tool and captures that state as a portable, git-aware **handoff** any agent can resume from.

It also normalizes agent config across runtimes and keeps project state *outside* your git history — but those serve the headline: never losing the thread.

## Why Threadline Exists

Developers now switch between multiple AI coding tools — Claude Code for deep reasoning, Codex for agentic tasks, Cursor for IDE work, Kimi for long context. The expensive problem isn't config formatting; it's **continuity**:

1. **State loss.** Hit a context wall or switch tools mid-task and the agent's working memory — branch, diff, decisions, what's verified — is gone. You re-explain everything.
2. **No cross-tool replay.** Work started in one agent can't be picked up by another. Each tool is an island.
3. **No provenance.** As agents touch real code, "what was the agent configured with when it made this change?" has no answer.

Threadline solves continuity first: **auto-captured, git-grounded handoffs** that replay into any runtime. Config sync and zero-clutter project state come along for free.

## Features

- **Git-Grounded Handoffs** — Every handoff captures real state: branch, HEAD, ahead/behind, uncommitted files, recent commits. Not a stub you fill in by hand.
- **Auto-Capture** — `threadline watch` installs hooks so a handoff is written automatically when a session ends or context is about to compact. No discipline required.
- **Cross-Tool Resume** — `threadline resume` emits an agent-replayable brief, framed for the target tool (`--format claude|codex`). Start in Claude Code, continue in Codex.
- **Multi-Runtime Setup** — Configure Claude Code, Codex, Cursor, Kimi, OpenCode, or any generic CLI in one command.
- **Zero Repo Clutter** — Project profiles live under `~/.local/share/threadline/` by default. Your git history stays clean.
- **Automatic Stack Detection** — Detects Node.js, React, Vite, Next.js, TypeScript, Firebase, and more. Recommends only the skills you need.
- **Portable Skills** — Write skills once. Threadline adapts them for each runtime's expected format.
- **Atomic & Safe** — All writes are atomic, idempotent, and backed up. Merge mode preserves your existing config. Replace mode requires an explicit `--yes`.

## Quick Start

### One-Line Setup

```bash
npx threadline-cli setup
```

This launches an interactive onboarding that scans your system, detects installed AI runtimes, and asks which ones to configure.

### The Continuity Loop

```bash
# 1. Turn on auto-capture once (installs Claude Code session hooks).
npx threadline-cli watch

# 2. Work normally. On session end / pre-compaction, a git-grounded
#    handoff is written automatically. Or capture one yourself:
npx threadline-cli handoff create --auto

# 3. Switch tools, switch machines, come back next week — resume.
#    Pipe the brief straight into another agent:
npx threadline-cli handoff resume --latest --format codex
```

`resume` prints an agent-replayable brief: the summary, exactly where the code was left (branch, diff, unpushed commits, changed files), and the next actions — ground truth, not vibes.

### Non-Interactive / CI Mode

```bash
npx threadline-cli setup --replace --yes --runtimes claude,codex
npx threadline-cli init --path ./my-project --local
npx threadline-cli detect --path ./my-project --json
```

### Generic CLI Support

Threadline works with tools it has never heard of:

```bash
npx threadline-cli setup --merge --runtimes gemini,pi,my-custom-cli
```

## Installation

Requires Node.js 20 or later.

```bash
# Run without installing
npx threadline-cli setup

# Or install globally (binary stays `threadline`)
npm install -g threadline-cli
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
| `threadline handoff create` | Write a git-grounded handoff (`--auto` to derive from git) |
| `threadline handoff list` | List all handoffs, newest first |
| `threadline handoff resume` | Print an agent-replayable brief (`--latest`, `--format claude\|codex`) |
| `threadline watch` / `unwatch` | Install / remove auto-capture session hooks |
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

Threadline is in early alpha. The continuity layer works today: git-grounded handoff capture, `handoff list`/`resume` (by id or `--latest`), agent-replayable briefs with per-tool framing (`--format claude|codex`), and auto-capture via `watch`/`unwatch` session hooks on Claude Code. The CLI also supports project detection, skill listing/recommendation/install, multi-runtime setup (merge/adopt/guarded replace), and manifest-based indexing. All writes are atomic, idempotent, backed up, reject relative XDG state paths, and fail closed on conflicting unmanaged Codex TOML tables.

Per-runtime auto-capture beyond Claude, the handoff timeline, team handoffs, LightRAG embeddings, and a verifiable skill lockfile are staged for follow-up releases.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

Threadline is inspired by the frustration of maintaining five different agent configs across dozens of repos. Built for developers who treat AI tools as a toolchain, not a vendor lock-in.
