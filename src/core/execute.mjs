import path from 'node:path';
import crypto from 'node:crypto';
import { createProjectPlan, createSetupPlan } from './plan.mjs';
import { getThreadlinePaths } from './paths.mjs';
import { readTemplate, renderTemplate, repoRoot } from './templates.mjs';
import { executeSkillInstall as runSkillInstall } from './skill-install.mjs';
import {
  copyDir,
  fileExists,
  ensureDir,
  expandHome,
  listFilesRecursive,
  readJsonArrayIfExists,
  readTextIfExists,
  upsertManagedBlock,
  writeJsonIfChanged,
  writeTextIfChanged,
  writeTextIfMissing,
} from '../utils/fs.mjs';

export async function executeSetup({ mode, runtimes }) {
  if (!['merge', 'adopt', 'replace'].includes(mode)) {
    throw new Error(`Unknown setup mode: ${mode}`);
  }

  if (mode === 'adopt') {
    return executeAdopt({ runtimes });
  }

  if (mode === 'merge') await preflightSetup({ runtimes });

  const paths = getThreadlinePaths();
  const results = [];
  await ensureDir(paths.configDir);
  await ensureDir(paths.dataDir);
  results.push(await writeTextIfMissing(path.join(paths.configDir, 'config.toml'), defaultConfig()));
  results.push(await writeJsonIfChanged(path.join(paths.configDir, 'skills.lock.json'), defaultSkillsLock()));

  if (mode === 'replace') {
    if (runtimes.includes('codex')) {
      results.push(...(await installCodex({ replace: true })));
    }
    results.push(...(await installSkillBundle({ runtimes, replace: true })));
  } else {
    if (runtimes.includes('claude')) {
      results.push(...(await installClaude()));
    }

    if (runtimes.includes('codex')) {
      results.push(...(await installCodex({ replace: false })));
    }
  }

  return {
    ...createSetupPlan({ mode, runtimes, dryRun: false }),
    results,
  };
}

