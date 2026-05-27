# Generic Adapter

Handles any runtime that Threadline doesn't have a built-in adapter for. Just pass the runtime name:

```bash
threadline setup --runtimes gemini,pi,myco
```

The generic adapter creates:

```text
~/.<runtime>/
├── skills/
│   └── <pack>/
│       └── SKILL.md
├── commands/
│   └── <command>.md
└── config.toml
```

It falls back to Claude command templates when a runtime-specific template doesn't exist, and always installs `threadline-core` with default commands.
