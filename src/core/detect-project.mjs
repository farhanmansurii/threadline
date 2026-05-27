import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileExists, findUp, readJsonIfExists } from '../utils/fs.mjs';

export async function detectProject(inputPath) {
  const root = await findProjectRoot(path.resolve(inputPath));
  const packageJson = await readJsonIfExists(path.join(root, 'package.json'));
  const files = await detectFiles(root);
  const stacks = detectStacks({ packageJson, files });
  const recommendedPresets = recommendPresets(stacks);
  const name = packageJson?.name || path.basename(root);
  const remote = await readGitRemote(root);
  const idSource = remote || root;

  return {
    id: stableId(idSource),
    workspaceId: stableId(root),
    name,
    root,
    remote,
    packageManager: await detectPackageManager(root),
    stacks,
    recommendedPresets,
    evidence: files,
  };
}

async function findProjectRoot(start) {
  const packageRoot = await findUp(start, 'package.json');
  const gitRoot = await findUp(start, '.git');
  return packageRoot || gitRoot || start;
}

async function detectFiles(root) {
  const candidates = [
    'package.json',
    'tsconfig.json',
    'vite.config.js',
    'vite.config.ts',
    'next.config.js',
    'next.config.mjs',
    'playwright.config.js',
    'playwright.config.ts',
    'cypress.json',
    'firebase.json',
    'pyproject.toml',
    'go.mod',
    'Cargo.toml',
    'docker-compose.yml',
  ];

  const found = [];
  for (const candidate of candidates) {
    if (await fileExists(path.join(root, candidate))) found.push(candidate);
  }
  return found;
}

function detectStacks({ packageJson, files }) {
  const deps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  };
  const stacks = new Set();

  if (packageJson) stacks.add('node');
  if (files.includes('tsconfig.json') || deps.typescript) stacks.add('typescript');
  if (deps.react || deps['react-dom']) stacks.add('react');
  if (files.some((file) => file.startsWith('vite.config'))) stacks.add('vite');
  if (files.some((file) => file.startsWith('next.config')) || deps.next) stacks.add('nextjs');
  if (deps.firebase || deps['firebase-admin'] || files.includes('firebase.json')) stacks.add('firebase');
  if (deps.sanity || deps['@sanity/client'] || deps['@sanity/vision']) stacks.add('sanity');
  if (files.some((file) => file.startsWith('playwright.config')) || deps['@playwright/test']) stacks.add('playwright');
  if (files.includes('cypress.json') || deps.cypress) stacks.add('cypress');
  if (files.includes('pyproject.toml')) stacks.add('python');
  if (files.includes('go.mod')) stacks.add('go');
  if (files.includes('Cargo.toml')) stacks.add('rust');

  return [...stacks].sort();
}

function recommendPresets(stacks) {
  const set = new Set(['minimal']);
  if (stacks.includes('node')) set.add('fullstack-js');
  if (stacks.includes('react') && stacks.includes('vite')) set.add('react-vite');
  if (stacks.includes('nextjs')) set.add('nextjs');
  if (stacks.includes('firebase')) set.add('node-firebase');
  if (stacks.includes('playwright')) set.add('playwright-ui');
  if (stacks.includes('python')) set.add('python');
  return [...set];
}

async function detectPackageManager(root) {
  if (await fileExists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(path.join(root, 'yarn.lock'))) return 'yarn';
  if (await fileExists(path.join(root, 'bun.lockb'))) return 'bun';
  if (await fileExists(path.join(root, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

async function readGitRemote(root) {
  try {
    const config = await fs.readFile(path.join(root, '.git', 'config'), 'utf8');
    const match = config.match(/\[remote "origin"\][\s\S]*?url = (.+)/);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function stableId(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}
