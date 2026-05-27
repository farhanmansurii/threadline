# Resume

Resume work from a Threadline handoff ID.

## Usage

```
/resume <handoff-id>
/resume                    # pick from recent handoffs
```

## Behavior

1. If a handoff ID is provided, run:
   ```
   threadline handoff resume <handoff-id>
   ```
   Otherwise run `threadline handoff list` and ask the user to pick one.

2. Read the full handoff output: summary, next actions, blockers, changed files.

3. Run `threadline detect` to get the current project profile.

4. Inspect current repo state with `git status` and `git log --oneline -10`.

5. Brief the user:
   - What was in progress
   - What changed since the handoff
   - Suggested first step to resume

6. Ask before making any writes or running destructive commands.
