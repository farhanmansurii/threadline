import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { readSkillRegistry } from './skills.mjs';
import { readTemplate, repoRoot } from './templates.mjs';
import { getAdapter, normalizeRuntimes } from '../adapters/index.mjs';
import { copyDir, ensureDir, removePath, writeTextIfChanged } from '../utils/fs.mjs';

const ROOT = repoRoot();

export async function executeSkillInstall({ runtimes, packIds = [], all = false, replace = false }) {
  const normalized = normalizeRuntimes(runtimes);
  const registry = await readSkillRegistry();
  const selected = selectSkillPacks(registry, { packIds, all });
  const results = [];

  if (replace) {
    for (const runtime of normalized) {
      const adapter = getAdapter(runtime);
      await cleanKnownSkillDirs(runtime, registry.packs);
      if (adapter.supports.commands) {
        await cleanKnownCommandFiles(runtime, registry.packs);
      }
    }
  }

  // Track which packs were installed per runtime for post-install hooks.
  const installedPerRuntime = new Map(normalized.map((r) => [r, []]));

  for (const pack of selected) {
    for (const runtime of normalized) {
      const adapter = getAdapter(runtime);
      // threadline-core is always installed; other packs need explicit runtime support.
      if (pack.id !== 'threadline-core' && !pack.runtimes?.[runtime]) continue;
      results.push(...(await installPackForRuntime(pack, runtime, adapter)));
      installedPerRuntime.get(runtime).push(pack);
    }
  }

  // Post-install hook: let each adapter finalize (e.g. Codex writes AGENTS.md slash commands).
  for (const runtime of normalized) {
    const adapter = getAdapter(runtime);
    if (typeof adapter.finalizeInstall === 'function') {
      const packs = installedPerRuntime.get(runtime);
      if (packs.length) {
        const finalResult = await adapter.finalizeInstall(packs);
        if (finalResult) results.push(finalResult);
      }
    }
  }

  const written = results.filter((r) => r.changed).length;
  const upToDate = results.filter((r) => !r.changed).length;
  return {
    title: all ? 'Install all skills' : packIds.length ? 'Install selected skills' : 'Install core skills',
    mode: replace ? 'replace' : 'merge',
    dryRun: false,
    actions: results.map((result) => ({
      type: result.changed ? 'write' : 'ok',
      target: result.target,
      description: result.changed ? 'Install skill pack' : 'Skill already present',
    })),
    notes: [
      `Processed ${selected.length} skill packs for ${normalized.join(', ')}: ${written} written, ${upToDate} already up to date.`,
    ],
    results,
  };
}

function selectSkillPacks(registry, { packIds, all }) {
  const wanted = packIds.length
    ? new Set(packIds)
    : all
      ? new Set(registry.packs.map((pack) => pack.id))
      : new Set(['threadline-core']);
  return registry.packs.filter((pack) => wanted.has(pack.id));
}

async function cleanKnownSkillDirs(runtime, packs) {
  const adapter = getAdapter(runtime);
  if (!adapter.supports.skills) return;
  const skillsHome = path.join(adapter.homeDir, 'skills');
  await ensureDir(skillsHome);
  const dirsToClean = new Set();
  for (const pack of packs) {
    dirsToClean.add(pack.id);
    // Also clean command-named skill dirs (e.g. handoff, resume for threadline-core on Codex).
    for (const command of pack.runtimes?.[runtime]?.commands ?? []) {
      dirsToClean.add(command);
    }
  }
  for (const dir of dirsToClean) {
    await removePath(path.join(skillsHome, dir));
  }
}

async function cleanKnownCommandFiles(runtime, packs) {
  const adapter = getAdapter(runtime);
  if (!adapter.supports.commands) return;
  const commands = new Set();
  for (const pack of packs) {
    for (const command of pack.runtimes?.[runtime]?.commands || []) {
      commands.add(command);
    }
  }
  // Also clean default core commands for any runtime (threadline-core defaults).
  for (const command of ['handoff', 'resume', 'context', 'learnings']) {
    commands.add(command);
  }
  for (const command of commands) {
    await removePath(path.join(adapter.homeDir, 'commands', `${command}.md`));
  }
}

