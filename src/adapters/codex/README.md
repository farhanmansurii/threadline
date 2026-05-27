# Codex Adapter

Responsibilities:

- Install Threadline skills into `~/.codex/skills`
- Merge MCP/runtime sections into `~/.codex/config.toml`
- Support project-local `.codex/config.toml` only with explicit materialization
- Preserve credentials and user-specific MCP config
- Fail closed on conflicting unmanaged TOML tables

Implemented in `adapter.mjs`.
