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
