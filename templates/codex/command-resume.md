---
name: resume
description: Resume work from a previous Threadline handoff. Pick from recent handoffs or pass an ID.
---

# Resume

Resume work from a Threadline handoff.

## Steps

1. If a handoff ID is provided, load that handoff.
   Otherwise list ~/obsidian-vault/<project-name>/ and ask the user to pick one.
2. Read the full handoff: summary, next actions, blockers, changed files.
3. Run `git status` and `git log --oneline -10` to check current repo state.
4. Brief the user:
   - What was in progress
   - What changed since the handoff
   - Suggested first step to resume
5. Ask before making any writes or running destructive commands.
