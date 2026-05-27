import fs from 'node:fs/promises';
import os from 'node:os';
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

export function expandHome(filePath) {
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

export async function ensureDir(dirPath) {
  await fs.mkdir(expandHome(dirPath), { recursive: true });
}

export async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(expandHome(filePath), 'utf8');
  } catch {
    return null;
  }
}

export async function writeTextIfChanged(filePath, content) {
  const target = expandHome(filePath);
  await ensureDir(path.dirname(target));
  await assertNotSymlink(target);
  const existing = await readTextIfExists(target);
  if (existing === content) return { changed: false, target };
  await backupIfExists(target, existing);
  await atomicWrite(target, content);
  return { changed: true, target };
}

export async function writeTextIfMissing(filePath, content) {
  const target = expandHome(filePath);
  await ensureDir(path.dirname(target));
  await assertNotSymlink(target);
  const existing = await readTextIfExists(target);
  if (existing != null) return { changed: false, target };
  await atomicWrite(target, content);
  return { changed: true, target };
}

export async function writeJsonIfChanged(filePath, value) {
  return writeTextIfChanged(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function copyDir(sourceDir, targetDir) {
  const source = expandHome(sourceDir);
  const target = expandHome(targetDir);
  await ensureDir(target);
  const entries = await fs.readdir(source, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await copyDir(sourcePath, targetPath)));
      continue;
    }
    const content = await fs.readFile(sourcePath, 'utf8');
    results.push(await writeTextIfChanged(targetPath, content));
  }
  return results;
}

export async function upsertManagedBlock(filePath, blockName, blockContent) {
  const target = expandHome(filePath);
  const start = `# BEGIN ${blockName}`;
  const end = `# END ${blockName}`;
  const nextBlock = `${start}\n${blockContent.trim()}\n${end}`;
  const existing = (await readTextIfExists(target)) || '';
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  const next = pattern.test(existing)
    ? existing.replace(pattern, nextBlock)
    : `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${nextBlock}\n`;
  return writeTextIfChanged(target, next);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function atomicWrite(target, content) {
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(temp, content);
  await fs.rename(temp, target);
}

async function backupIfExists(target, existing) {
  if (existing == null) return;
  const backupDir = path.join(path.dirname(target), '.threadline-backups');
  await ensureDir(backupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${path.basename(target)}.${stamp}.bak`);
  await fs.writeFile(backupPath, existing);
}

async function assertNotSymlink(target) {
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to write through symlink: ${target}`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
