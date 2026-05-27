import * as p from '@clack/prompts';
import chalk from 'chalk';
import { detectProject } from './core/detect-project.mjs';
import {
  executeApplyPreferences,
  executeHandoffCreate,
  executeLspInit,
  executeProjectInit,
  executeRagIndex,
  executeSetup,
  executeSkillInstall,
} from './core/execute.mjs';
import { getThreadlinePaths } from './core/paths.mjs';
import { createProjectPlan, createSetupPlan } from './core/plan.mjs';
import { readSkillRegistry, recommendSkillsForProfile } from './core/skills.mjs';
import { listAdapters, normalizeRuntimes } from './adapters/index.mjs';
import { onboardCommand } from './commands/onboard.mjs';

// ── tiny helpers ──────────────────────────────────────────────────────────────

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = toCamel(arg.slice(2));
    const next = args[i + 1];
    if (!next || next.startsWith('--')) { flags[key] = true; continue; }
    flags[key] = next;
    i++;
  }
  return flags;
}

function parseList(value) {
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

function toCamel(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** Returns a chalk-coloured "N written, M up to date" summary from a results array. */
function resultSummary(results = []) {
  const written = results.filter((r) => r.changed).length;
  const ok = results.filter((r) => !r.changed).length;
  const parts = [];
  if (written) parts.push(chalk.green(`${written} written`));
  if (ok) parts.push(chalk.dim(`${ok} already up to date`));
  return parts.join(', ') || chalk.dim('nothing to do');
}

/** Exit cleanly if the user pressed Ctrl-C on any prompt. */
function guardCancel(value, msg = 'Operation cancelled.') {
  if (p.isCancel(value)) {
    p.cancel(msg);
    process.exit(0);
  }
  return value;
}

// ── command handlers ──────────────────────────────────────────────────────────

async function runSetup(flags) {
  p.intro(`${chalk.bold.white('Threadline')}  ${chalk.dim('setup')}`);

  const known = listAdapters();
  const defaultRuntimes = ['claude', 'codex'];

  // ── runtimes ──
  let runtimes;
  if (flags.runtimes) {
    runtimes = parseList(flags.runtimes);
  } else {
    const options = known.map((a) => ({ value: a.id, label: a.name, hint: a.homeDir }));
    runtimes = guardCancel(
      await p.multiselect({
        message: 'Which runtimes do you want to set up?',
        options,
        initialValues: defaultRuntimes,
        required: true,
      }),
    );
  }

  // ── mode ──
  let mode;
  if (flags.replace) mode = 'replace';
  else if (flags.adopt) mode = 'adopt';
  else if (flags.merge) mode = 'merge';
  else {
    mode = guardCancel(
      await p.select({
        message: 'Install mode?',
        options: [
          { value: 'merge', label: 'Merge', hint: 'safe, additive — recommended' },
          { value: 'adopt', label: 'Adopt', hint: 'inspect existing config, no writes' },
          { value: 'replace', label: 'Replace', hint: 'overwrite Threadline-managed files' },
        ],
      }),
    );
  }

  // ── replace guard ──
  if (mode === 'replace' && !flags.yes) {
    const confirmed = guardCancel(
      await p.confirm({
        message: `${chalk.yellow('⚠')}  Replace mode overwrites Threadline-managed runtime files. Continue?`,
        initialValue: false,
      }),
    );
    if (!confirmed) { p.cancel('Cancelled replace.'); process.exit(0); }
  }

  // ── AI preferences ──
  let cavemanMode = flags.cavemanMode ?? null;
  let thinkingEnabled = flags.thinking !== undefined ? Boolean(flags.thinking) : null;

  if (cavemanMode === null && !flags.yes) {
    p.log.step(chalk.bold('AI preferences'));
    cavemanMode = guardCancel(
      await p.select({
        message: 'Caveman output compression?',
        options: [
          { value: 'full',   label: 'Full',   hint: '~65% fewer output tokens  ·  recommended' },
          { value: 'lite',   label: 'Lite',   hint: '~30% reduction, natural phrasing' },
          { value: 'ultra',  label: 'Ultra',  hint: '~75% reduction, maximum compression' },
          { value: 'wenyan', label: 'Wenyan', hint: 'classical concise encoding' },
          { value: 'off',    label: 'Off',    hint: 'standard verbosity' },
        ],
        initialValue: 'full',
      }),
    );
  }
  cavemanMode ??= 'full';

  if (thinkingEnabled === null && !flags.yes) {
    thinkingEnabled = guardCancel(
      await p.confirm({
        message: 'Enable extended thinking by default?',
        initialValue: true,
      }),
    );
  }
  thinkingEnabled ??= true;

  // ── dry run ──
  if (flags.dryRun) {
    const plan = createSetupPlan({ mode, runtimes, dryRun: true });
    printPlanInteractive(plan);
    p.log.info(`Caveman: ${chalk.cyan(cavemanMode)}  ·  extended thinking: ${thinkingEnabled ? chalk.green('on') : chalk.dim('off')}`);
    p.outro(chalk.dim('Dry run — nothing written.'));
    return;
  }

  // ── execute ──
  const s = p.spinner();
  s.start('Setting up runtimes…');
  let plan;
  try {
    plan = await executeSetup({ mode, runtimes });
    s.stop('Runtimes configured');
  } catch (err) {
    s.stop(chalk.red('Setup failed'));
    p.log.error(err.message);
    process.exitCode = 1;
    return;
  }

  printResultsNote(plan.results, 'Setup results');

  // ── apply preferences ──
  const sp = p.spinner();
  sp.start('Applying preferences…');
  try {
    const prefPlan = await executeApplyPreferences({ cavemanMode, thinkingEnabled, runtimes });
    sp.stop('Preferences applied');
    printResultsNote(prefPlan.results, 'Preferences');
  } catch (err) {
    sp.stop(chalk.yellow('Preferences skipped'));
    p.log.warn(`Could not apply preferences: ${err.message}`);
  }

  const cavemanNote = cavemanMode !== 'off'
    ? `  Caveman ${chalk.cyan(cavemanMode)} compression active every session`
    : '';
  const thinkingNote = thinkingEnabled
    ? `  Extended thinking ${chalk.green('enabled')} by default`
    : '';
  if (cavemanNote || thinkingNote) {
    p.note([cavemanNote, thinkingNote].filter(Boolean).join('\n'), 'Active preferences');
  }

  p.outro(`${chalk.green('✓')}  Setup complete`);
}

async function runSkillsInstall(flags, rest) {
  p.intro(`${chalk.bold.white('Threadline')}  ${chalk.dim('skills install')}`);

  const known = listAdapters();
  const defaultRuntimes = ['claude'];

  // ── runtimes ──
  let runtimes;
  if (flags.runtimes) {
    runtimes = parseList(flags.runtimes);
  } else {
    const options = known.map((a) => ({ value: a.id, label: a.name }));
    runtimes = guardCancel(
      await p.multiselect({
        message: 'Install for which runtimes?',
        options,
        initialValues: defaultRuntimes,
        required: true,
      }),
    );
  }

  // ── all vs pick ──
  let all = Boolean(flags.all);
  let packIds = [];

  if (!all) {
    const scope = guardCancel(
      await p.select({
        message: 'Which skills do you want to install?',
        options: [
          { value: 'all', label: 'All skills', hint: 'installs every pack in the registry' },
          { value: 'pick', label: 'Pick skills', hint: 'choose from the registry' },
        ],
      }),
    );

    if (scope === 'all') {
      all = true;
    } else {
      const registry = await readSkillRegistry();
      // Group by bucket for cleaner display
      const byBucket = registry.packs.reduce((acc, pack) => {
        (acc[pack.bucket] ??= []).push(pack);
        return acc;
      }, {});
      const options = Object.entries(byBucket).flatMap(([bucket, packs]) =>
        packs.map((pack) => ({
          value: pack.id,
          label: pack.name,
          hint: `[${bucket}]${pack.source?.repo ? `  github:${pack.source.repo}` : '  local'}`,
        })),
      );
      packIds = guardCancel(
        await p.multiselect({
          message: 'Select skill packs',
          options,
          required: true,
        }),
      );
    }
  }

  // ── replace ──
  const replace =
    flags.replace !== undefined
      ? Boolean(flags.replace)
      : guardCancel(
          await p.confirm({
            message: 'Replace existing skill files?',
            initialValue: false,
          }),
        );

  // ── execute ──
  const s = p.spinner();
  s.start('Installing skill packs…');
  let plan;
  try {
    plan = await executeSkillInstall({ runtimes, packIds, all, replace });
    s.stop('Skills installed');
  } catch (err) {
    s.stop(chalk.red('Install failed'));
    p.log.error(err.message);
    process.exitCode = 1;
    return;
  }

  printResultsNote(plan.results, 'Skill results');
  p.outro(`${chalk.green('✓')}  ${plan.notes?.[0] ?? 'Done'}`);
}

async function runSkillsList() {
  const registry = await readSkillRegistry();
  const byBucket = registry.packs.reduce((acc, pack) => {
    (acc[pack.bucket] ??= []).push(pack);
    return acc;
  }, {});

  const lines = [];
  for (const [bucket, packs] of Object.entries(byBucket)) {
    lines.push(chalk.bold(`[${bucket}]`));
    for (const pack of packs) {
      const src = pack.source?.repo
        ? chalk.dim(`  ·  github:${pack.source.repo}`)
        : chalk.dim('  ·  local');
      lines.push(`  ${chalk.cyan(pack.id)}${src}`);
    }
    lines.push('');
  }

  p.note(lines.join('\n').trimEnd(), `Skill Registry  ${chalk.dim(`(${registry.packs.length} packs)`)}`);
}

async function runSkillsRecommend(flags) {
  const s = p.spinner();
  s.start('Detecting project…');
  const profile = await detectProject(flags.path || process.cwd());
  s.stop(`Project: ${chalk.bold(profile.name)}`);

  const registry = await readSkillRegistry();
  const skills = recommendSkillsForProfile(registry, profile);

  const lines = skills.map(
    (sk) =>
      `  ${chalk.cyan(sk.id.padEnd(32))} ${chalk.dim(`[${sk.bucket}]`)}`,
  );
  p.note(lines.join('\n'), `Recommended for ${chalk.bold(profile.name)}`);
}

async function runSkills(subcommand, flags, rest) {
  if (subcommand === 'list') { await runSkillsList(); return; }
  if (subcommand === 'recommend') { await runSkillsRecommend(flags); return; }
  if (subcommand === 'install') { await runSkillsInstall(flags, rest); return; }
  p.log.error(`Unknown skills subcommand: ${chalk.bold(subcommand)}`);
  process.exitCode = 1;
}

async function runDetect(flags) {
  const s = p.spinner();
  s.start('Detecting project…');
  const profile = await detectProject(flags.path || process.cwd());
  s.stop('Project detected');

  if (flags.json) {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  p.note(
    [
      `${chalk.dim('name'.padEnd(12))} ${chalk.bold(profile.name)}`,
      `${chalk.dim('id'.padEnd(12))} ${profile.id}`,
      `${chalk.dim('root'.padEnd(12))} ${profile.root}`,
      `${chalk.dim('stacks'.padEnd(12))} ${profile.stacks.join(', ') || chalk.dim('none detected')}`,
      `${chalk.dim('presets'.padEnd(12))} ${profile.recommendedPresets.join(', ')}`,
      `${chalk.dim('pkg mgr'.padEnd(12))} ${profile.packageManager}`,
    ].join('\n'),
    'Project Profile',
  );
}

async function runInit(flags) {
  p.intro(`${chalk.bold.white('Threadline')}  ${chalk.dim('init')}`);

  const s = p.spinner();
  s.start('Detecting project…');
  const profile = await detectProject(flags.path || process.cwd());
  s.stop(`Detected ${chalk.bold(profile.name)}`);

  p.log.info(
    `Stacks: ${profile.stacks.length ? chalk.cyan(profile.stacks.join(', ')) : chalk.dim('unknown')}`,
  );

  let mode;
  if (flags.repo) mode = 'repo';
  else if (flags.local) mode = 'local';
  else {
    mode = guardCancel(
      await p.select({
        message: 'Where should project state be written?',
        options: [
          { value: 'local', label: 'Local  (XDG)', hint: '~/.local/share/threadline/ — no git changes' },
          { value: 'repo', label: 'Repo', hint: 'writes files into the project — git-visible' },
        ],
      }),
    );
  }

  // ── LSP config ──
  let writeLsp = flags.lsp !== undefined ? Boolean(flags.lsp) : null;
  if (writeLsp === null && profile.stacks.length && !flags.yes) {
    writeLsp = guardCancel(
      await p.confirm({
        message: `Write .vscode/extensions.json + settings.json for ${chalk.cyan(profile.stacks.join(', '))}?`,
        initialValue: true,
      }),
    );
  }
  writeLsp ??= true;

  if (flags.dryRun) {
    const plan = createProjectPlan({ profile, mode, dryRun: true });
    printPlanInteractive(plan);
    if (writeLsp && profile.stacks.length) {
      p.log.info(`Would write .vscode/extensions.json and .vscode/settings.json`);
    }
    p.outro(chalk.dim('Dry run — nothing written.'));
    return;
  }

  const s2 = p.spinner();
  s2.start('Initialising project…');
  let plan;
  try {
    plan = await executeProjectInit({ profile, mode, lsp: false }); // LSP handled below for better UX
    s2.stop('Project initialised');
  } catch (err) {
    s2.stop(chalk.red('Init failed'));
    p.log.error(err.message);
    process.exitCode = 1;
    return;
  }

  printResultsNote(plan.results, 'Project files');

  // ── Write LSP config ──
  if (writeLsp && profile.stacks.length) {
    const sl = p.spinner();
    sl.start('Writing editor config…');
    try {
      const lspPlan = await executeLspInit({ profile });
      sl.stop('Editor config ready');
      printResultsNote(lspPlan.results, 'LSP / editor');
    } catch (err) {
      sl.stop(chalk.yellow('LSP config skipped'));
      p.log.warn(err.message);
    }
  }

  p.outro(`${chalk.green('✓')}  Project ready`);
}

async function runIndex(flags) {
  p.intro(`${chalk.bold.white('Threadline')}  ${chalk.dim('index')}`);

  const s = p.spinner();
  s.start('Detecting project…');
  const profile = await detectProject(flags.path || process.cwd());
  s.stop(`Project: ${chalk.bold(profile.name)}`);

  if (flags.dryRun) {
    p.note('rag.config.json\nrag/manifest.json', 'Would write');
    p.outro(chalk.dim('Dry run — nothing written.'));
    return;
  }

  const s2 = p.spinner();
  s2.start('Building RAG index…');
  let plan;
  try {
    plan = await executeRagIndex({ profile });
    s2.stop('RAG index built');
  } catch (err) {
    s2.stop(chalk.red('Index failed'));
    p.log.error(err.message);
    process.exitCode = 1;
    return;
  }

  printResultsNote(plan.results, 'Index files');
  p.outro(`${chalk.green('✓')}  Index complete`);
}

async function runHandoffCreate(flags) {
  p.intro(`${chalk.bold.white('Threadline')}  ${chalk.dim('handoff create')}`);

  const s = p.spinner();
  s.start('Detecting project…');
  const profile = await detectProject(flags.path || process.cwd());
  s.stop(`Project: ${chalk.bold(profile.name)}`);

  const title =
    flags.title ??
    guardCancel(
      await p.text({
        message: 'Handoff title',
        placeholder: 'e.g. auth-refactor or feat/payments',
        validate: (v) => (v.trim() ? undefined : 'Title is required'),
      }),
    );

  const summary =
    flags.summary ??
    guardCancel(
      await p.text({
        message: 'Summary',
        placeholder: 'Short description of what you are handing off (optional)',
      }),
    );

  const s2 = p.spinner();
  s2.start('Writing handoff…');
  let plan;
  try {
    plan = await executeHandoffCreate({
      profile,
      title: title || undefined,
      summary: summary || undefined,
      vault: flags.vault,
    });
    s2.stop('Handoff created');
  } catch (err) {
    s2.stop(chalk.red('Handoff failed'));
    p.log.error(err.message);
    process.exitCode = 1;
    return;
  }

  const resumeId = plan.notes?.find((n) => n.startsWith('Resume ID:'))?.replace('Resume ID: ', '');
  const handoffFile = plan.results?.[0]?.target;

  p.note(
    [
      resumeId ? `${chalk.dim('resume ID')}   ${chalk.bold.cyan(resumeId)}` : null,
      handoffFile ? `${chalk.dim('file')}        ${handoffFile}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    'Handoff created',
  );

  if (resumeId) {
    p.outro(`${chalk.green('✓')}  Resume with: ${chalk.cyan(`/resume ${resumeId}`)}`);
  } else {
    p.outro(`${chalk.green('✓')}  Done`);
  }
}

async function runHandoff(subcommand, flags) {
  if (subcommand === 'create') { await runHandoffCreate(flags); return; }
  p.log.error(`Unknown handoff subcommand: ${chalk.bold(subcommand)}`);
  process.exitCode = 1;
}

// ── display helpers ───────────────────────────────────────────────────────────

/** Show a p.note box with changed/ok lines + summary title. */
function printResultsNote(results = [], title = 'Results') {
  if (!results.length) return;
  const changed = results.filter((r) => r.changed);
  const unchanged = results.filter((r) => !r.changed).length;
  const lines = changed.map((r) => `${chalk.green('✓')}  ${r.target}`);
  if (unchanged > 0) lines.push(chalk.dim(`   …${unchanged} already up to date`));
  p.note(lines.join('\n'), `${title}  ·  ${resultSummary(results)}`);
}

/** Render a dry-run plan the same way printPlan does but with chalk. */
function printPlanInteractive(plan) {
  p.note(
    plan.actions
      .map((a) => `${a.type === 'write' ? chalk.cyan('WRITE') : chalk.dim('OK   ')}  ${a.target}\n       ${chalk.dim(a.description)}`)
      .join('\n'),
    `${plan.title}  ${chalk.dim('(dry run)')}`,
  );
  if (plan.notes?.length) {
    for (const note of plan.notes) p.log.info(note);
  }
}

function printHelp() {
  console.log(`
${chalk.bold('Threadline')} ${chalk.dim('— portable agent runtime manager')}

${chalk.bold('Usage')}
  ${chalk.cyan('threadline onboard')}   ${chalk.dim('Interactive first-time setup wizard')}
  ${chalk.cyan('threadline setup')}     ${chalk.dim('[--merge|--adopt|--replace] [--runtimes claude,codex,cursor,kimi,opencode,...] [--caveman-mode full|lite|ultra|wenyan|off] [--yes] [--dry-run]')}
  ${chalk.cyan('threadline init')}      ${chalk.dim('[--path <dir>] [--local|--repo] [--dry-run]')}
  ${chalk.cyan('threadline detect')}    ${chalk.dim('[--path <dir>] [--json]')}
  ${chalk.cyan('threadline skills')}    ${chalk.dim('list')}
  ${chalk.cyan('threadline skills')}    ${chalk.dim('install  [--all] [--replace] [--runtimes claude,codex,cursor,kimi,opencode,...] [pack-id ...]')}
  ${chalk.cyan('threadline skills')}    ${chalk.dim('recommend  [--path <dir>]')}
  ${chalk.cyan('threadline index')}     ${chalk.dim('[--path <dir>] [--dry-run]')}
  ${chalk.cyan('threadline handoff')}   ${chalk.dim('create  [--title <t>] [--summary <s>] [--vault <path>]')}
  ${chalk.cyan('threadline paths')}

${chalk.bold('Flags')}
  ${chalk.dim('--dry-run')}          Preview what would be written
  ${chalk.dim('--json')}             Machine-readable output (also disables interactive mode)
  ${chalk.dim('--yes')}              Skip confirmations (uses defaults: caveman=full, thinking=on)
  ${chalk.dim('--caveman-mode')}     full|lite|ultra|wenyan|off  (default: full)
  ${chalk.dim('--thinking')}         true|false  — alwaysThinkingEnabled in settings.json

${chalk.bold('Pipe / CI')}
  ${chalk.dim('Add --json or pipe stdout to force the plain output mode.')}
`);
}

// ── entry point ───────────────────────────────────────────────────────────────

export async function main(argv) {
  const [command = 'help', ...rest] = argv;
  const flags = parseFlags(rest);

  // --json always delegates to plain CLI (machine-readable, pipe-safe)
  if (flags.json) {
    const { main: plainMain } = await import('./cli-plain.mjs');
    return plainMain(argv);
  }

  if (command === 'help' || flags.help) { printHelp(); return; }

  if (command === 'paths') {
    const paths = getThreadlinePaths();
    p.note(
      Object.entries(paths)
        .map(([k, v]) => `${chalk.dim(k.padEnd(14))} ${v}`)
        .join('\n'),
      'Threadline Paths',
    );
    return;
  }

  if (command === 'detect')  { await runDetect(flags); return; }
  if (command === 'onboard') { await onboardCommand(flags); return; }
  if (command === 'setup')   { await runSetup(flags); return; }
  if (command === 'init')    { await runInit(flags); return; }
  if (command === 'index')   { await runIndex(flags); return; }

  if (command === 'skills') {
    const subcommand = rest.find((arg) => !arg.startsWith('--')) || 'list';
    await runSkills(subcommand, flags, rest);
    return;
  }

  if (command === 'handoff') {
    const subcommand = rest.find((arg) => !arg.startsWith('--')) || 'create';
    await runHandoff(subcommand, flags);
    return;
  }

  p.log.error(`Unknown command: ${chalk.bold(command)}`);
  printHelp();
  process.exitCode = 1;
}