async function installPackForRuntime(pack, runtime, adapter) {
  const source = pack.source;
  const runtimeSpec = pack.runtimes?.[runtime] || {};
  const commands = runtimeSpec.commands ?? (pack.id === 'threadline-core' ? ['handoff', 'resume', 'context', 'learnings'] : []);

  // Command stubs must not overwrite the pack's own skill directory.
  const safeCommands = commands.filter((cmd) => cmd !== pack.id);

  if (source?.type === 'local') {
    const sourceDir = path.join(ROOT, source.path);
    const skillResults = await adapter.installSkills(sourceDir);
    const commandResults = await adapter.installCommands(safeCommands);
    return [...skillResults, ...commandResults];
  }

  if (source?.type === 'github') {
    // Prefer a full skill-tree download: multi-file skills (scripts/, reference/)
    // break if only SKILL.md is copied. Falls back to single-file fetch below.
    const treeDir = await fetchGithubSkillTree(source.repo, source.skill, pack.id).catch(() => null);
    if (treeDir) {
      const skillResults = await adapter.installSkills(treeDir);
      const commandResults = await adapter.installCommands(safeCommands);
      await fs.rm(path.dirname(treeDir), { recursive: true, force: true });
      return [...skillResults, ...commandResults];
    }

    const content = await fetchGithubSkill(source.repo, source.skill).catch(() => null);
    if (content) {
      const targetDir = path.join(adapter.homeDir, 'skills', pack.id);
      await ensureDir(targetDir);
      const result = await writeTextIfChanged(path.join(targetDir, 'SKILL.md'), content);
      const commandResults = await adapter.installCommands(safeCommands);
      return [result, ...commandResults];
    }
    // Network unavailable or repo structure mismatch — fall through to stub below.
  }

  // Stub fallback: pack has no local source and GitHub fetch failed/skipped.
  const targetDir = path.join(adapter.homeDir, 'skills', pack.id);
  await ensureDir(targetDir);
  const wrapper = await createWrapperSkill(pack, runtime);
  const result = await writeTextIfChanged(path.join(targetDir, 'SKILL.md'), wrapper);
  const commandResults = await adapter.installCommands(safeCommands);
  return [result, ...commandResults];
}

async function resolveDefaultBranch(repo) {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}`);
    if (response.ok) {
      const meta = await response.json();
      if (meta?.default_branch) return meta.default_branch;
    }
  } catch {
    // fall through
  }
  return 'main';
}

// Downloads an entire skill directory (SKILL.md plus scripts/, reference/, etc.)
// into a temp dir whose basename equals `packId`, so adapter.installSkills copies
// the full tree. Returns the temp dir path, or null if the tree can't be resolved.
async function fetchGithubSkillTree(repo, skill, packId) {
  const branch = await resolveDefaultBranch(repo);
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
  );
  if (!treeResponse.ok) return null;
  const tree = await treeResponse.json();
  const entries = Array.isArray(tree?.tree) ? tree.tree : [];

  // Locate SKILL.md to derive the skill's base path within the repo.
  const manifest = entries.find(
    (entry) =>
      entry.type === 'blob' &&
      (entry.path === 'SKILL.md' || entry.path.endsWith(`/${skill}/SKILL.md`)),
  );
  if (!manifest) return null;
  const basePath = manifest.path.slice(0, manifest.path.length - 'SKILL.md'.length); // keeps trailing slash or ''

  const blobs = entries.filter(
    (entry) => entry.type === 'blob' && entry.path.startsWith(basePath),
  );
  if (!blobs.length) return null;

  const tmpDir = path.join(os.tmpdir(), `threadline-skill-${packId}-${Date.now()}`, packId);
  await fs.mkdir(tmpDir, { recursive: true });

  for (const blob of blobs) {
    const relative = blob.path.slice(basePath.length);
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${blob.path}`;
    const fileResponse = await fetch(rawUrl);
    if (!fileResponse.ok) {
      await fs.rm(path.dirname(tmpDir), { recursive: true, force: true });
      return null;
    }
    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    const dest = path.join(tmpDir, relative);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
  }

  return tmpDir;
}

async function fetchGithubSkill(repo, skill) {
  // Try common layouts: repo root, skills dir, .claude/skills dir, and raw root.
  const candidates = [
    `https://raw.githubusercontent.com/${repo}/main/${skill}/SKILL.md`,
    `https://raw.githubusercontent.com/${repo}/main/skills/${skill}/SKILL.md`,
    `https://raw.githubusercontent.com/${repo}/main/.claude/skills/${skill}/SKILL.md`,
    `https://raw.githubusercontent.com/${repo}/main/SKILL.md`,
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.text();
    } catch {
      // continue to next candidate
    }
  }
  throw new Error(`GitHub skill not found: ${repo}#${skill} (tried ${candidates.length} URLs)`);
}

async function createWrapperSkill(pack, runtime) {
  const source = pack.source?.repo ? `${pack.source.repo}#${pack.source.skill}` : 'local';
  return `---\nname: ${pack.id}\ndescription: ${pack.name} (Threadline wrapper for ${source})\n---\n\n# ${pack.name}\n\nThis skill is installed by Threadline.\n\nSource: ${source}\nRuntime: ${runtime}\n\nFollow the Threadline registry entry for the active workflow.\n`;
}
