---
name: relaykit
description: Use RelayKit to detect project context, route handoffs, manage runtime setup, and keep agent configuration portable across Claude Code, Codex, Cursor, OpenCode, Kimi, RAG, and Obsidian.
---

# RelayKit

Use this skill when a user asks to:

- set up or sync Claude Code/Codex/Cursor/OpenCode runtime config
- detect project stack and recommend skills
- create or resume a handoff
- inspect RelayKit project context
- manage auto-learning approval boundaries
- configure RAG/Obsidian integration

## Rules

- Prefer local project profiles under XDG state over repo writes.
- Ask before major config, memory, skill, hook, or repo-materialization changes.
- Treat Obsidian as human-readable knowledge, not raw memory.
- Treat generated RAG indexes as cache/state, not source of truth.
- Keep runtime-specific config in adapters.
