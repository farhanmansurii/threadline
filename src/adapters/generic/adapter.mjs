import path from 'node:path';
import { copyDir, ensureDir, readTextIfExists, upsertManagedBlock, writeTextIfChanged } from '../../utils/fs.mjs';
import { readTemplate } from '../../core/templates.mjs';

export function createGenericAdapter(runtimeId) {
  const homeDir = `~/.${runtimeId}`;
  const skillsDir = path.join(homeDir, 'skills');
  const commandsDir = path.join(homeDir, 'commands');

  return {
    id: runtimeId,
    name: runtimeId.charAt(0).toUpperCase() + runtimeId.slice(1),
    homeDir,
    supports: { skills: true, commands: true, config: true },

    async installSkills(sourceDir, { replace = false } = {}) {
      await ensureDir(skillsDir);
      const targetDir = path.join(skillsDir, path.basename(sourceDir));
      return copyDir(sourceDir, targetDir);
    },

    async installCommands(commands, { replace = false } = {}) {
      if (!commands?.length) return [];
      const results = [];
      for (const command of commands) {
        const content = await readGenericCommandTemplate(command).catch(() => null);
        if (!content) continue;
        results.push(await writeTextIfChanged(path.join(commandsDir, `${command}.md`), content));
      }
      return results;
    },

    async installConfig({ replace = false } = {}) {
      const configPath = path.join(homeDir, 'config.toml');
      const managed = `# Threadline-managed config for ${runtimeId}\n# This runtime is handled by the generic adapter.\n# You may extend this file manually; Threadline only owns the block below.\n`;
      if (replace) {
        return [await writeTextIfChanged(configPath, managed.trimEnd() + '\n')];
      }
      return [await upsertManagedBlock(configPath, 'THREADLINE_MANAGED', managed)];
    },

    async adopt() {
      const findings = [];
      findings.push(await inspectGenericPath(`${runtimeId}-skill`, path.join(skillsDir, 'threadline', 'SKILL.md')));
      findings.push(await inspectGenericPath(`${runtimeId}-config`, path.join(homeDir, 'config.toml')));
      return findings;
    },

    async preflight() {
      // Generic adapter has no conflicting-table logic by default.
      return;
    },
  };
}

async function readGenericCommandTemplate(command) {
  // Try runtime-specific template first, then fallback to claude template.
  try {
    return await readTemplate(`templates/generic/command-${command}.md`);
  } catch {
    return readTemplate(`templates/claude/command-${command}.md`);
  }
}

async function inspectGenericPath(id, targetPath) {
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
