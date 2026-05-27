import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileExists, expandHome } from './fs.mjs';
import { listAdapters } from '../adapters/index.mjs';

const execFileAsync = promisify(execFile);

export async function detectInstalledRuntimes() {
  const adapters = listAdapters();
  const results = [];

  for (const adapter of adapters) {
    const status = await detectRuntime(adapter);
    results.push({ ...adapter, ...status });
  }

  return results;
}

async function detectRuntime(adapter) {
  const home = expandHome(adapter.homeDir);
  const hasHomeDir = await fileExists(home);
  const hasSkills = await fileExists(path.join(home, 'skills'));
  const hasConfig = await fileExists(path.join(home, 'config.toml'));
  const inPath = await commandInPath(adapter.id);

  const signals = [
    hasHomeDir && 'config dir',
    hasSkills && 'skills',
    hasConfig && 'config',
    inPath && 'CLI in PATH',
  ].filter(Boolean);

  const installed = signals.length > 0;

  return {
    installed,
    hasHomeDir,
    hasSkills,
    hasConfig,
    inPath,
    signals,
  };
}

async function commandInPath(command) {
  const isWindows = os.platform() === 'win32';
  const shell = isWindows ? 'where' : 'which';
  try {
    await execFileAsync(shell, [command], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
