import fs from 'node:fs/promises';
import path from 'node:path';

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export async function findUp(start, target) {
  let current = start;
  while (true) {
    if (await fileExists(path.join(current, target))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
