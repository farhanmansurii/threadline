# RAG and Kimi

Threadline separates human-readable knowledge from generated retrieval indexes.

## LightRAG

Threadline alpha currently writes a manifest-based RAG index. LightRAG or another embedding backend can consume this manifest later. Store generated indexes under:

```text
~/.local/share/threadline/projects/<project-id>/workspaces/<workspace-id>/rag/
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
1. Threadline detects project/folder.
2. Kimi generates one-time knowledge docs.
3. Docs are written to Obsidian or local project state.
4. Threadline indexes the curated docs.
5. Agents retrieve by project, feature, folder, and handoff ID.
```

This avoids hardcoding project knowledge into instructions while still making new chats project-aware.
