import path from 'node:path';
import { copyDir, ensureDir, readTextIfExists, upsertManagedBlock, writeTextIfChanged } from '../../utils/fs.mjs';
import { readTemplate } from '../../core/templates.mjs';

export const id = 'claude';
export const name = 'Claude Code';
export const homeDir = '~/.claude';
export const supports = { skills: true, commands: true, config: false };

export async function installSkills(sourceDir, { replace = false } = {}) {
  const targetDir = path.join(homeDir, 'skills', path.basename(sourceDir));
  await ensureDir(path.dirname(targetDir));
  return copyDir(sourceDir, targetDir);
}

export async function installCommands(commands, { replace = false } = {}) {
  if (!commands?.length) return [];
  const results = [];
  for (const command of commands) {
    const content = await readTemplate(`templates/claude/command-${command}.md`).catch(() => null);
    if (!content) continue;
    results.push(await writeTextIfChanged(path.join(homeDir, 'commands', `${command}.md`), content));
  }
  return results;
}

export async function installConfig({ replace = false } = {}) {
  // Claude config is settings.json; we currently don't manage it automatically.
  return [];
}

export async function adopt() {
  const findings = [];
  findings.push(await inspectPath('claude-skill', path.join(homeDir, 'skills', 'threadline', 'SKILL.md')));
  findings.push(await inspectPath('claude-handoff-command', path.join(homeDir, 'commands', 'handoff.md')));
  findings.push(await inspectPath('claude-resume-command', path.join(homeDir, 'commands', 'resume.md')));
  findings.push(await inspectPath('claude-context-command', path.join(homeDir, 'commands', 'context.md')));
  findings.push(await inspectPath('claude-learnings-command', path.join(homeDir, 'commands', 'learnings.md')));
  return findings;
}

export async function preflight() {
  return;
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
