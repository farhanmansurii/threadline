import path from 'node:path';
import { readSkillRegistry } from './skills.mjs';
import { readTemplate, repoRoot } from './templates.mjs';
import { copyDir, ensureDir, writeTextIfChanged, removePath, upsertManagedBlock } from '../utils/fs.mjs';

const ROOT = repoRoot();

export async function executeSkillInstall({ runtimes, packIds = [], all = false, replace = false }) {
  const registry = await readSkillRegistry();
  const selected = selectSkillPacks(registry, { packIds, all });
  const results = [];
  const targets = runtimeTargets(runtimes);

  if (replace) {
    await cleanKnownCommandFiles(runtimes, registry.packs);
    for (const runtime of runtimes) {
      await cleanKnownSkillDirs(runtime, registry.packs);
    }
  }

  for (const pack of selected) {
    for (const runtime of runtimes) {
      const targetRoot = targets[runtime];
      if (!targetRoot || !pack.runtimes?.[runtime]) continue;
      results.push(...(await installPackForRuntime(pack, runtime, targetRoot)));
    }
  }

  // Write slash command routing table to ~/.codex/AGENTS.md for all installed codex packs.
  if (runtimes.includes('codex')) {
    const codexPacks = selected.filter((p) => p.runtimes?.codex);
    const agentsResult = await writeCodexSlashCommands(codexPacks);
    if (agentsResult) results.push(agentsResult);
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
      `Processed ${selected.length} skill packs for ${runtimes.join(', ')}: ${written} written, ${upToDate} already up to date.`,
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

function runtimeTargets(runtimes) {
  const targets = {
    claude: '~/.claude/skills',
    codex: '~/.codex/skills',
  };
  return Object.fromEntries(runtimes.map((runtime) => [runtime, targets[runtime]]).filter(([, target]) => target));
}

async function cleanKnownSkillDirs(runtime, packs) {
  const targetRoot = runtimeTargets([runtime])[runtime];
  if (!targetRoot) return;
  await ensureDir(targetRoot);
  for (const pack of packs) {
    await removePath(path.join(targetRoot, pack.id));
  }
}

async function cleanKnownCommandFiles(runtimes, packs) {
  if (!runtimes.includes('claude')) return;
  const commands = new Set();
  for (const pack of packs) {
    for (const command of pack.runtimes?.claude?.commands || []) {
      commands.add(command);
    }
  }
  for (const command of commands) {
    await removePath(path.join('~/.claude/commands', `${command}.md`));
  }
}

async function installPackForRuntime(pack, runtime, targetRoot) {
  await ensureDir(targetRoot);
  const target = path.join(targetRoot, pack.id);
  const source = pack.source;

  if (source?.type === 'local') {
    const sourceDir = path.join(ROOT, source.path);
    const copied = await copyDir(sourceDir, target);
    const commands = await installRuntimeCommands(pack, runtime);
    return [...copied, ...commands];
  }

  if (source?.type === 'github') {
    const content = await fetchGithubSkill(source.repo, source.skill).catch(() => null);
    if (content) {
      await ensureDir(target);
      const result = await writeTextIfChanged(path.join(target, 'SKILL.md'), content);
      const commands = await installRuntimeCommands(pack, runtime);
      return [result, ...commands];
    }
    // Network unavailable or repo structure mismatch — fall through to stub below.
  }

  // Stub fallback: pack has no local source and GitHub fetch failed/skipped.
  const wrapper = await createWrapperSkill(pack, runtime);
  const result = await writeTextIfChanged(path.join(target, 'SKILL.md'), wrapper);
  const commands = await installRuntimeCommands(pack, runtime);
  return [result, ...commands];
}

async function installRuntimeCommands(pack, runtime) {
  if (!pack.runtimes?.[runtime]?.commands?.length) return [];
  const results = [];
  for (const command of pack.runtimes[runtime].commands) {
    const target = runtime === 'claude' ? `~/.claude/commands/${command}.md` : null;
    if (!target) continue;
    const content = await readCommandTemplate(command).catch(() => null);
    if (!content) continue;
    results.push(await writeTextIfChanged(target, content));
  }
  return results;
}

async function readCommandTemplate(command) {
  return readTemplate(`templates/claude/command-${command}.md`);
}

async function fetchGithubSkill(repo, skill) {
  // Try the two most common layouts in mattpocock/skills-style repos.
  const candidates = [
    `https://raw.githubusercontent.com/${repo}/main/${skill}/SKILL.md`,
    `https://raw.githubusercontent.com/${repo}/main/skills/${skill}/SKILL.md`,
  ];
  for (const url of candidates) {
    const response = await fetch(url);
    if (response.ok) return response.text();
  }
  throw new Error(`GitHub skill not found: ${repo}#${skill} (tried ${candidates.length} URLs)`);
}

async function createWrapperSkill(pack, runtime) {
  const source = pack.source?.repo ? `${pack.source.repo}#${pack.source.skill}` : 'local';
  return `---\nname: ${pack.id}\ndescription: ${pack.name} (Threadline wrapper for ${source})\n---\n\n# ${pack.name}\n\nThis skill is installed by Threadline.\n\nSource: ${source}\nRuntime: ${runtime}\n\nFollow the Threadline registry entry for the active workflow.\n`;
}

/**
 * Write a slash command routing table to ~/.codex/AGENTS.md.
 * Each installed pack gets one or more /command entries so users can type
 * `/handoff`, `/diagnose`, `/react-vite`, etc. instead of relying on $skill-name.
 * Uses upsertManagedBlock so the section is idempotent and survives re-runs.
 */
export async function writeCodexSlashCommands(packs) {
  const rows = [];
  for (const pack of packs) {
    const commands = pack.runtimes?.codex?.commands?.length ? pack.runtimes.codex.commands : [pack.id];
    for (const command of commands) {
      rows.push({ command, name: pack.name, triggers: (pack.triggers ?? []).slice(0, 3).join(', ') });
    }
  }
  if (!rows.length) return null;

  const maxCmd = Math.max(...rows.map((r) => r.command.length + 1)); // +1 for the leading /
  const maxName = Math.max(...rows.map((r) => r.name.length));
  const header = `| ${'Command'.padEnd(maxCmd)} | ${'Skill'.padEnd(maxName)} | Triggers |`;
  const sep = `| ${'-'.repeat(maxCmd)} | ${'-'.repeat(maxName)} | -------- |`;
  const tableRows = rows.map(
    (r) => `| \`/${r.command}\`${' '.repeat(maxCmd - r.command.length - 1)} | ${r.name.padEnd(maxName)} | ${r.triggers || '—'} |`,
  );

  const block = [
    '## Threadline Slash Commands',
    '',
    'Type `/command` to activate a Threadline skill. All commands below are installed and ready to use.',
    '',
    header,
    sep,
    ...tableRows,
    '',
    '> Commands are defined by Threadline. Re-run `threadline install` to refresh this list.',
  ].join('\n');

  return upsertManagedBlock('~/.codex/AGENTS.md', 'THREADLINE_SLASH_COMMANDS', block);
}
