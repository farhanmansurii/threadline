import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createProjectPlan, createSetupPlan } from './plan.mjs';
import { getThreadlinePaths } from './paths.mjs';
import { readTemplate, renderTemplate, repoRoot } from './templates.mjs';
import { executeSkillInstall as runSkillInstall } from './skill-install.mjs';
import { getAdapter, normalizeRuntimes } from '../adapters/index.mjs';
import {
  copyDir,
  fileExists,
  ensureDir,
  expandHome,
  listFilesRecursive,
  readJsonArrayIfExists,
  readJsonIfExists,
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

  const normalized = normalizeRuntimes(runtimes);

  if (mode === 'adopt') {
    return executeAdopt({ runtimes: normalized });
  }

  if (mode === 'merge') await preflightSetup({ runtimes: normalized });

  const paths = getThreadlinePaths();
  const results = [];
  await ensureDir(paths.configDir);
  await ensureDir(paths.dataDir);
  results.push(await writeTextIfMissing(path.join(paths.configDir, 'config.toml'), defaultConfig()));
  results.push(await writeJsonIfChanged(path.join(paths.configDir, 'skills.lock.json'), defaultSkillsLock()));

  if (mode === 'replace') {
    for (const runtime of normalized) {
      const adapter = getAdapter(runtime);
      results.push(...(await adapter.installConfig({ replace: true })));
    }
    results.push(...(await installSkillBundle({ runtimes: normalized, replace: true })));
  } else {
    for (const runtime of normalized) {
      const adapter = getAdapter(runtime);
      results.push(...(await adapter.installConfig({ replace: false })));
    }
    // Merge mode installs only the core skill pack for each runtime (old behaviour).
    const corePlan = await runSkillInstall({ runtimes: normalized, packIds: ['threadline-core'], replace: false });
    results.push(...(corePlan.results ?? []));
  }

  return {
    ...createSetupPlan({ mode, runtimes: normalized, dryRun: false }),
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

  for (const runtime of runtimes) {
    const adapter = getAdapter(runtime);
    if (adapter.adopt) {
      report.findings.push(...(await adapter.adopt()));
    }
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
  for (const runtime of runtimes) {
    const adapter = getAdapter(runtime);
    if (adapter.preflight) {
      await adapter.preflight();
    }
  }
}

export async function executeProjectInit({ profile, mode, lsp = true }) {
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

  // Write LSP / editor config into the project root
  if (lsp) {
    const lspResults = await executeLspInit({ profile });
    results.push(...lspResults.results);
  }

  return {
    ...createProjectPlan({ profile, mode, dryRun: false }),
    results,
  };
}

/**
 * Write .vscode/extensions.json and .vscode/settings.json for the detected stacks.
 * Uses writeTextIfMissing — never overwrites existing editor config.
 */
export async function executeLspInit({ profile }) {
  const vscodeDir = path.join(profile.root, '.vscode');
  await ensureDir(vscodeDir);

  const extensions = buildExtensions(profile.stacks);
  const settings = buildVscodeSettings(profile.stacks);

  const results = [];

  if (extensions.recommendations.length) {
    results.push(
      await writeTextIfMissing(
        path.join(vscodeDir, 'extensions.json'),
        `${JSON.stringify(extensions, null, 2)}\n`,
      ),
    );
  }

  if (Object.keys(settings).length) {
    results.push(
      await writeTextIfMissing(
        path.join(vscodeDir, 'settings.json'),
        `${JSON.stringify(settings, null, 2)}\n`,
      ),
    );
  }

  return {
    title: 'LSP config',
    results,
  };
}

/** Map detected stacks → VS Code extension IDs. */
function buildExtensions(stacks) {
  const recs = new Set();

  if (stacks.includes('typescript') || stacks.includes('node')) {
    recs.add('dbaeumer.vscode-eslint');
    recs.add('esbenp.prettier-vscode');
    recs.add('ms-vscode.vscode-typescript-next');
    recs.add('yoavbls.pretty-ts-errors');
  }
  if (stacks.includes('react') || stacks.includes('nextjs')) {
    recs.add('dsznajder.es7-react-js-snippets');
  }
  if (stacks.includes('nextjs') || stacks.includes('vite')) {
    // Tailwind is common in these stacks
    recs.add('bradlc.vscode-tailwindcss');
  }
  if (stacks.includes('python')) {
    recs.add('ms-python.python');
    recs.add('ms-python.debugpy');
    recs.add('charliermarsh.ruff');
    recs.add('ms-python.black-formatter');
  }
  if (stacks.includes('go')) {
    recs.add('golang.go');
    recs.add('premparihar.gotestexplorer');
  }
  if (stacks.includes('rust')) {
    recs.add('rust-lang.rust-analyzer');
    recs.add('tamasfe.even-better-toml');
    recs.add('vadimcn.vscode-lldb');
  }
  if (stacks.includes('playwright')) {
    recs.add('ms-playwright.playwright');
  }
  if (stacks.includes('firebase')) {
    recs.add('toba.vsfire');
  }

  return { recommendations: [...recs] };
}

/** Map detected stacks → VS Code workspace settings. */
function buildVscodeSettings(stacks) {
  const settings = {};

  const hasTs = stacks.includes('typescript') || stacks.includes('node') || stacks.includes('react') || stacks.includes('nextjs');
  const hasPython = stacks.includes('python');
  const hasGo = stacks.includes('go');
  const hasRust = stacks.includes('rust');

  if (hasTs) {
    Object.assign(settings, {
      'editor.formatOnSave': true,
      'editor.defaultFormatter': 'esbenp.prettier-vscode',
      '[typescript]': { 'editor.defaultFormatter': 'esbenp.prettier-vscode' },
      '[typescriptreact]': { 'editor.defaultFormatter': 'esbenp.prettier-vscode' },
      '[javascript]': { 'editor.defaultFormatter': 'esbenp.prettier-vscode' },
      '[javascriptreact]': { 'editor.defaultFormatter': 'esbenp.prettier-vscode' },
      'typescript.preferences.preferTypeOnlyAutoImports': true,
      'typescript.suggest.completeFunctionCalls': true,
      'eslint.validate': ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
    });
  }

  if (hasPython) {
    Object.assign(settings, {
      'editor.formatOnSave': true,
      '[python]': { 'editor.defaultFormatter': 'charliermarsh.ruff' },
      'python.analysis.typeCheckingMode': 'basic',
      'ruff.fixAll': true,
      'ruff.organizeImports': true,
    });
  }

  if (hasGo) {
    Object.assign(settings, {
      'editor.formatOnSave': true,
      '[go]': { 'editor.defaultFormatter': 'golang.go' },
      'go.useLanguageServer': true,
      'go.lintTool': 'golangci-lint',
    });
  }

  if (hasRust) {
    Object.assign(settings, {
      'editor.formatOnSave': true,
      '[rust]': { 'editor.defaultFormatter': 'rust-lang.rust-analyzer' },
      'rust-analyzer.checkOnSave': true,
      'rust-analyzer.check.command': 'clippy',
    });
  }

  return settings;
}

async function installSkillBundle({ runtimes, replace = false }) {
  const plan = await runSkillInstall({ runtimes, all: true, replace });
  return plan.results ?? [];
}

export async function executeSkillInstall({ runtimes, packIds = [], all = false, replace = false }) {
  return runSkillInstall({ runtimes, packIds, all, replace });
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

/** Return all handoff index entries across every project/workspace, newest first. */
export async function executeHandoffList() {
  const { projectsDir } = getThreadlinePaths();
  const entries = [];

  let projectIds;
  try {
    projectIds = (await fs.readdir(projectsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }

  for (const projectId of projectIds) {
    const workspacesDir = path.join(projectsDir, projectId, 'workspaces');
    let workspaceIds;
    try {
      workspaceIds = (await fs.readdir(workspacesDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const workspaceId of workspaceIds) {
      const indexPath = path.join(workspacesDir, workspaceId, 'handoffs', 'index.json');
      entries.push(...(await readJsonArrayIfExists(indexPath)));
    }
  }

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Resolve a handoff by full or prefix ID match.
 * Returns { found, id, title, projectId, createdAt, root, summary, sections, markdownPath }
 */
export async function executeHandoffResume({ id }) {
  const all = await executeHandoffList();
  const entry = all.find((e) => e.id === id || e.id.startsWith(id));
  if (!entry) return { found: false, id };

  const jsonPath = entry.path.replace(/\.md$/, '.json');
  const full = (await readJsonIfExists(jsonPath)) ?? entry;
  const markdown = await readTextIfExists(entry.path);
  const sections = markdown ? parseHandoffSections(markdown) : {};

  return {
    found: true,
    id: entry.id,
    title: entry.title,
    projectId: entry.projectId,
    createdAt: entry.createdAt,
    root: full.root ?? null,
    summary: full.summary ?? sections.summary ?? 'No summary recorded.',
    sections,
    markdownPath: entry.path,
  };
}

/** Extract ## Section content from a handoff markdown string into a plain object. */
function parseHandoffSections(markdown) {
  const sections = {};
  const parts = markdown.split(/^## /m);
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    if (nl === -1) continue;
    const key = part.slice(0, nl).trim().toLowerCase().replace(/\s+/g, '_');
    sections[key] = part.slice(nl + 1).trim();
  }
  return sections;
}

function getProjectDir(profile) {
  const paths = getThreadlinePaths();
  return path.join(paths.projectsDir, profile.id, 'workspaces', profile.workspaceId);
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
  return `# Threadline user config\n\n[defaults]\nruntimes = ["claude", "codex"]\nproject_mode = "local"\nsetup_mode = "merge"\n`;
}

// ── preferences ───────────────────────────────────────────────────────────────

/**
 * Apply user preferences to Claude Code (and other runtimes).
 *
 * Writes:
 *   ~/.claude/skills/caveman-response/SKILL.md  — if caveman enabled + claude runtime
 *   ~/.claude/settings.json                      — if alwaysThinkingEnabled set + claude runtime
 *   ~/.config/threadline/config.toml             — [preferences] managed block
 */
export async function executeApplyPreferences({ cavemanMode = 'off', thinkingEnabled, runtimes = [] }) {
  const results = [];
  const claudeEnabled = runtimes.includes('claude');

  // 1. Caveman response skill for Claude Code
  if (cavemanMode !== 'off' && claudeEnabled) {
    const skillPath = expandHome('~/.claude/skills/caveman-response/SKILL.md');
    results.push(await writeTextIfChanged(skillPath, buildCavemanSkillMd(cavemanMode)));
  }

  // 2. Extended thinking + statusLine for Claude Code
  if (claudeEnabled) {
    const settingsPath = expandHome('~/.claude/settings.json');
    const existing = (await readJsonIfExists(settingsPath)) ?? {};
    const next = { ...existing };
    if (thinkingEnabled !== undefined) {
      next.alwaysThinkingEnabled = Boolean(thinkingEnabled);
    }
    // Add a caveman indicator to the status line so it's visible at a glance
    const modeEmoji = { lite: '🗿', full: '🗿🗿', ultra: '🗿🗿🗿', wenyan: '甲', off: '' };
    if (cavemanMode !== 'off') {
      const label = `caveman:${cavemanMode} ${modeEmoji[cavemanMode] ?? ''}`.trim();
      next.statusLine = label;
    } else {
      // Remove caveman from statusLine if turning off — leave other content intact
      if (typeof next.statusLine === 'string' && next.statusLine.startsWith('caveman:')) {
        delete next.statusLine;
      }
    }
    results.push(await writeJsonIfChanged(settingsPath, next));
  }

  // 3. Preferences block in config.toml
  const { configDir } = getThreadlinePaths();
  await ensureDir(configDir);
  const configPath = path.join(configDir, 'config.toml');
  const lines = ['[preferences]', `caveman_mode = "${cavemanMode}"`];
  if (thinkingEnabled !== undefined) lines.push(`extended_thinking = ${Boolean(thinkingEnabled)}`);
  results.push(await upsertManagedBlock(configPath, 'threadline-preferences', lines.join('\n')));

  return {
    title: 'Preferences applied',
    dryRun: false,
    actions: [
      ...(cavemanMode !== 'off' && claudeEnabled
        ? [{ type: 'write', target: '~/.claude/skills/caveman-response/SKILL.md', description: `Caveman ${cavemanMode} mode — auto-activates every session` }]
        : []),
      ...(claudeEnabled && thinkingEnabled !== undefined
        ? [{ type: 'write', target: '~/.claude/settings.json', description: `alwaysThinkingEnabled: ${Boolean(thinkingEnabled)}` }]
        : []),
      { type: 'write', target: configPath, description: 'Threadline preferences' },
    ],
    results,
  };
}

/** Build a caveman SKILL.md that auto-activates at the given mode every Claude Code session. */
function buildCavemanSkillMd(mode) {
  const modeTitle = { lite: 'Lite', full: 'Full', ultra: 'Ultra', wenyan: 'Wenyan' }[mode] ?? mode;

  const grammarBase = `\
## Grammar

- Drop articles (a, an, the).
- Drop filler (just, really, basically, simply, actually, very, quite).
- Drop aux verbs where a fragment works (is, are, was, were, being).
- Drop pleasantries (certainly, of course, sure, great, absolutely).
- No hedging (skip might, perhaps, could be worth).
- Fragments fine.`;

  const symbols = `\
## Symbols (prefer over words)

\`\`\`
→   leads to / becomes / on <x> do <y>
∴   therefore / fix is
∀   for all / every
∃   exists / some
!   must / required
?   may / optional / unknown
⊥   never / forbidden / nil
≠   not equal
∈   in / part of
∉   not in
≤   at most
≥   at least
&   and
|   or
§   section reference
\`\`\`

Short synonyms: fix > implement, big > extensive, run > execute.`;

  const ultraRules = `\
## Ultra additions

- Drop implied subject ("Run tests" not "You should run tests").
- Drop "the following": "Steps:" not "The following steps:".
- Minimal punctuation — prefer line breaks over commas.
- Abbreviate freely: fn, arg, ret, err, cfg, dir, req, opt.
- Max 2 words per label.`;

  const wenyanRules = `\
## Wenyan additions

- Ideographic and fragment-first style.
- All numbers as numerals.
- Drop all filler, particles, connectives.
- Terse noun phrases over sentences.
- No sentences where a list or table serves.`;

  const body = {
    lite: grammarBase,
    full: `${grammarBase}\n\n${symbols}`,
    ultra: `${grammarBase}\n\n${symbols}\n\n${ultraRules}`,
    wenyan: `${grammarBase}\n\n${symbols}\n\n${wenyanRules}`,
  }[mode] ?? grammarBase;

  return `---
name: caveman-response
description: Auto-activates caveman response compression at ${modeTitle} mode. Managed by Threadline.
---

# Caveman Response — ${modeTitle} mode

**Always compress ALL responses using caveman ${modeTitle} encoding.** Activate from the first message — no trigger or slash command needed.

## Preserve verbatim

Never compress:
- Code blocks and inline backtick snippets.
- File paths, URLs, identifiers (function names, variable names, env vars).
- Numbers, versions, error strings, SQL, regex, JSON, YAML.
- Quoted strings.

${body}
`;
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
