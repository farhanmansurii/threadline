import path from 'node:path';
import { createProjectPlan, createSetupPlan } from './plan.mjs';
import { getThreadlinePaths } from './paths.mjs';
import { readTemplate, renderTemplate, repoRoot } from './templates.mjs';
import {
  copyDir,
  ensureDir,
  expandHome,
  readTextIfExists,
  upsertManagedBlock,
  writeJsonIfChanged,
  writeTextIfChanged,
  writeTextIfMissing,
} from '../utils/fs.mjs';

export async function executeSetup({ mode, runtimes }) {
  if (mode !== 'merge') {
    throw new Error(`setup --${mode} is not implemented yet. Use --merge.`);
  }

  await preflightSetup({ runtimes });

  const paths = getThreadlinePaths();
  const results = [];
  await ensureDir(paths.configDir);
  await ensureDir(paths.dataDir);
  results.push(await writeTextIfMissing(path.join(paths.configDir, 'config.toml'), defaultConfig()));
  results.push(await writeJsonIfChanged(path.join(paths.configDir, 'skills.lock.json'), defaultSkillsLock()));

  if (runtimes.includes('claude')) {
    results.push(...(await installClaude()));
  }

  if (runtimes.includes('codex')) {
    results.push(...(await installCodex()));
  }

  return {
    ...createSetupPlan({ mode, runtimes, dryRun: false }),
    results,
  };
}

async function preflightSetup({ runtimes }) {
  if (runtimes.includes('codex')) {
    await assertCodexManagedBlockIsSafe('~/.codex/config.toml');
  }
}

export async function executeProjectInit({ profile, mode }) {
  if (mode !== 'local') {
    throw new Error('init --repo is not implemented yet. Use --local.');
  }

  const paths = getThreadlinePaths();
  const projectDir = path.join(paths.projectsDir, profile.id, 'workspaces', profile.workspaceId);
  const generatedDir = path.join(projectDir, 'generated');
  await ensureDir(generatedDir);

  const agentsTemplate = await readTemplate('templates/project/AGENTS.generated.md');
  const agents = renderTemplate(agentsTemplate, {
    projectName: profile.name,
    projectId: profile.id,
    stacks: profile.stacks,
  });

  const results = [
    await writeJsonIfChanged(path.join(projectDir, 'project-profile.json'), profile),
    await writeTextIfChanged(path.join(generatedDir, 'AGENTS.generated.md'), agents),
    await writeJsonIfChanged(path.join(projectDir, 'rag.config.json'), createRagConfig(profile)),
    await writeJsonIfChanged(path.join(projectDir, 'handoff.config.json'), createHandoffConfig(profile)),
  ];

  return {
    ...createProjectPlan({ profile, mode, dryRun: false }),
    results,
  };
}

async function installClaude() {
  const root = repoRoot();
  const results = [];
  results.push(...(await copyDir(path.join(root, 'skills/core/threadline'), '~/.claude/skills/threadline')));
  results.push(await writeTextIfChanged('~/.claude/commands/handoff.md', await readTemplate('templates/claude/command-handoff.md')));
  results.push(await writeTextIfChanged('~/.claude/commands/resume.md', await readTemplate('templates/claude/command-resume.md')));
  return results;
}

async function installCodex() {
  const root = repoRoot();
  const results = [];
  results.push(...(await copyDir(path.join(root, 'skills/core/threadline'), '~/.codex/skills/threadline')));
  const managed = await readTemplate('templates/codex/config.managed.toml');
  const body = managed
    .replace('# BEGIN THREADLINE_MANAGED\n', '')
    .replace('\n# END THREADLINE_MANAGED', '');
  results.push(await upsertManagedBlock('~/.codex/config.toml', 'THREADLINE_MANAGED', body));
  return results;
}

async function assertCodexManagedBlockIsSafe(filePath) {
  const existing = (await readTextIfExists(expandHome(filePath))) || '';
  const unmanaged = existing.replace(/# BEGIN THREADLINE_MANAGED[\s\S]*?# END THREADLINE_MANAGED/g, '');
  const conflictingTables = [
    /^\s*\[features\]\s*$/m,
    /^\s*\[mcp_servers\.context7\]\s*$/m,
    /^\s*\[mcp_servers\.playwright\]\s*$/m,
  ];
  if (conflictingTables.some((pattern) => pattern.test(unmanaged))) {
    throw new Error(
      'Refusing to merge ~/.codex/config.toml because unmanaged [features], [mcp_servers.context7], or [mcp_servers.playwright] tables already exist. Move them into a THREADLINE_MANAGED block or merge manually.'
    );
  }
}

function defaultConfig() {
  return `# Threadline user config\n\n[defaults]\nruntimes = [\"claude\", \"codex\"]\nproject_mode = \"local\"\nsetup_mode = \"merge\"\n`;
}

function defaultSkillsLock() {
  return {
    version: 1,
    managedBy: 'threadline',
    skills: ['threadline-core'],
  };
}

function createRagConfig(profile) {
  return {
    version: 1,
    projectId: profile.id,
    include: ['README.md', 'docs/**', 'src/**', 'app/**', 'api/**', 'tests/**'],
    exclude: ['.git/**', 'node_modules/**', 'dist/**', 'build/**', '.next/**', '.vite/**', '.env*'],
  };
}

function createHandoffConfig(profile) {
  return {
    version: 1,
    projectId: profile.id,
    directory: 'handoffs',
    idFormat: '<feature>-<yyyy-mm-dd>-<shortid>',
    requireApprovalForObsidianWrite: true,
  };
}
