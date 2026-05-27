import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function readSkillRegistry() {
  const registryPath = path.join(ROOT, 'registry', 'skills.json');
  return JSON.parse(await fs.readFile(registryPath, 'utf8'));
}

export function recommendSkillsForProfile(registry, profile) {
  const evidence = new Set([...profile.stacks, ...profile.evidence]);
  return registry.packs.filter((pack) => {
    if (pack.bucket === 'core') return true;
    return pack.triggers.some((trigger) => evidence.has(trigger));
  });
}
