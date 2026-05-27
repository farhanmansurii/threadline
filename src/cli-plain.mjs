import { detectProject } from './core/detect-project.mjs';
import {
  executeHandoffCreate,
  executeProjectInit,
  executeRagIndex,
  executeSetup,
  executeSkillInstall,
} from './core/execute.mjs';
import { getThreadlinePaths } from './core/paths.mjs';
import { createProjectPlan, createSetupPlan } from './core/plan.mjs';
import { readSkillRegistry, recommendSkillsForProfile } from './core/skills.mjs';
import { printPlan } from './utils/print.mjs';

const HELP = `Threadline

Usage:
  threadline setup [--dry-run] [--merge|--adopt|--replace] [--runtimes claude,codex]
  threadline init [--path <repo>] [--dry-run] [--local|--repo]
  threadline detect [--path <repo>] [--json]
  threadline skills list [--json]
  threadline skills install [skill-id ...] [--all] [--replace] [--runtimes claude,codex]
  threadline skills recommend [--path <repo>] [--json]
  threadline index [--path <repo>]
  threadline handoff create [--path <repo>] [--title <title>] [--summary <summary>] [--vault <path>]
  threadline paths

Defaults:
  setup mode: --merge
  init mode:  --local
  runtimes:   claude,codex
`;

export async function main(argv) {
  const [command = 'help', ...rest] = argv;
  const flags = parseFlags(rest);

  if (command === 'help' || flags.help) {
    console.log(HELP);
    return;
  }

  if (command === 'paths') {
    console.log(JSON.stringify(getThreadlinePaths(), null, 2));
    return;
  }

  if (command === 'detect') {
    const profile = await detectProject(flags.path || process.cwd());
    if (flags.json) console.log(JSON.stringify(profile, null, 2));
    else printProject(profile);
    return;
  }

  if (command === 'skills') {
    const subcommand = rest.find((arg) => !arg.startsWith('--')) || 'list';
    // Exclude args that are values of --flags (e.g. the 'claude' in --runtimes claude)
    // so they aren't mistaken for pack IDs.
    const flagValues = new Set();
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].startsWith('--') && i + 1 < rest.length && !rest[i + 1].startsWith('--')) {
        flagValues.add(rest[i + 1]);
      }
    }
    const packIds = rest.filter((arg) => !arg.startsWith('--') && arg !== subcommand && !flagValues.has(arg));
    const registry = await readSkillRegistry();
    if (subcommand === 'list') {
      if (flags.json) console.log(JSON.stringify(registry.packs, null, 2));
      else printSkills(registry.packs);
      return;
    }
    if (subcommand === 'install') {
      const runtimes = parseList(flags.runtimes || 'claude,codex');
      const plan = await executeSkillInstall({
        runtimes,
        packIds,
        all: Boolean(flags.all),
        replace: Boolean(flags.replace),
      });
      printPlan(plan);
      return;
    }
    if (subcommand === 'recommend') {
      const profile = await detectProject(flags.path || process.cwd());
      const skills = recommendSkillsForProfile(registry, profile);
      if (flags.json) console.log(JSON.stringify({ profile, skills }, null, 2));
      else printSkills(skills, `Recommended for ${profile.name}`);
      return;
    }
    throw new Error(`Unknown skills command: ${subcommand}`);
  }

  if (command === 'setup') {
    const mode = flags.replace ? 'replace' : flags.adopt ? 'adopt' : 'merge';
    const runtimes = parseList(flags.runtimes || 'claude,codex');
    if (mode === 'replace' && !flags.yes && !flags.dryRun) {
      throw new Error('setup --replace requires --yes because it can overwrite Threadline-managed runtime files.');
    }
    const plan = flags.dryRun
      ? createSetupPlan({ mode, runtimes, dryRun: true })
      : await executeSetup({ mode, runtimes });
    printPlan(plan);
    return;
  }

  if (command === 'index') {
    const profile = await detectProject(flags.path || process.cwd());
    const plan = flags.dryRun
      ? {
          title: `RAG index: ${profile.name}`,
          mode: 'manifest',
          dryRun: true,
          actions: [
            { type: 'write', target: 'rag.config.json', description: 'Write RAG index policy' },
            { type: 'write', target: 'rag/manifest.json', description: 'Write file manifest for retrieval backend' },
          ],
          notes: ['Dry run only.'],
        }
      : await executeRagIndex({ profile });
    printPlan(plan);
    return;
  }

  if (command === 'handoff') {
    const subcommand = rest.find((arg) => !arg.startsWith('--')) || 'create';
    if (subcommand !== 'create') throw new Error(`Unknown handoff command: ${subcommand}`);
    const profile = await detectProject(flags.path || process.cwd());
    const plan = await executeHandoffCreate({
      profile,
      title: flags.title,
      summary: flags.summary,
      vault: flags.vault,
    });
    printPlan(plan);
    return;
  }

  if (command === 'init') {
    const profile = await detectProject(flags.path || process.cwd());
    const mode = flags.repo ? 'repo' : 'local';
    const plan = flags.dryRun
      ? createProjectPlan({ profile, mode, dryRun: true })
      : await executeProjectInit({ profile, mode });
    printPlan(plan);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

function parseFlags(args) {
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const key = toCamel(arg.slice(2));
    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return flags;
}

function parseList(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function printProject(profile) {
  console.log(`Project: ${profile.name}`);
  console.log(`ID:      ${profile.id}`);
  console.log(`Root:    ${profile.root}`);
  console.log(`Stacks:  ${profile.stacks.join(', ') || 'unknown'}`);
  console.log(`Presets: ${profile.recommendedPresets.join(', ') || 'minimal'}`);
}

function printSkills(skills, title = 'Skills') {
  console.log(title);
  for (const skill of skills) {
    const source = skill.source?.repo ? ` (${skill.source.repo}:${skill.source.skill})` : '';
    console.log(`- ${skill.id} [${skill.bucket}]${source}`);
  }
}
