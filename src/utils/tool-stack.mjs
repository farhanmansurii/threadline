import path from 'node:path';
import { getAdapter } from '../adapters/index.mjs';
import { readToolPreferences, generateToolStackInstructions, detectInstalledTools } from './external-tools.mjs';
import { readTextIfExists, writeTextIfChanged } from './fs.mjs';

/**
 * Append tool stack instructions to each runtime's threadline-core SKILL.md.
 * This teaches Claude/Codex/Cursor/etc to prefer modern CLI tools.
 */
export async function installToolStackForRuntimes(runtimes) {
  const prefs = await readToolPreferences().catch(() => null);
  if (!prefs || !Object.values(prefs.enabled).some(Boolean)) return [];

  const detected = await detectInstalledTools();
  const instructions = generateToolStackInstructions(prefs, detected);
  if (!instructions) return [];

  const results = [];
  for (const runtime of runtimes) {
    const adapter = getAdapter(runtime);
    const skillPath = path.join(adapter.homeDir, 'skills', 'threadline', 'SKILL.md');
    const existing = (await readTextIfExists(skillPath)) || '';

    // Remove old tool stack section if present
    const marker = '\n\n## Preferred Tool Stack';
    const clean = existing.includes(marker)
      ? existing.slice(0, existing.indexOf(marker))
      : existing;

    const next = `${clean.trimEnd()}\n\n${instructions}`;
    results.push(await writeTextIfChanged(skillPath, next));
  }

  return results;
}
