import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const BIN = path.join(ROOT, 'bin', 'threadline');
const EXAMPLE = path.join(ROOT, 'examples', 'fullstack-js');

test('detect identifies the fullstack example', async () => {
  const { stdout } = await run(['detect', '--path', EXAMPLE, '--json']);
  const profile = JSON.parse(stdout);

  assert.equal(profile.name, 'threadline-example-fullstack-js');
  assert.ok(profile.stacks.includes('react'));
  assert.ok(profile.stacks.includes('vite'));
  assert.ok(profile.stacks.includes('firebase'));
  assert.ok(profile.stacks.includes('playwright'));
  assert.equal(profile.id.length, 12);
  assert.equal(profile.workspaceId.length, 12);
});

test('init --local writes external project profile and is idempotent', async () => {
  const env = await isolatedEnv();

  const first = await run(['init', '--path', EXAMPLE], { env });
  assert.match(first.stdout, /CHANGED .*project-profile\.json/);

  const second = await run(['init', '--path', EXAMPLE], { env });
  assert.match(second.stdout, /OK\s+.*project-profile\.json/);

  const profileFiles = await listFiles(env.XDG_DATA_HOME);
  assert.ok(profileFiles.some((file) => file.endsWith('project-profile.json')));
  assert.ok(profileFiles.every((file) => !file.startsWith(EXAMPLE)));
});

test('setup --merge writes Claude and Codex basics and is idempotent', async () => {
  const env = await isolatedEnv();

  const first = await run(['setup', '--runtimes', 'claude,codex'], { env });
  assert.match(first.stdout, /CHANGED .*\.claude.*SKILL\.md/);
  assert.match(first.stdout, /CHANGED .*\.codex.*config\.toml/);
  assert.ok(await exists(path.join(env.HOME, '.claude', 'skills', 'threadline', 'SKILL.md')));
  assert.ok(await exists(path.join(env.HOME, '.claude', 'commands', 'context.md')));
  assert.ok(await exists(path.join(env.HOME, '.claude', 'commands', 'learnings.md')));

  const second = await run(['setup', '--runtimes', 'claude,codex'], { env });
  assert.match(second.stdout, /OK\s+.*\.claude.*SKILL\.md/);
  assert.match(second.stdout, /OK\s+.*\.codex.*config\.toml/);
});

test('relative XDG paths are rejected', async () => {
  await assert.rejects(
    run(['paths'], {
      env: {
        ...process.env,
        XDG_DATA_HOME: '.',
      },
    }),
    /XDG_DATA_HOME must be absolute/
  );
});

test('setup refuses unmanaged conflicting Codex tables before writing', async () => {
  const env = await isolatedEnv();
  await fs.mkdir(path.join(env.HOME, '.codex'), { recursive: true });
  await fs.writeFile(path.join(env.HOME, '.codex', 'config.toml'), '[features]\nmulti_agent = true\n');

  await assert.rejects(run(['setup', '--runtimes', 'codex'], { env }), /Refusing to merge/);

  const files = await listFiles(env.XDG_CONFIG_HOME).catch(() => []);
  assert.deepEqual(files, []);
});

test('setup --adopt writes an adoption report', async () => {
  const env = await isolatedEnv();

  const result = await run(['setup', '--adopt', '--runtimes', 'claude,codex'], { env });
  assert.match(result.stdout, /adoption-report\.json/);

  const report = JSON.parse(await fs.readFile(path.join(env.XDG_DATA_HOME, 'threadline', 'adoption-report.json'), 'utf8'));
  assert.equal(report.version, 1);
  assert.ok(report.findings.some((finding) => finding.id === 'codex-config'));
});

test('setup --replace requires --yes', async () => {
  const env = await isolatedEnv();

  await assert.rejects(run(['setup', '--replace', '--runtimes', 'codex'], { env }), /requires --yes/);
});

