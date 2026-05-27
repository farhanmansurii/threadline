import * as p from '@clack/prompts';
import chalk from 'chalk';
import os from 'node:os';
import path from 'node:path';
import { detectProject } from '../core/detect-project.mjs';
import { executeSetup, executeProjectInit, executeApplyPreferences } from '../core/execute.mjs';
import { createSetupPlan, createProjectPlan } from '../core/plan.mjs';
import { getThreadlinePaths } from '../core/paths.mjs';
import { detectInstalledRuntimes } from '../utils/detect-runtimes.mjs';
import { fileExists, readJsonIfExists } from '../utils/fs.mjs';
import {
  splash,
  stepLabel,
  statusOk,
  statusSkip,
  statusWarn,
  statusInfo,
  divider,
  sectionTitle,
  muted,
  highlight,
  code,
  renderRuntimeList,
  renderTable,
} from '../utils/ascii.mjs';

const TOTAL_STEPS = 6;

export async function onboardCommand(flags = {}) {
  // ── 0. Splash ──────────────────────────────────────────────────────────────
  console.clear();
  console.log(splash());

  const isFirstRun = await checkIsFirstRun();
  if (isFirstRun) {
    p.log.info(muted('Welcome! This will take about 60 seconds.'));
  }

  // ── 1. System Scan ─────────────────────────────────────────────────────────
  const step1 = stepLabel(1, TOTAL_STEPS, '🔍 Scanning your system…');
  const s1 = p.spinner();
  s1.start(step1);

  const nodeVersion = process.version;
  const nodeOk = parseInt(nodeVersion.slice(1), 10) >= 20;
  const detectedRuntimes = await detectInstalledRuntimes();
  const hasGit = await commandExists('git');

  s1.stop(`${step1}  ${nodeOk ? statusOk('Node ' + nodeVersion) : statusWarn('Node ' + nodeVersion)}`);

  p.log.info(renderTable([
    { label: 'Git', value: hasGit ? statusOk('detected') : statusSkip('not found') },
    { label: 'OS', value: os.platform() + ' (' + os.arch() + ')' },
    { label: 'Home', value: muted(os.homedir()) },
  ]));

  const installed = detectedRuntimes.filter((r) => r.installed);
  const notInstalled = detectedRuntimes.filter((r) => !r.installed);

  if (installed.length) {
    p.log.success(`Found ${highlight(installed.length)} installed runtime(s):`);
    p.log.message(renderRuntimeList(installed));
  }

  if (notInstalled.length) {
    p.log.message(muted(`Other runtimes available:\n` + renderRuntimeList(notInstalled)));
  }

  // ── 2. Runtime Selection ───────────────────────────────────────────────────
  const step2 = stepLabel(2, TOTAL_STEPS, '🤖 Select runtimes to set up');
  p.log.info(step2);

  const defaultSelections = detectedRuntimes
    .filter((r) => r.installed)
    .map((r) => r.id);

  let runtimes;
  if (flags.runtimes) {
    runtimes = parseList(flags.runtimes);
  } else if (flags.yes) {
    runtimes = defaultSelections.length ? defaultSelections : ['claude', 'codex'];
  } else {
    runtimes = guardCancel(
      await p.multiselect({
        message: 'Which AI assistants do you want Threadline to manage?',
        options: [
          ...detectedRuntimes.map((r) => ({
            value: r.id,
            label: `${r.name}${r.installed ? '' : muted('  (not detected)')}`,
            hint: r.installed ? chalk.green('installed') : undefined,
          })),
          // Allow arbitrary runtimes via text input fallback in generic adapter
        ],
        initialValues: defaultSelections.length ? defaultSelections : ['claude', 'codex'],
        required: true,
      }),
    );
  }

  if (!runtimes.length) {
    p.cancel('No runtimes selected. Exiting.');
    process.exit(0);
  }

  // ── 3. Project Detection ───────────────────────────────────────────────────
  const step3 = stepLabel(3, TOTAL_STEPS, '📁 Project check');
  p.log.info(step3);

  const s3 = p.spinner();
  s3.start('Detecting project…');
  let profile;
  try {
    profile = await detectProject(flags.path || process.cwd());
    s3.stop(`Detected ${highlight(profile.name)}`);
  } catch {
    s3.stop(statusSkip('No project detected'));
  }

  let initProject = false;
  if (profile) {
    p.log.info(renderTable([
      { label: 'Name', value: profile.name },
      { label: 'Stacks', value: profile.stacks.join(', ') || muted('none') },
      { label: 'Presets', value: profile.recommendedPresets.join(', ') },
    ]));

    if (flags.local || flags.repo) {
      initProject = true;
    } else if (flags.yes) {
      initProject = true;
    } else {
      initProject = guardCancel(
        await p.confirm({
          message: 'Create a Threadline project profile for this repo?',
          initialValue: true,
        }),
      );
    }
  }

  // ── 4. AI Preferences ─────────────────────────────────────────────────────
  const step4 = stepLabel(4, TOTAL_STEPS, '⚙️  AI preferences');
  p.log.info(step4);

  let cavemanMode = flags.cavemanMode ?? null;
  let thinkingEnabled = flags.thinking !== undefined ? Boolean(flags.thinking) : null;

  if (cavemanMode === null && !flags.yes) {
    cavemanMode = guardCancel(
      await p.select({
        message: 'Caveman response compression?',
        options: [
          { value: 'full',   label: 'Full',   hint: chalk.green('~65% fewer tokens  ·  recommended') },
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

  // ── 5. Mode Selection ──────────────────────────────────────────────────────
  const step5 = stepLabel(5, TOTAL_STEPS, '🛡️  Install mode');
  p.log.info(step5);

  let mode;
  if (flags.replace) mode = 'replace';
  else if (flags.adopt) mode = 'adopt';
  else if (flags.merge) mode = 'merge';
  else if (flags.yes) mode = 'merge';
  else {
    const choice = guardCancel(
      await p.select({
        message: 'How should Threadline install?',
        options: [
          {
            value: 'merge',
            label: 'Merge',
            hint: chalk.green('safe, additive — recommended'),
          },
          {
            value: 'adopt',
            label: 'Adopt',
            hint: 'inspect only, no writes',
          },
          {
            value: 'replace',
            label: 'Replace',
            hint: chalk.yellow('overwrite managed files'),
          },
        ],
      }),
    );
    mode = choice;
  }

  if (mode === 'replace' && !flags.yes) {
    const confirmed = guardCancel(
      await p.confirm({
        message: `${chalk.yellow('⚠')}  Replace mode will overwrite Threadline-managed files. Continue?`,
        initialValue: false,
      }),
    );
    if (!confirmed) {
      p.cancel('Cancelled replace.');
      process.exit(0);
    }
  }

  // ── 6. Execute ─────────────────────────────────────────────────────────────
  const step6 = stepLabel(6, TOTAL_STEPS, '⚡ Installing…');
  p.log.info(step6);

  if (flags.dryRun) {
    const plan = createSetupPlan({ mode, runtimes, dryRun: true });
    printDryRun(plan);
    if (initProject && profile) {
      const projectPlan = createProjectPlan({ profile, mode: 'local', dryRun: true });
      printDryRun(projectPlan);
    }
    p.log.info(`Caveman: ${chalk.cyan(cavemanMode)}  ·  extended thinking: ${thinkingEnabled ? chalk.green('on') : chalk.dim('off')}`);
    p.outro(chalk.dim('Dry run — nothing written.'));
    return;
  }

  // Setup runtimes
  const s5 = p.spinner();
  s5.start('Configuring runtimes…');
  let setupResult;
  try {
    setupResult = await executeSetup({ mode, runtimes });
    s5.stop(statusOk('Runtimes configured'));
  } catch (err) {
    s5.stop(statusError('Setup failed'));
    p.log.error(err.message);
    process.exitCode = 1;
    return;
  }

  printResults(setupResult.results);

  // Apply preferences
  const sp = p.spinner();
  sp.start('Applying preferences…');
  try {
    const prefPlan = await executeApplyPreferences({ cavemanMode, thinkingEnabled, runtimes });
    sp.stop(statusOk('Preferences applied'));
    printResults(prefPlan.results);
  } catch (err) {
    sp.stop(statusWarn('Preferences skipped'));
    p.log.warn(err.message);
  }

  // Init project if requested
  if (initProject && profile) {
    const s6 = p.spinner();
    s6.start(`Initializing ${profile.name}…`);
    let initResult;
    try {
      initResult = await executeProjectInit({ profile, mode: 'local' });
      s6.stop(statusOk('Project profile created'));
    } catch (err) {
      s6.stop(statusError('Project init failed'));
      p.log.error(err.message);
      process.exitCode = 1;
      return;
    }
    printResults(initResult.results);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  printSummary({ runtimes, mode, profile, initProject, cavemanMode, thinkingEnabled });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function guardCancel(value, msg = 'Operation cancelled.') {
  if (p.isCancel(value)) {
    p.cancel(msg);
    process.exit(0);
  }
  return value;
}

function parseList(value) {
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

async function checkIsFirstRun() {
  const paths = getThreadlinePaths();
  const configExists = await fileExists(paths.configDir);
  const dataExists = await fileExists(paths.dataDir);
  return !configExists && !dataExists;
}

async function commandExists(cmd) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const isWindows = os.platform() === 'win32';
  const shell = isWindows ? 'where' : 'which';
  try {
    await execFileAsync(shell, [cmd], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

function printDryRun(plan) {
  const lines = plan.actions.map((a) => {
    const symbol = a.type === 'write' ? chalk.cyan('WRITE') : chalk.dim('OK   ');
    return `  ${symbol}  ${a.target}`;
  });
  p.note(lines.join('\n'), `${plan.title}  ${chalk.dim('(dry run)')}`);
}

function printResults(results = []) {
  if (!results.length) return;
  const changed = results.filter((r) => r.changed);
  const unchanged = results.filter((r) => !r.changed).length;
  const lines = changed.map((r) => `  ${chalk.green('✓')}  ${path.basename(r.target) || r.target}`);
  if (unchanged > 0) lines.push(chalk.dim(`     …${unchanged} already up to date`));
  if (lines.length) p.log.message(lines.join('\n'));
}

function printSummary({ runtimes, mode, profile, initProject, cavemanMode, thinkingEnabled }) {
  const runtimesStr = runtimes.map((r) => chalk.cyan(r)).join(', ');
  const prefLines = [];
  if (cavemanMode && cavemanMode !== 'off') {
    prefLines.push({ label: 'Caveman', value: chalk.cyan(cavemanMode) });
  }
  if (thinkingEnabled !== undefined) {
    prefLines.push({ label: 'Thinking', value: thinkingEnabled ? chalk.green('on') : chalk.dim('off') });
  }

  const lines = [
    '',
    divider(),
    '',
    `  ${chalk.bold.green('🎉 Onboarding complete!')}`,
    '',
    renderTable([
      { label: 'Runtimes', value: runtimesStr },
      { label: 'Mode', value: mode },
      ...(profile ? [
        { label: 'Project', value: profile.name },
        { label: 'Profile', value: initProject ? statusOk('created') : statusSkip('skipped') },
      ] : []),
      ...prefLines,
    ]),
    '',
    `  ${sectionTitle('Quick commands')}`,
    `    ${code('threadline handoff create --title "my feature"')}`,
    `    ${code('threadline skills recommend')}`,
    `    ${code('threadline index')}`,
    '',
    `  ${sectionTitle('Resume anytime')}`,
    `    ${muted('Use your handoff resume ID in any supported agent.')}`,
    '',
    divider(),
  ];

  console.log(lines.join('\n'));
}
