import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function repoRoot() {
  return ROOT;
}

export async function readTemplate(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

export function renderTemplate(template, values) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    const value = values[key];
    if (Array.isArray(value)) return value.join(', ');
    return value == null ? '' : String(value);
  });
}
