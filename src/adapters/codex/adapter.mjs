import path from 'node:path';
import { copyDir, ensureDir, expandHome, readTextIfExists, upsertManagedBlock, writeTextIfChanged } from '../../utils/fs.mjs';
import { readTemplate } from '../../core/templates.mjs';

export const id = 'codex';
export const name = 'Codex';
export const homeDir = '~/.codex';
// Codex has no native slash command files. Commands are written as a routing
// table in AGENTS.md via finalizeInstall after all packs are processed.
export const supports = { skills: true, commands: false, config: true };

export async function installSkills(sourceDir, { replace = false } = {}) {
  const targetDir = path.join(homeDir, 'skills', path.basename(sourceDir));
  await ensureDir(path.dirname(targetDir));
  return copyDir(sourceDir, targetDir);
}

export async function installCommands() {
  // Codex does not support per-file command installation.
  // Slash commands are written in bulk by finalizeInstall via AGENTS.md.
  return [];
}

/**
 * Called once after all packs are installed. Writes a slash command routing
 * table to ~/.codex/AGENTS.md so users can type /command to invoke any skill.
 *
 * @param {Array} packs - The full list of pack objects installed for this runtime.
 */
export async function finalizeInstall(packs) {
  const rows = [];
  for (const pack of packs) {
    const commands = pack.runtimes?.codex?.commands?.length ? pack.runtimes.codex.commands : [pack.id];
    for (const command of commands) {
      rows.push({ command, name: pack.name, triggers: (pack.triggers ?? []).slice(0, 3).join(', ') });
    }
  }
  if (!rows.length) return null;

  const maxCmd = Math.max(...rows.map((r) => r.command.length + 1)); // +1 for leading /
  const maxName = Math.max(...rows.map((r) => r.name.length));
  const header = `| ${'Command'.padEnd(maxCmd)} | ${'Skill'.padEnd(maxName)} | Triggers |`;
  const sep = `| ${'-'.repeat(maxCmd)} | ${'-'.repeat(maxName)} | -------- |`;
  const tableRows = rows.map(
    (r) =>
      `| \`/${r.command}\`${' '.repeat(maxCmd - r.command.length - 1)} | ${r.name.padEnd(maxName)} | ${r.triggers || '—'} |`,
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

  return upsertManagedBlock(path.join(homeDir, 'AGENTS.md'), 'THREADLINE_SLASH_COMMANDS', block);
}

export async function installConfig({ replace = false } = {}) {
  const configPath = path.join(homeDir, 'config.toml');
  const managed = await readTemplate('templates/codex/config.managed.toml');
  if (replace) {
    return [await writeTextIfChanged(configPath, managed.trimEnd() + '\n')];
  }
  const body = managed
    .replace('# BEGIN THREADLINE_MANAGED\n', '')
    .replace('\n# END THREADLINE_MANAGED', '');
  return [await upsertManagedBlock(configPath, 'THREADLINE_MANAGED', body)];
}

export async function adopt() {
  const findings = [];
  findings.push(await inspectPath('codex-skill', path.join(homeDir, 'skills', 'threadline', 'SKILL.md')));
  const config = (await readTextIfExists(path.join(homeDir, 'config.toml'))) || '';
  findings.push({
    id: 'codex-config',
    target: expandHome(path.join(homeDir, 'config.toml')),
    exists: Boolean(config),
    threadlineManaged: /# BEGIN THREADLINE_MANAGED/.test(config),
    hasUnmanagedConflicts: hasCodexConflictingTables(config),
  });
  return findings;
}

export async function preflight() {
  const existing = (await readTextIfExists(expandHome(path.join(homeDir, 'config.toml')))) || '';
  const unmanaged = existing.replace(/# BEGIN THREADLINE_MANAGED[\s\S]*?# END THREADLINE_MANAGED/g, '');
  const conflictingTables = [
    /^\s*\[features\]\s*$/m,
    /^\s*\[mcp_servers\.context7\]\s*$/m,
    /^\s*\[mcp_servers\.playwright\]\s*$/m,
  ];
  if (conflictingTables.some((pattern) => pattern.test(unmanaged))) {
    throw new Error(
      'Refusing to merge ~/.codex/config.toml because unmanaged [features], [mcp_servers.context7], or [mcp_servers.playwright] tables already exist. Move them into a THREADLINE_MANAGED block or merge manually.'
    );
  }
}

function hasCodexConflictingTables(config) {
  const unmanaged = config.replace(/# BEGIN THREADLINE_MANAGED[\s\S]*?# END THREADLINE_MANAGED/g, '');
  return [
    /^\s*\[features\]\s*$/m,
    /^\s*\[mcp_servers\.context7\]\s*$/m,
    /^\s*\[mcp_servers\.playwright\]\s*$/m,
  ].some((pattern) => pattern.test(unmanaged));
}

async function inspectPath(id, targetPath) {
  const target = targetPath;
  const exists = Boolean(await readTextIfExists(target));
  const content = exists ? (await readTextIfExists(target)) || '' : '';
  return {
    id,
    target,
    exists,
    threadlineManaged: /Threadline|THREADLINE_MANAGED|threadline/.test(content),
  };
}
