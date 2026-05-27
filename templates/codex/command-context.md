---
name: context
description: Load Threadline project context before making changes. Shows stack, skills, and latest handoff.
---

# Context

Load current Threadline project context.

## Steps

1. Detect the active project stack and skills from Threadline state.
2. Read the latest handoff from ~/obsidian-vault/<project-name>/ if one exists.
3. Run `git status` and `git log --oneline -5`.
4. Summarize: what the project is, what was last worked on, and current repo state.

Use this before starting a new task so the model has full context without guessing.
