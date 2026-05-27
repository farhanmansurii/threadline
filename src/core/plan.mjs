import path from 'node:path';
import { getThreadlinePaths } from './paths.mjs';
import { getAdapter } from '../adapters/index.mjs';

export function createSetupPlan({ mode, runtimes, dryRun }) {
  const paths = getThreadlinePaths();
  if (mode === 'adopt') {
    return {
      title: 'User setup',
      mode,
      dryRun,
      actions: [
        write(path.join(paths.dataDir, 'adoption-report.json'), 'Inspect current runtime setups and write adoption report'),
      ],
      notes: ['Adopt is report-only in alpha and does not mutate runtime config.'],
    };
  }

  const actions = [
    write(paths.configDir, 'Create Threadline config directory'),
    write(path.join(paths.configDir, 'config.toml'), 'Write core config if missing'),
    write(path.join(paths.configDir, 'skills.lock.json'), 'Track installed skill pack versions'),
    write(paths.dataDir, 'Create Threadline state directory'),
  ];

  for (const runtime of runtimes) {
    const adapter = getAdapter(runtime);
    actions.push(write(adapter.homeDir, `Create ${adapter.name} runtime directory`));
    if (adapter.supports.skills) {
      actions.push(write(path.join(adapter.homeDir, 'skills', 'threadline'), `Install ${adapter.name} skill entrypoint`));
    }
    if (adapter.supports.commands) {
      actions.push(write(path.join(adapter.homeDir, 'commands', 'handoff.md'), `Install ${adapter.name} handoff command`));
      actions.push(write(path.join(adapter.homeDir, 'commands', 'resume.md'), `Install ${adapter.name} resume command`));
      actions.push(write(path.join(adapter.homeDir, 'commands', 'context.md'), `Install ${adapter.name} context command`));
      actions.push(write(path.join(adapter.homeDir, 'commands', 'learnings.md'), `Install ${adapter.name} learnings command`));
    }
    if (adapter.supports.config) {
      actions.push(merge(path.join(adapter.homeDir, 'config.toml'), `Merge Threadline-managed config for ${adapter.name}`));
    }
  }

  return {
    title: 'User setup',
    mode,
    dryRun,
    actions,
    notes: [
      'Merge preserves existing user config and only owns marked Threadline sections.',
      'Replace requires backups and explicit approval.',
      'Replace reinstalls all registered skill packs for the selected runtimes and clears managed command files first.',
    ],
  };
}

export function createProjectPlan({ profile, mode, dryRun }) {
  const paths = getThreadlinePaths();
  const projectDir = path.join(paths.projectsDir, profile.id, 'workspaces', profile.workspaceId);
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
      write(path.join(profile.root, '.threadline', 'project-profile.json'), 'Materialize project profile into repo')
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
