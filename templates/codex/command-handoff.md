---
name: handoff
description: Save a session handoff to Obsidian and project memory. Use at session end.
---

# Handoff

Create a Threadline handoff for the current session.

## Steps

1. Summarize current work (commits, decisions, changed files).
2. Capture blockers and next actions.
3. Ask before writing to Obsidian or durable memory.
4. Write to ~/obsidian-vault/<project-name>/YYYY-MM-DD-<slug>.md
5. Return the handoff ID.

## Output format

- Summary paragraph
- Work Done table (commit hash | description)
- Key Files Changed table
- Decisions Made (bullet list)
- Blockers / Open Items (bullet list)
- Next Actions (numbered list)
