import path from 'node:path';
import { getRelayKitPaths } from './paths.mjs';

export function createSetupPlan({ mode, runtimes, dryRun }) {
  const paths = getRelayKitPaths();
  const actions = [
    write(paths.configDir, 'Create RelayKit config directory'),
    write(path.join(paths.configDir, 'config.toml'), 'Write core config if missing'),
    write(path.join(paths.configDir, 'skills.lock.json'), 'Track installed skill pack versions'),
    write(paths.dataDir, 'Create RelayKit state directory'),
  ];

  if (runtimes.includes('claude')) {
    actions.push(
      write('~/.claude/skills/relaykit', 'Install Claude skill entrypoint'),
      write('~/.claude/commands/handoff.md', 'Install Claude handoff command'),
      write('~/.claude/commands/resume.md', 'Install Claude resume command'),
      merge('~/.claude/settings.json', 'Merge RelayKit-managed hooks/settings')
    );
  }

  if (runtimes.includes('codex')) {
    actions.push(
      write('~/.codex/skills/relaykit', 'Install Codex skill entrypoint'),
      merge('~/.codex/config.toml', 'Merge RelayKit-managed MCP/runtime config')
    );
  }

  return {
    title: 'User setup',
    mode,
    dryRun,
    actions,
    notes: [
      'Merge preserves existing user config and only owns marked RelayKit sections.',
      'Replace requires backups and explicit approval.',
    ],
  };
}

export function createProjectPlan({ profile, mode, dryRun }) {
  const paths = getRelayKitPaths();
  const projectDir = path.join(paths.projectsDir, profile.id);
  const actions = [
    write(projectDir, 'Create external project profile directory'),
    write(path.join(projectDir, 'project-profile.json'), 'Store detected project profile outside repo'),
    write(path.join(projectDir, 'generated', 'AGENTS.generated.md'), 'Generate runtime-readable project instructions'),
    write(path.join(projectDir, 'rag.config.json'), 'Generate RAG index policy'),
    write(path.join(projectDir, 'handoff.config.json'), 'Generate handoff policy'),
  ];

  if (mode === 'repo') {
    actions.push(
      write(path.join(profile.root, 'AGENTS.md'), 'Materialize AGENTS.md into repo'),
      write(path.join(profile.root, '.relaykit', 'project-profile.json'), 'Materialize project profile into repo')
    );
  }

  return {
    title: `Project init: ${profile.name}`,
    mode,
    dryRun,
    actions,
    notes: [
      'Local mode keeps target repo git history untouched.',
      'Repo mode is explicit and git-visible.',
      `Recommended presets: ${profile.recommendedPresets.join(', ')}`,
    ],
  };
}

function write(target, description) {
  return { type: 'write', target, description };
}

function merge(target, description) {
  return { type: 'merge', target, description };
}