export async function executeAdopt({ runtimes }) {
  const paths = getThreadlinePaths();
  await ensureDir(paths.dataDir);
  const report = {
    version: 1,
    createdAt: new Date().toISOString(),
    runtimes,
    findings: [],
    recommendations: [],
  };

  if (runtimes.includes('claude')) {
    report.findings.push(await inspectPath('claude-skill', '~/.claude/skills/threadline/SKILL.md'));
    report.findings.push(await inspectPath('claude-handoff-command', '~/.claude/commands/handoff.md'));
    report.findings.push(await inspectPath('claude-resume-command', '~/.claude/commands/resume.md'));
  }

  if (runtimes.includes('codex')) {
    report.findings.push(await inspectPath('codex-skill', '~/.codex/skills/threadline/SKILL.md'));
    const config = (await readTextIfExists('~/.codex/config.toml')) || '';
    report.findings.push({
      id: 'codex-config',
      target: expandHome('~/.codex/config.toml'),
      exists: Boolean(config),
      threadlineManaged: /# BEGIN THREADLINE_MANAGED/.test(config),
      hasUnmanagedConflicts: hasCodexConflictingTables(config),
    });
  }

  report.recommendations = report.findings
    .filter((finding) => !finding.threadlineManaged)
    .map((finding) => `Review ${finding.id} before adopting into Threadline management.`);

  const result = await writeJsonIfChanged(path.join(paths.dataDir, 'adoption-report.json'), report);
  return {
    ...createSetupPlan({ mode: 'adopt', runtimes, dryRun: false }),
    results: [result],
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
  results.push(await writeTextIfChanged('~/.claude/commands/context.md', await readTemplate('templates/claude/command-context.md')));
  results.push(await writeTextIfChanged('~/.claude/commands/learnings.md', await readTemplate('templates/claude/command-learnings.md')));
  return results;
}

async function installCodex({ replace = false } = {}) {
  const root = repoRoot();
  const results = [];
  results.push(...(await copyDir(path.join(root, 'skills/core/threadline'), '~/.codex/skills/threadline')));
  const managed = await readTemplate('templates/codex/config.managed.toml');
  if (replace) {
    results.push(await writeTextIfChanged('~/.codex/config.toml', managed.trimEnd() + '\n'));
    return results;
  }
  const body = managed
    .replace('# BEGIN THREADLINE_MANAGED\n', '')
    .replace('\n# END THREADLINE_MANAGED', '');
  results.push(await upsertManagedBlock('~/.codex/config.toml', 'THREADLINE_MANAGED', body));
  return results;
}

async function installSkillBundle({ runtimes, replace = false }) {
  const plan = await runSkillInstall({ runtimes, all: true, replace });
  return plan.results ?? [];
}

export async function executeSkillInstall({ runtimes, packIds = [], all = false, replace = false }) {
  return runSkillInstall({ runtimes, packIds, all, replace });
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

export async function executeRagIndex({ profile }) {
  const projectDir = getProjectDir(profile);
  const ragDir = path.join(projectDir, 'rag');
  await ensureDir(ragDir);
  const config = createRagConfig(profile);
  const files = await listFilesRecursive(profile.root, config);
  const manifest = {
    version: 1,
    projectId: profile.id,
    workspaceId: profile.workspaceId,
    root: profile.root,
    createdAt: new Date().toISOString(),
    fileCount: files.length,
    files: await Promise.all(files.map((file) => fileManifestEntry(profile.root, file))),
  };
  const results = [
    await writeJsonIfChanged(path.join(projectDir, 'rag.config.json'), config),
    await writeJsonIfChanged(path.join(ragDir, 'manifest.json'), manifest),
  ];
  return {
    title: `RAG index: ${profile.name}`,
    mode: 'manifest',
    dryRun: false,
    actions: [
      { type: 'write', target: path.join(projectDir, 'rag.config.json'), description: 'Write RAG index policy' },
      { type: 'write', target: path.join(ragDir, 'manifest.json'), description: 'Write file manifest for retrieval backend' },
    ],
    notes: ['This alpha index is a manifest, not an embedding/vector index.'],
    results,
  };
}

export async function executeHandoffCreate({ profile, title, summary, vault }) {
  const paths = getThreadlinePaths();
  const handoffId = createHandoffId(title || profile.name);
  const createdAt = new Date().toISOString();
  const vaultRoot = expandHome(vault || process.env.THREADLINE_OBSIDIAN_VAULT || path.join(paths.dataDir, 'obsidian-vault'));
  const projectSlug = slugify(profile.name);
  const handoffDir = path.join(vaultRoot, 'Threadline', 'Projects', projectSlug, 'Handoffs');
  const template = await readTemplate('templates/obsidian/handoff.md');
  const markdown = renderTemplate(template, {
    handoffId,
    projectId: profile.id,
    projectName: profile.name,
    feature: title || profile.name,
    createdAt,
    handoffTitle: title || `Handoff ${handoffId}`,
    summary: summary || `Threadline handoff for ${profile.name}.`,
    decisions: '- Pending',
    changedFiles: '- Pending',
    verification: '- Pending',
    blockers: '- None recorded',
    nextActions: '- Resume with current project profile and inspect repo state.',
  });
  const handoffPath = path.join(handoffDir, `${handoffId}.md`);
  const projectDir = getProjectDir(profile);
  const indexPath = path.join(projectDir, 'handoffs', 'index.json');
  const existing = await readJsonArrayIfExists(indexPath);
  const entry = {
    id: handoffId,
    projectId: profile.id,
    workspaceId: profile.workspaceId,
    title: title || `Handoff ${handoffId}`,
    createdAt,
    path: handoffPath,
  };
  const nextIndex = [entry, ...existing.filter((item) => item.id !== handoffId)];
  const jsonPath = path.join(handoffDir, `${handoffId}.json`);
  const results = [
    await writeTextIfChanged(handoffPath, markdown),
    await writeJsonIfChanged(jsonPath, {
      ...entry,
      summary: summary || `Threadline handoff for ${profile.name}.`,
      root: profile.root,
    }),
    await writeJsonIfChanged(indexPath, nextIndex),
  ];
  return {
    title: `Handoff: ${handoffId}`,
    mode: 'obsidian',
    dryRun: false,
    actions: [
      { type: 'write', target: handoffPath, description: 'Write Obsidian handoff markdown' },
      { type: 'write', target: jsonPath, description: 'Write machine-readable handoff JSON' },
      { type: 'write', target: indexPath, description: 'Update Threadline handoff index' },
    ],
    notes: [`Resume ID: ${handoffId}`],
    results,
  };
}

function getProjectDir(profile) {
  const paths = getThreadlinePaths();
  return path.join(paths.projectsDir, profile.id, 'workspaces', profile.workspaceId);
}

async function inspectPath(id, targetPath) {
  const target = expandHome(targetPath);
  const exists = await fileExists(target);
  const content = exists ? (await readTextIfExists(target)) || '' : '';
  return {
    id,
    target,
    exists,
    threadlineManaged: /Threadline|THREADLINE_MANAGED|threadline/.test(content),
  };
}

function hasCodexConflictingTables(config) {
  const unmanaged = config.replace(/# BEGIN THREADLINE_MANAGED[\s\S]*?# END THREADLINE_MANAGED/g, '');
  return [
    /^\s*\[features\]\s*$/m,
    /^\s*\[mcp_servers\.context7\]\s*$/m,
    /^\s*\[mcp_servers\.playwright\]\s*$/m,
  ].some((pattern) => pattern.test(unmanaged));
}

async function fileManifestEntry(root, file) {
  const content = (await readTextIfExists(file)) || '';
  const { stat } = await import('node:fs/promises');
  const fileStat = await stat(file);
  return {
    path: path.relative(root, file),
    bytes: Buffer.byteLength(content),
    mtimeMs: fileStat.mtimeMs,
    type: path.extname(file).slice(1) || 'text',
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

function createHandoffId(value) {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${slugify(value)}-${date}-${suffix}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'handoff';
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
    include: [
      'README.md',
      'package.json',
      'tsconfig.json',
      'vite.config.*',
      'next.config.*',
      'playwright.config.*',
      'firebase.json',
      'docs/**',
      'src/**',
      'app/**',
      'api/**',
      'tests/**',
    ],
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
