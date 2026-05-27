import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { readJsonIfExists, readTextIfExists, writeJsonIfChanged, writeTextIfChanged } from './fs.mjs';
import { getThreadlinePaths } from '../core/paths.mjs';

const execFileAsync = promisify(execFile);

// ── tool definitions ─────────────────────────────────────────────────────────

export const TOOL_REGISTRY = [
  {
    id: 'fd',
    name: 'fd',
    installName: 'fd',
    description: 'Fast, user-friendly find replacement (Rust)',
    replaces: 'find',
    example: 'fd --type f \"\\.ts$\" src/',
    category: 'search',
  },
  {
    id: 'ripgrep',
    name: 'ripgrep',
    installName: 'ripgrep',
    binary: 'rg',
    description: 'Line-oriented search tool, 10x faster than grep (Rust)',
    replaces: 'grep',
    example: 'rg --type ts "import React"',
    category: 'search',
  },
  {
    id: 'dasel',
    name: 'dasel',
    installName: 'dasel',
    description: 'Query/modify JSON, YAML, TOML, XML with one syntax (Go)',
    replaces: 'jq + yq + sed',
    example: 'dasel put -f config.toml -r toml -v "new" "key.sub"',
    category: 'config',
  },
  {
    id: 'sd',
    name: 'sd',
    installName: 'sd',
    description: 'Intuitive find & replace, modern sed replacement (Rust)',
    replaces: 'sed',
    example: 'sd "old" "new" file.txt',
    category: 'edit',
  },
  {
    id: 'bat',
    name: 'bat',
    installName: 'bat',
    description: 'Syntax-highlighting cat with git integration (Rust)',
    replaces: 'cat',
    example: 'bat --style=plain file.ts',
    category: 'view',
  },
  {
    id: 'ast-grep',
    name: 'ast-grep',
    installName: 'ast-grep',
    binary: 'sg',
    description: 'Structural code search using AST patterns (Rust)',
    replaces: 'grep (for code)',
    example: 'sg -p "console.log($$$)" -l ts',
    category: 'search',
  },
  {
    id: 'difftastic',
    name: 'difftastic',
    installName: 'difftastic',
    binary: 'difft',
    description: 'Structural diff that understands syntax (Rust)',
    replaces: 'diff',
    example: 'difft --display=side-by-side old.ts new.ts',
    category: 'diff',
  },
  {
    id: 'rtk',
    name: 'RTK',
    installName: 'rtk',
    description: 'CLI proxy that reduces LLM token usage by 60-90% (Rust)',
    replaces: 'raw shell output',
    example: 'rtk git status',
    category: 'agent',
  },
];

// ── detection ────────────────────────────────────────────────────────────────

export async function detectInstalledTools() {
  const results = await Promise.all(
    TOOL_REGISTRY.map(async (tool) => {
      const installed = await commandExists(tool.binary ?? tool.id);
      return { ...tool, installed };
    }),
  );
  return results;
}