test('setup --replace --yes replaces Codex config and installs all visible skills', async () => {
  const env = await isolatedEnv();
  await fs.mkdir(path.join(env.HOME, '.codex'), { recursive: true });
  await fs.writeFile(path.join(env.HOME, '.codex', 'config.toml'), '[features]\nold = true\n');

  await run(['setup', '--replace', '--yes', '--runtimes', 'claude,codex'], { env });

  const config = await fs.readFile(path.join(env.HOME, '.codex', 'config.toml'), 'utf8');
  assert.match(config, /BEGIN THREADLINE_MANAGED/);
  assert.doesNotMatch(config, /old = true/);
  assert.ok(await exists(path.join(env.HOME, '.codex', 'skills', 'threadline', 'SKILL.md')));
  assert.ok(await exists(path.join(env.HOME, '.codex', 'skills', 'react-vite', 'SKILL.md')));
  assert.ok(await exists(path.join(env.HOME, '.claude', 'skills', 'react-vite', 'SKILL.md')));
  assert.ok(await exists(path.join(env.HOME, '.claude', 'skills', 'diagnose', 'SKILL.md')));
  assert.ok(await exists(path.join(env.HOME, '.claude', 'commands', 'context.md')));
  assert.ok(await exists(path.join(env.HOME, '.claude', 'commands', 'learnings.md')));
  assert.ok(await exists(path.join(env.HOME, '.claude', 'commands', 'ui-check.md')));
});

test('index writes a RAG manifest', async () => {
  const env = await isolatedEnv();

  const result = await run(['index', '--path', EXAMPLE], { env });
  assert.match(result.stdout, /manifest\.json/);

  const files = await listFiles(env.XDG_DATA_HOME);
  const manifestPath = files.find((file) => file.endsWith('rag/manifest.json'));
  assert.ok(manifestPath);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.ok(manifest.fileCount > 0);
  assert.ok(manifest.files.some((file) => file.path === 'package.json'));
  assert.ok(manifest.files.every((file) => typeof file.sha256 === 'string'));
  assert.ok(manifest.files.every((file) => typeof file.mtimeMs === 'number'));
});

test('index excludes nested secrets and symlinks', async () => {
  const env = await isolatedEnv();
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'threadline-repo-'));
  await fs.writeFile(path.join(repo, 'package.json'), '{"name":"secret-test"}\n');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'index.js'), 'console.log("ok")\n');
  await fs.writeFile(path.join(repo, 'src', '.env.local'), 'TOKEN=secret\n');
  await fs.symlink('/tmp', path.join(repo, 'src', 'tmp-link'));

  await run(['index', '--path', repo], { env });

  const manifestPath = (await listFiles(env.XDG_DATA_HOME)).find((file) => file.endsWith('rag/manifest.json'));
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.ok(manifest.files.some((file) => file.path === 'src/index.js'));
  assert.ok(!manifest.files.some((file) => file.path.includes('.env')));
  assert.ok(!manifest.files.some((file) => file.path.includes('tmp-link')));
});

test('handoff create writes markdown and index', async () => {
  const env = await isolatedEnv();
  const vault = path.join(env.HOME, 'vault');

  const result = await run(
    ['handoff', 'create', '--path', EXAMPLE, '--title', 'RMS Dashboard', '--summary', 'Continue dashboard work.', '--vault', vault],
    { env }
  );
  assert.match(result.stdout, /Resume ID:/);

  const vaultFiles = await listFiles(vault);
  assert.ok(vaultFiles.some((file) => file.endsWith('.md')));

  const dataFiles = await listFiles(env.XDG_DATA_HOME);
  assert.ok(dataFiles.some((file) => file.endsWith('handoffs/index.json')));
  assert.ok(vaultFiles.some((file) => file.endsWith('.json')));
});

async function run(args, options = {}) {
  return execFileAsync('node', [BIN, ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

async function isolatedEnv() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'threadline-test-'));
  return {
    ...process.env,
    HOME: path.join(root, 'home'),
    XDG_CONFIG_HOME: path.join(root, 'config'),
    XDG_DATA_HOME: path.join(root, 'data'),
    XDG_CACHE_HOME: path.join(root, 'cache'),
  };
}

async function listFiles(dir) {
  const out = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(dir);
  return out;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
