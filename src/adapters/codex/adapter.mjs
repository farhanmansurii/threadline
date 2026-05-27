import fs from 'node:fs/promises';
import path from 'node:path';
import { copyDir, ensureDir, expandHome, readTextIfExists, upsertManagedBlock, writeTextIfChanged } from '../../utils/fs.mjs';
import { readTemplate, repoRoot } from '../../core/templates.mjs';

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

/**
 * Install Codex slash commands as individual skill files.
 *
 * Codex's slash command picker reads `name:` from each SKILL.md frontmatter
 * in ~/.codex/skills/. Each command in a pack gets its own skill directory so
 * `/handoff`, `/resume`, etc. appear as native slash commands in the TUI.
 *
 * Template resolution order:
 *   1. templates/codex/command-<command>.md  (Codex-specific, preferred)
 *   2. templates/claude/command-<command>.md (Claude template as fallback)
 *   3. Auto-generated minimal skill stub
 */
export async function installCommands(commands) {
  const results = [];
  for (const command of commands) {
    const content = await resolveCommandTemplate(command);
    const targetDir = path.join(homeDir, 'skills', command);
    await ensureDir(targetDir);
    results.push(await writeTextIfChanged(path.join(targetDir, 'SKILL.md'), content));
  }
  return results;
}

async function resolveCommandTemplate(command) {
  // Try Codex-specific template first, then Claude template, then generate a stub.
  const candidates = [
    `templates/codex/command-${command}.md`,
    `templates/claude/command-${command}.md`,
  ];
  for (const tpl of candidates) {
    const content = await readTemplate(tpl).catch(() => null);
    if (content) return content;
  }
  return `---\nname: ${command}\ndescription: ${command} — Threadline skill\n---\n\n# ${command}\n\nRun the ${command} Threadline workflow.\n`;
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
  const configResults = [];
  if (replace) {
    configResults.push(await writeTextIfChanged(configPath, managed.trimEnd() + '\n'));
  } else {
    const body = managed
      .replace('# BEGIN THREADLINE_MANAGED\n', '')
      .replace('\n# END THREADLINE_MANAGED', '');
    configResults.push(await upsertManagedBlock(configPath, 'THREADLINE_MANAGED', body));
  }
  const agentResults = await installAgents();
  return [...configResults, ...agentResults];
}

/**
 * Install Codex agent TOML files from templates/codex/agents/ to ~/.codex/agents/.
 *
 * These define named agent roles (Explorer, Reviewer, Docs Researcher) that Codex
 * surfaces in its agent picker. Each file is written idempotently — only changed
 * files trigger a write action.
 */
async function installAgents() {
  const ROOT = repoRoot();
  const agentsTemplateDir = path.join(ROOT, 'templates', 'codex', 'agents');
  const targetDir = path.join(homeDir, 'agents');
  await ensureDir(targetDir);

  let entries;
  try {
    entries = await fs.readdir(agentsTemplateDir);
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    if (!entry.endsWith('.toml')) continue;
    const content = await readTemplate(`templates/codex/agents/${entry}`);
    results.push(await writeTextIfChanged(path.join(targetDir, entry), content));
  }
  return results;
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
