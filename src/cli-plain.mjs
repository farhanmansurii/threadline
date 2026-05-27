import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { detectProject } from './core/detect-project.mjs';
import {
  executeApplyPreferences,
  executeHandoffCreate,
  executeProjectInit,
  executeRagIndex,
  executeSetup,
  executeSkillInstall,
} from './core/execute.mjs';
import { getThreadlinePaths } from './core/paths.mjs';
import { createProjectPlan, createSetupPlan } from './core/plan.mjs';
import { readSkillRegistry, recommendSkillsForProfile } from './core/skills.mjs';
import { normalizeRuntimes } from './adapters/index.mjs';
import { printPlan } from './utils/print.mjs';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const HELP = `Threadline v${VERSION}

Usage:
  threadline setup [--dry-run] [--merge|--adopt|--replace] [--runtimes claude,codex,cursor,kimi,opencode,...]
  threadline init [--path <repo>] [--dry-run] [--local|--repo]
  threadline detect [--path <repo>] [--json]
  threadline skills list [--json]
  threadline skills install [skill-id ...] [--all] [--replace] [--runtimes claude,codex,cursor,kimi,opencode,...]
  threadline skills recommend [--path <repo>] [--json]
  threadline tools list [--json]
  threadline tools detect
  threadline tools enable <tool-id> [--runtimes claude,codex,...]
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

  if (command === 'help' || command === '--help' || command === '-h' || flags.help) {
    console.log(HELP);
    return;
  }

  if (command === '--version' || command === '-v' || flags.version) {
    console.log(VERSION);
    return;
  }

  if (command === 'paths') {
    console.log(JSON.stringify(getThreadlinePaths(), null, 2));
    return;
  }

  if (command === 'onboard') {
    const { onboardCommand } = await import('./commands/onboard.mjs');
    await onboardCommand(flags);
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
      const runtimes = normalizeRuntimes(parseList(flags.runtimes || 'claude,codex'));
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
    const runtimes = normalizeRuntimes(parseList(flags.runtimes || 'claude,codex'));
    if (mode === 'replace' && !flags.yes && !flags.dryRun) {
      throw new Error('setup --replace requires --yes because it can overwrite Threadline-managed runtime files.');
    }
    const plan = flags.dryRun
      ? createSetupPlan({ mode, runtimes, dryRun: true })
      : await executeSetup({ mode, runtimes });
    printPlan(plan);

    if (!flags.dryRun) {
      const cavemanMode = flags.cavemanMode ?? 'full';
      const thinkingEnabled = flags.thinking !== undefined ? flags.thinking !== 'false' : true;
      const prefPlan = await executeApplyPreferences({ cavemanMode, thinkingEnabled, runtimes });
      if (flags.json) console.log(JSON.stringify(prefPlan, null, 2));
      else printPlan(prefPlan);
    }
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

  if (command === 'tools') {
    const subcommand = rest.find((arg) => !arg.startsWith('--')) || 'list';
    const { detectInstalledTools, readToolPreferences, TOOL_REGISTRY } = await import('./utils/external-tools.mjs');

    if (subcommand === 'list') {
      const detected = await detectInstalledTools();
      const prefs = await readToolPreferences();
      if (flags.json) {
        console.log(JSON.stringify({ tools: detected, preferences: prefs }, null, 2));
        return;
      }
      console.log('Installed tools');
      for (const tool of detected.filter((t) => t.installed)) {
        const enabled = prefs.enabled[tool.id] ? '● enabled' : '○ disabled';
        console.log(`  ${tool.id.padEnd(14)} ${enabled}  ${tool.description}`);
      }
      console.log('\nAvailable (not installed)');
      for (const tool of detected.filter((t) => !t.installed)) {
        console.log(`  ${tool.id.padEnd(14)} ○ not installed  ${tool.description}`);
      }
      return;
    }

    if (subcommand === 'detect') {
      const detected = await detectInstalledTools();
      const installed = detected.filter((t) => t.installed);
      console.log(`Found ${installed.length} tools`);
      for (const tool of installed) {
        console.log(`  ✓  ${tool.name}  ${tool.description}`);
      }
      return;
    }

    if (subcommand === 'enable') {
      const toolId = rest.find((arg) => !arg.startsWith('--') && arg !== subcommand);
      if (!toolId) throw new Error('Usage: threadline tools enable <tool-id>');
      const detected = await detectInstalledTools();
      const tool = detected.find((t) => t.id === toolId);
      if (!tool) throw new Error(`Unknown tool: ${toolId}`);
      if (!tool.installed) throw new Error(`${tool.name} is not installed.`);

      const { readToolPreferences, writeToolPreferences } = await import('./utils/external-tools.mjs');
      const prefs = await readToolPreferences();
      prefs.enabled[toolId] = true;
      await writeToolPreferences(prefs);
      console.log(`✓ ${tool.name} enabled`);
      return;
    }

    throw new Error(`Unknown tools command: ${subcommand}\n\n${HELP}`);
  }

  if (command === 'preferences') {
    const subcommand = rest.find((a) => !a.startsWith('--')) ?? 'set';
    if (subcommand !== 'set') throw new Error(`Unknown preferences command: ${subcommand}`);
    const runtimes = normalizeRuntimes(parseList(flags.runtimes || 'claude,codex'));
    const cavemanMode = flags.cavemanMode ?? 'full';
    const thinkingEnabled = flags.thinking !== undefined ? flags.thinking !== 'false' : true;
    const prefPlan = await executeApplyPreferences({ cavemanMode, thinkingEnabled, runtimes });
    if (flags.json) console.log(JSON.stringify(prefPlan, null, 2));
    else printPlan(prefPlan);
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
