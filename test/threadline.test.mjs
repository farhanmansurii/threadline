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
