# Contributing to Threadline

Thanks for your interest in Threadline. This project is early-stage, so the best contributions right now are bug reports, feature ideas, and runtime adapters for tools Threadline doesn't yet support.

## Getting Started

```bash
git clone https://github.com/farhanmansurii/threadline.git
cd threadline
npm install
npm run check
npm run smoke
```

## Project Structure

- `bin/` — CLI entry point
- `src/` — Core modules and command handlers
- `docs/` — Documentation
- `skills/` — Portable skill packs
- `templates/` — Runtime-specific templates
- `presets/` — Project preset definitions
- `registry/` — Skill registry

## Adding a New Runtime Adapter

1. Create a new directory under `src/adapters/<runtime>/`
2. Implement the adapter interface:
   - `getConfigPaths()` — Returns XDG config paths for the runtime
   - `writeSkills()` — Adapts portable skills to runtime format
   - `writeCommands()` — Writes slash commands or equivalent
   - `writeConfig()` — Writes runtime-specific config files
3. Register the adapter in `src/adapters/index.mjs`
4. Add a template directory under `templates/<runtime>/`
5. Update the README runtime table

## Code Style

- Use ES modules (`"type": "module"`)
- Prefer async/await over callbacks
- Keep functions small and focused
- Add JSDoc for public APIs

## Testing

```bash
npm run check   # Syntax validation
npm run smoke   # Integration smoke tests
npm test        # Unit tests
```

## Submitting Changes

1. Open an issue first for significant changes
2. Fork the repo and create a branch
3. Make your changes with clear commit messages
4. Run the full test suite
5. Open a pull request with a description of what and why

## Code of Conduct

Be respectful. Assume good intent. Focus on the problem, not the person.
