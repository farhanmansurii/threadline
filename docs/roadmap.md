# Roadmap

Threadline's north star is **tool-neutral continuity**: any agent resumes where any other left off, with verifiable ground truth. Everything else (config sync, project state, skills) serves that.

## Phase 0: Continuity (current focus)

Shipped:

- git-grounded handoff capture (branch, HEAD, ahead/behind, changed files, recent commits)
- `handoff list` and `handoff resume` (by id, `--latest`, prefix match)
- agent-replayable resume brief with per-tool framing (`--format claude|codex|plain`)
- auto-capture: `handoff create --auto` + `watch`/`unwatch` session hooks (Claude `settings.json`, Codex `hooks.json`)
- Codex skills installed with valid frontmatter; correct `$name` invocation (not `/` slash)

Next:

- auto-injection on session start (Claude/Codex `SessionStart` hook fires `resume --latest`)
- hook adapters for Cursor / Kimi / OpenCode
- handoff timeline: queryable per-project history of how the codebase evolved under agents
- team handoffs: hand off from your agent to a teammate's agent

## Phase 1: Core CLI

- project detection
- XDG layout
- dry-run setup/init plans
- skill registry schema
- project profile schema

## Phase 2: Safe Writers

- create backups
- merge managed sections
- install Claude skills/commands
- install Codex skills/config
- export/import profile

Current alpha support:

- `init --local` writes external project profiles.
- `setup --merge` installs Threadline core skill/commands for Claude and core skill/managed config for Codex.
- `setup --adopt` writes an adoption report.
- `setup --replace --yes` replaces Threadline-managed/core runtime files.
- `threadline index` writes a manifest-based RAG index.
- `threadline handoff create` writes Obsidian-compatible Markdown handoffs.

## Phase 3: Knowledge Layer

- Obsidian vault writer
- handoff ID resolver
- handoff index
- LightRAG config/index command
- Kimi document generation adapter

## Phase 4: Skill Ecosystem

- skill pack registry
- install/update/remove commands
- community skill validation
- lockfile support

## Phase 5: Additional Runtimes

- Cursor adapter
- OpenCode adapter
- richer Codex/Claude parity checks
