import path from 'node:path';
import { readSkillRegistry } from './skills.mjs';
import { readTemplate, repoRoot } from './templates.mjs';
import { copyDir, ensureDir, writeTextIfChanged, removePath } from '../utils/fs.mjs';

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

  return {
    title: all ? 'Install all skills' : packIds.length ? 'Install selected skills' : 'Install core skills',
    mode: replace ? 'replace' : 'merge',
    dryRun: false,
    actions: results.map((result) => ({
      type: result.changed ? 'write' : 'ok',
      target: result.target,
      description: result.changed ? 'Install skill pack' : 'Skill already present',
    })),
    notes: [`Installed ${selected.length} skill packs for ${runtimes.join(', ')}.`],
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

async function createWrapperSkill(pack, runtime) {
  const source = pack.source?.repo ? `${pack.source.repo}#${pack.source.skill}` : 'local';
  return `---\nname: ${pack.id}\ndescription: ${pack.name} (Threadline wrapper for ${source})\n---\n\n# ${pack.name}\n\nThis skill is installed by Threadline.\n\nSource: ${source}\nRuntime: ${runtime}\n\nFollow the Threadline registry entry for the active workflow.\n`;
}
