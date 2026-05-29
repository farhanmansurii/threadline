import fs from 'node:fs/promises';
import path from 'node:path';
import { copyDir, ensureDir, expandHome, readTextIfExists, upsertManagedBlock, writeTextIfChanged } from '../../utils/fs.mjs';
import { readTemplate, repoRoot } from '../../core/templates.mjs';

export const id = 'codex';
export const name = 'Codex';
export const homeDir = '~/.codex';
// Codex loads skills from ~/.codex/skills/<name>/SKILL.md and invokes them by
// description match or explicit `$name` reference — NOT `/` slash commands
// (those are Codex's deprecated custom prompts under ~/.codex/prompts/).
// finalizeInstall writes a reference table of installed skills to AGENTS.md.
export const supports = { skills: true, commands: false, config: true };

export async function installSkills(sourceDir, { replace = false } = {}) {
  const targetDir = path.join(homeDir, 'skills', path.basename(sourceDir));
  await ensureDir(path.dirname(targetDir));
  return copyDir(sourceDir, targetDir);
}

/**
 * Install Threadline commands as Codex skills — one SKILL.md per command under
 * ~/.codex/skills/<command>/. Codex invokes them by description match or via an
 * explicit `$command` reference.
 *
 * Claude command templates have no YAML frontmatter, which Codex skills require
 * (name + description drive discovery), so we synthesize it when missing.
 *
 * Template resolution order:
 *   1. templates/codex/command-<command>.md  (Codex-specific, preferred)
 *   2. templates/claude/command-<command>.md (Claude template as fallback)
 *   3. Auto-generated minimal skill stub
 */
export async function installCommands(commands) {
  const results = [];
  for (const command of commands) {
    const content = ensureSkillFrontmatter(await resolveCommandTemplate(command), command);
    const targetDir = path.join(homeDir, 'skills', command);
    await ensureDir(targetDir);
    results.push(await writeTextIfChanged(path.join(targetDir, 'SKILL.md'), content));
  }
  return results;
}

/** Codex skills require YAML frontmatter with name/description; add it if absent. */
function ensureSkillFrontmatter(content, command) {
  if (content.trimStart().startsWith('---')) return content;
  const firstHeading = content.match(/^#\s*(.+)$/m)?.[1]?.trim();
  const description = firstHeading ? `${firstHeading} — Threadline skill` : `${command} — Threadline skill`;
  return `---\nname: ${command}\ndescription: ${description}\n---\n\n${content}`;
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
 * Called once after all packs are installed. Writes a reference table of the
 * installed Threadline skills to ~/.codex/AGENTS.md. Codex invokes a skill when
 * a request matches its description, or explicitly when the user types `$name`.
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

  const maxInvoke = Math.max('Invoke'.length, ...rows.map((r) => r.command.length + 1)); // +1 for leading $
  const maxName = Math.max('Skill'.length, ...rows.map((r) => r.name.length));
  const header = `| ${'Invoke'.padEnd(maxInvoke)} | ${'Skill'.padEnd(maxName)} | Triggers |`;
  const sep = `| ${'-'.repeat(maxInvoke)} | ${'-'.repeat(maxName)} | -------- |`;
  const tableRows = rows.map(
    (r) =>
      `| \`$${r.command}\`${' '.repeat(maxInvoke - r.command.length - 1)} | ${r.name.padEnd(maxName)} | ${r.triggers || '—'} |`,
  );

  const block = [
    '## Threadline Skills',
    '',
    'These skills are installed under `~/.codex/skills/`. Codex loads one automatically when your request matches its description; to invoke explicitly, reference it with `$name`. (These are Agent Skills, not `/` slash commands.)',
    '',
    header,
    sep,
    ...tableRows,
    '',
    '> Skills are defined by Threadline. Re-run `threadline install` to refresh this list.',
  ].join('\n');

  return upsertManagedBlock(path.join(homeDir, 'AGENTS.md'), 'THREADLINE_SLASH_COMMANDS', block);
}

export async function installConfig({ replace = false } = {}) {
  const configPath = path.join(homeDir, 'config.toml');
  const managed = await readTemplate('templates/codex/config.managed.toml');

  // Write the agent config layers first, then register each as a named Codex
  // agent (`[agents.<key>]`) inside the managed block — without registration the
  // ~/.codex/agents/*.toml files are inert and never surface.
  const { results: agentResults, agents } = await installAgents();
  const agentsBlock = renderAgentsRegistration(agents);

  const configResults = [];
  if (replace) {
    const full = agentsBlock
      ? managed.replace('# END THREADLINE_MANAGED', `${agentsBlock}\n# END THREADLINE_MANAGED`)
      : managed;
    configResults.push(await writeTextIfChanged(configPath, full.trimEnd() + '\n'));
  } else {
    const body = managed
      .replace('# BEGIN THREADLINE_MANAGED\n', '')
      .replace('\n# END THREADLINE_MANAGED', '');
    const bodyWithAgents = agentsBlock ? `${body.trimEnd()}\n\n${agentsBlock}` : body;
    configResults.push(await upsertManagedBlock(configPath, 'THREADLINE_MANAGED', bodyWithAgents));
  }
  return [...configResults, ...agentResults];
}

/** Render `[agents.<key>]` registration tables pointing at the agent config layers. */
function renderAgentsRegistration(agents) {
  if (!agents.length) return '';
  return agents
    .map(
      (agent) =>
        `[agents.${agent.key}]\nconfig_file = "agents/${agent.file}"\ndescription = "${tomlEscape(agent.description)}"`,
    )
    .join('\n\n');
}

function tomlEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Install Codex agent config layers from templates/codex/agents/ to
 * ~/.codex/agents/. These define named agent roles (Explorer, Reviewer, Docs
 * Researcher). installConfig registers them via `[agents.<key>]` so Codex
 * surfaces them. Files are written idempotently.
 *
 * Returns { results, agents } where agents carry the metadata needed to register
 * each layer ({ key, file, description }).
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
    return { results: [], agents: [] };
  }

  const results = [];
  const agents = [];
  for (const entry of entries) {
    if (!entry.endsWith('.toml')) continue;
    const content = await readTemplate(`templates/codex/agents/${entry}`);
    results.push(await writeTextIfChanged(path.join(targetDir, entry), content));
    const description = content.match(/^description\s*=\s*"([^"]*)"/m)?.[1] ?? '';
    agents.push({ key: entry.replace(/\.toml$/, ''), file: entry, description });
  }
  return { results, agents };
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
