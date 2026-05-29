# Skills

Threadline uses skill packs rather than one large always-loaded setup.

## Buckets

| Bucket | Meaning |
| --- | --- |
| `core` | Always installed because Threadline needs it |
| `detected` | Recommended when project evidence matches |
| `library` | Available on demand but not default loaded |

## Core Skills

- project detection
- context router
- handoff/resume
- verification loop
- auto-learning governance
- RAG index policy
- runtime sync

## Example Skill Pack Manifest

```json
{
  "id": "react-vite",
  "name": "React Vite",
  "bucket": "detected",
  "triggers": ["vite.config.js", "vite.config.ts", "react", "tsx", "jsx"],
  "requires": ["frontend-patterns"],
  "optional": ["playwright-ui"],
  "runtimes": {
    "claude": {
      "skills": ["skills/frontend/react-vite"],
      "commands": ["commands/ui-check.md"]
    },
    "codex": {
      "skills": ["skills/frontend/react-vite"]
    }
  }
}
```

## Expansion Rules

- New skills must include a manifest.
- New skills must declare triggers and supported runtimes.
- Hooks are never enabled without explicit approval.
- Secrets and credentials are never packaged in skills.
- Library skills stay searchable without becoming default context.

## External Sources

Threadline can reference upstream skill repos as optional packs.

Current curated source:

- `mattpocock/skills` — engineering discipline workflows such as diagnosis, TDD, architecture review, grilling, PRDs, issue slicing, handoff, and skill authoring.

External skills should be fetched and validated by the installer before use. They should not be silently vendored or auto-enabled.

## Installing ecosystem skills (`threadline skills add`)

For arbitrary skills from the open [Agent Skills ecosystem](https://www.skills.sh) (`skills.sh`, `vercel-labs/agent-skills`, any `owner/repo`), Threadline delegates the per-agent install to the vercel `npx skills` CLI rather than re-implementing it. `npx skills` already handles each agent's path, frontmatter, and multi-file layout per the shared Agent Skills spec; Threadline owns runtime mapping and provenance on top.

```bash
threadline skills add vercel-labs/agent-skills --skill frontend-design
threadline skills add owner/repo --runtimes claude,codex
threadline skills add owner/repo --project          # project scope instead of global
```

What it does:

1. Resolves target runtimes (explicit `--runtimes`, else detected installed runtimes).
2. Maps them to vercel agent ids: `claude → claude-code`, `codex → codex`, `cursor → cursor`, `opencode → opencode`. Runtimes the vercel CLI does not support (e.g. `kimi`) are reported, not silently skipped.
3. Runs `npx skills add <repo> -g -a <agents> -y` (global by default; `--project` drops `-g`).
4. Records source, skill, runtimes, scope, and timestamp under `external` in `~/.config/threadline/skills.lock.json` for provenance.

Use `threadline skills install` (registry packs) for Threadline's own curated skills; use `threadline skills add` for anything from the wider ecosystem.
