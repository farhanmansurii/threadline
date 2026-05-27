# RAG and Kimi

RelayKit separates human-readable knowledge from generated retrieval indexes.

## LightRAG

Use LightRAG or another configured RAG backend for project retrieval. Store generated indexes under:

```text
~/.local/share/relaykit/projects/<project-id>/rag/
```

Index source policy is project-specific and generated from detection:

- docs and READMEs
- architecture notes
- source files relevant to the stack
- tests and automation
- generated knowledge graph docs

Exclude:

- `.git`
- `node_modules`
- build outputs
- caches
- virtualenvs
- secrets
- raw chats
- raw auto-learning observations

## Kimi

Kimi can be used as a documentation generator, not as the canonical store.

Recommended flow:

```text
1. RelayKit detects project/folder.
2. Kimi generates one-time knowledge docs.
3. Docs are written to Obsidian or local project state.
4. RelayKit indexes the curated docs.
5. Agents retrieve by project, feature, folder, and handoff ID.
```

This avoids hardcoding project knowledge into instructions while still making new chats project-aware.
