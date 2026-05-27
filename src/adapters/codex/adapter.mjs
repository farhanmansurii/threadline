import path from 'node:path';
import { copyDir, ensureDir, expandHome, readTextIfExists, upsertManagedBlock, writeTextIfChanged } from '../../utils/fs.mjs';
import { readTemplate } from '../../core/templates.mjs';

export const id = 'codex';
export const name = 'Codex';
export const homeDir = '~/.codex';
export const supports = { skills: true, commands: false, config: true };

export async function installSkills(sourceDir, { replace = false } = {}) {
  const targetDir = path.join(homeDir, 'skills', path.basename(sourceDir));
  await ensureDir(path.dirname(targetDir));
  return copyDir(sourceDir, targetDir);
}

export async function installCommands() {
  return [];
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
