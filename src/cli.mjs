import { detectProject } from './core/detect-project.mjs';
import { getRelayKitPaths } from './core/paths.mjs';
import { createProjectPlan, createSetupPlan } from './core/plan.mjs';
import { printPlan } from './utils/print.mjs';

const HELP = `RelayKit

Usage:
  relaykit setup [--dry-run] [--merge|--adopt|--replace] [--runtimes claude,codex]
  relaykit init [--path <repo>] [--dry-run] [--local|--repo]
  relaykit detect [--path <repo>] [--json]
  relaykit paths

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
    console.log(JSON.stringify(getRelayKitPaths(), null, 2));
    return;
  }

  if (command === 'detect') {
    const profile = await detectProject(flags.path || process.cwd());
    if (flags.json) console.log(JSON.stringify(profile, null, 2));
    else printProject(profile);
    return;
  }

  if (command === 'setup') {
    const plan = createSetupPlan({
      mode: flags.replace ? 'replace' : flags.adopt ? 'adopt' : 'merge',
      runtimes: parseList(flags.runtimes || 'claude,codex'),
      dryRun: flags.dryRun !== false,
    });
    printPlan(plan);
    return;
  }

  if (command === 'init') {
    const profile = await detectProject(flags.path || process.cwd());
    const plan = createProjectPlan({
      profile,
      mode: flags.repo ? 'repo' : 'local',
      dryRun: flags.dryRun !== false,
    });
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
