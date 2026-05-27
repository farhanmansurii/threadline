# Roadmap

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
