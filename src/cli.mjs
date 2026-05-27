import { detectProject } from './core/detect-project.mjs';
import { executeProjectInit, executeSetup } from './core/execute.mjs';
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
  threadline skills recommend [--path <repo>] [--json]
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
    const registry = await readSkillRegistry();
    if (subcommand === 'list') {
      if (flags.json) console.log(JSON.stringify(registry.packs, null, 2));
      else printSkills(registry.packs);
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
    const plan = flags.dryRun
      ? createSetupPlan({ mode, runtimes, dryRun: true })
      : await executeSetup({ mode, runtimes });
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
