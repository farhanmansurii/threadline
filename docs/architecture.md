# Architecture

Threadline has four layers:

```text
Core
  project detection, XDG paths, install planning, profiles, registry

Adapters
  Claude, Codex, Cursor, OpenCode, Kimi

Knowledge
  LightRAG index policy, Obsidian handoffs, generated knowledge graphs

Skills
  portable skill packs and runtime-specific shims
```

## Design Principles

- User config lives in `~/.config/threadline`.
- Generated project state lives in `~/.local/share/threadline`.
- Target repos stay untouched unless `--repo` is passed.
- Runtime adapters implement the same profile instead of each tool inventing its own truth.
- Skill expansion uses a registry and profiles, not a giant always-loaded bundle.
- Hooks may observe and draft. Commands perform intentional writes.

## Project Identity

Threadline identifies projects by:

1. Git remote URL when available.
2. Git root path when no remote exists.
3. Current directory fallback.

The ID is a stable 12-character hash. This lets the same repo resolve to the same profile across machines when the remote is the same.

## Generated Project Profile

```json
{
  "id": "a1b2c3d4e5f6",
  "name": "my-app",
  "root": "/repo/path",
  "remote": "git@github.com:org/my-app.git",
  "packageManager": "npm",
  "stacks": ["node", "typescript", "react", "vite"],
  "recommendedPresets": ["minimal", "fullstack-js", "react-vite"]
}
```

## Local-First Project State

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

This keeps git history clean while still allowing project-aware behavior.