async function commandExists(cmd) {
  const isWindows = os.platform() === 'win32';
  const shell = isWindows ? 'where' : 'which';
  try {
    await execFileAsync(shell, [cmd], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// ── preferences ──────────────────────────────────────────────────────────────

export async function readToolPreferences() {
  const paths = getThreadlinePaths();
  const prefsPath = path.join(paths.configDir, 'tool-preferences.json');
  const existing = await readJsonIfExists(prefsPath);
  return existing ?? defaultToolPreferences();
}

export async function writeToolPreferences(prefs) {
  const paths = getThreadlinePaths();
  const prefsPath = path.join(paths.configDir, 'tool-preferences.json');
  return writeJsonIfChanged(prefsPath, prefs);
}

function defaultToolPreferences() {
  return {
    version: 1,
    enabled: {},
    agentInstructions: true,
  };
}

// ── fd backend ───────────────────────────────────────────────────────────────

export async function listFilesWithFd(rootDir, { include = [], exclude = [], maxFileSize = 1024 * 1024 } = {}) {
  const args = [
    '--type', 'f',
    '--hidden',
    '--follow',
    '--exclude', '.git',
    '--absolute-path',
  ];

  // Add exclusions
  for (const pattern of exclude) {
    args.push('--exclude', pattern.replace(/\*\*/g, '*').replace(/\*/g, ''));
  }

  // Add size limit
  if (maxFileSize) {
    args.push('--size', `-${maxFileSize}b`);
  }

  // If we have include patterns, we need to post-filter since fd's include is per-pattern
  args.push('--color=never');

  const { stdout } = await execFileAsync('fd', args, {
    cwd: rootDir,
    timeout: 30000,
    maxBuffer: 50 * 1024 * 1024,
  });

  const lines = stdout.split('\n').filter(Boolean);

  // Post-filter for include patterns
  if (include.length) {
    return lines.filter((file) => matchesAnyPattern(path.relative(rootDir, file), include));
  }

  return lines;
}

// ── dasel backend ────────────────────────────────────────────────────────────

export async function readConfigWithDasel(filePath, selector, format) {
  const { stdout } = await execFileAsync('dasel', [
    '-f', filePath,
    '-r', format,
    selector,
  ], { timeout: 5000 });
  return stdout.trim();
}

export async function writeConfigWithDasel(filePath, selector, value, format) {
  await execFileAsync('dasel', [
    'put', '-f', filePath,
    '-r', format,
    '-v', String(value),
    selector,
  ], { timeout: 5000 });
  return { changed: true, target: filePath };
}

export async function deleteConfigWithDasel(filePath, selector, format) {
  await execFileAsync('dasel', [
    'delete', '-f', filePath,
    '-r', format,
    selector,
  ], { timeout: 5000 });
  return { changed: true, target: filePath };
}

// ── ripgrep backend ──────────────────────────────────────────────────────────

export async function searchWithRipgrep(pattern, rootDir, { type, maxResults = 100 } = {}) {
  const args = [
    '--color=never',
    '--no-heading',
    '--with-filename',
    '--line-number',
    '--max-count', String(Math.ceil(maxResults / 10)),
    '-m', String(maxResults),
    pattern,
  ];
  if (type) args.push('--type', type);

  const { stdout } = await execFileAsync('rg', args, {
    cwd: rootDir,
    timeout: 10000,
  });

  return stdout.split('\n').filter(Boolean).map((line) => {
    const [file, lineNum, ...rest] = line.split(':');
    return { file, line: parseInt(lineNum, 10), text: rest.join(':') };
  });
}

// ── ast-grep backend ─────────────────────────────────────────────────────────

export async function astSearch(pattern, rootDir, { lang, maxResults = 50 } = {}) {
  const args = [
    '-p', pattern,
    '--json',
    '-s',
  ];
  if (lang) args.push('-l', lang);

  const { stdout } = await execFileAsync('sg', args, {
    cwd: rootDir,
    timeout: 15000,
  });

  try {
    const results = [];
    for (const line of stdout.split('\n').filter(Boolean).slice(0, maxResults)) {
      const parsed = JSON.parse(line);
      if (parsed.text && parsed.range) {
        results.push({
          file: parsed.source,
          line: parsed.range.start?.line ?? 0,
          text: parsed.text,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function matchesAnyPattern(filePath, patterns) {
  return patterns.some((pattern) => matchesGlob(filePath, pattern));
}

function matchesGlob(relativePath, pattern) {
  const normalized = relativePath.split(path.sep).join('/');
  const escaped = pattern
    .split('/')
    .map((part) => {
      if (part === '**') return '.*';
      return part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    })
    .join('/');
  return new RegExp(`^${escaped}$`).test(normalized);
}

// ── agent instructions generator ─────────────────────────────────────────────

export function generateToolStackInstructions(preferences, installedTools) {
  const enabled = Object.entries(preferences.enabled)
    .filter(([, v]) => v)
    .map(([id]) => id);

  const tools = installedTools.filter((t) => enabled.includes(t.id));

  if (!tools.length) return '';

  const lines = [
    '# Preferred Tool Stack',
    '',
    'When working in this environment, prefer these modern CLI tools over legacy equivalents:',
    '',
    ...tools.map((t) => `- **${t.name}** (${t.id}): ${t.description}\n  - Use instead of: \`${t.replaces}\`\n  - Example: \`${t.example}\``),
    '',
    '## Rules',
    '',
    '1. Always prefer the modern tool when both are available.',
    '2. If a tool is not installed, fall back to the standard alternative.',
    '3. For config files (JSON/YAML/TOML), use \`dasel\` instead of sed/awk/jq when possible.',
    '4. For file discovery, use \`fd\` instead of \`find\`.',
    '5. For text search, use \`rg\` (ripgrep) instead of \`grep\`.',
    '6. For structural code search, use \`ast-grep\` (sg) instead of regex grep.',
    '',
  ];

  return lines.join('\n');
}
