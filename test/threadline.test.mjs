import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { captureGitState } from '../src/utils/git.mjs';
import { mapRuntimesToAgents, buildSkillsAddArgs } from '../src/core/skills-add.mjs';

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

test('captureGitState reports branch, commits, and uncommitted files', async () => {
  const repo = await makeGitRepo();
  await fs.writeFile(path.join(repo, 'a.txt'), 'hello\n');
  await git(repo, ['add', 'a.txt']);
  await git(repo, ['commit', '-qm', 'first commit']);
  await fs.writeFile(path.join(repo, 'a.txt'), 'changed\n'); // unstaged
  await fs.writeFile(path.join(repo, 'b.txt'), 'new\n'); // untracked

  const state = await captureGitState(repo);
  assert.equal(state.isRepo, true);
  assert.equal(state.branch, 'main');
  assert.ok(state.head);
  assert.equal(state.dirty, true);
  assert.ok(state.unstaged.includes('a.txt'));
  assert.ok(state.untracked.includes('b.txt'));
  assert.ok(state.recentCommits.some((c) => c.subject === 'first commit'));
});

test('captureGitState fails soft on a non-git directory', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'threadline-nogit-'));
  const state = await captureGitState(dir);
  assert.equal(state.isRepo, false);
  assert.deepEqual(state.untracked, []);
  assert.equal(state.dirty, false);
});

test('handoff create captures real git state in the markdown', async () => {
  const env = await isolatedEnv();
  const vault = path.join(env.HOME, 'vault');
  const repo = await makeGitRepo();
  await fs.writeFile(path.join(repo, 'package.json'), '{"name":"git-handoff-test"}\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-qm', 'init']);
  await fs.writeFile(path.join(repo, 'feature.js'), 'export const x = 1\n'); // untracked

  await run(['handoff', 'create', '--path', repo, '--title', 'Git Capture', '--vault', vault], { env });

  const mdPath = (await listFiles(vault)).find((file) => file.endsWith('.md'));
  const content = await fs.readFile(mdPath, 'utf8');
  assert.match(content, /## Git State/);
  assert.match(content, /Branch: `main`/);
  assert.match(content, /feature\.js.*untracked/);
});

test('handoff resume emits an agent brief with git context', async () => {
  const env = await isolatedEnv();
  const vault = path.join(env.HOME, 'vault');
  const repo = await makeGitRepo();
  await fs.writeFile(path.join(repo, 'package.json'), '{"name":"resume-test"}\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-qm', 'init']);

  const create = await run(
    ['handoff', 'create', '--path', repo, '--title', 'Resume Me', '--summary', 'Half-done auth.', '--vault', vault],
    { env },
  );
  const id = create.stdout.match(/Resume ID:\s*(\S+)/)[1];

  const resume = await run(['handoff', 'resume', id], { env });
  assert.match(resume.stdout, /# Resume: Resume Me/);
  assert.match(resume.stdout, /Half-done auth\./);
  assert.match(resume.stdout, /Branch `main`/);

  const listed = await run(['handoff', 'list', '--json'], { env });
  const entries = JSON.parse(listed.stdout);
  assert.ok(entries.some((entry) => entry.id === id));
});

test('handoff create --auto skips when working tree is clean and in sync', async () => {
  const env = await isolatedEnv();
  const vault = path.join(env.HOME, 'vault');
  const repo = await makeGitRepo();
  await fs.writeFile(path.join(repo, 'package.json'), '{"name":"auto-skip"}\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-qm', 'init']);

  const result = await run(['handoff', 'create', '--path', repo, '--auto', '--vault', vault], { env });
  assert.match(result.stdout, /Nothing to hand off/);

  const vaultFiles = await listFiles(vault).catch(() => []);
  assert.equal(vaultFiles.length, 0);
});

test('handoff create --auto derives title and summary from git when dirty', async () => {
  const env = await isolatedEnv();
  const vault = path.join(env.HOME, 'vault');
  const repo = await makeGitRepo();
  await fs.writeFile(path.join(repo, 'package.json'), '{"name":"auto-write"}\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-qm', 'init']);
  await git(repo, ['checkout', '-q', '-b', 'feat/payments']);
  await fs.writeFile(path.join(repo, 'pay.js'), 'export const pay = 1\n'); // untracked

  const result = await run(['handoff', 'create', '--path', repo, '--auto', '--vault', vault], { env });
  assert.match(result.stdout, /Handoff created:/);

  const mdPath = (await listFiles(vault)).find((file) => file.endsWith('.md'));
  const content = await fs.readFile(mdPath, 'utf8');
  assert.match(content, /feature: feat\/payments/);
  assert.match(content, /Auto-handoff on `feat\/payments`/);
});

test('handoff resume --latest with --format claude wraps the brief', async () => {
  const env = await isolatedEnv();
  const vault = path.join(env.HOME, 'vault');
  const repo = await makeGitRepo();
  await fs.writeFile(path.join(repo, 'package.json'), '{"name":"latest-test"}\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-qm', 'init']);

  await run(['handoff', 'create', '--path', repo, '--title', 'First', '--vault', vault], { env });
  await run(['handoff', 'create', '--path', repo, '--title', 'Second', '--vault', vault], { env });

  const resume = await run(['handoff', 'resume', '--latest', '--path', repo, '--format', 'claude'], { env });
  assert.match(resume.stdout, /You are resuming work/);
  assert.match(resume.stdout, /# Resume: Second/);
});

test('watch installs auto-handoff hooks idempotently and preserves unrelated settings', async () => {
  const env = await isolatedEnv();
  const settingsPath = path.join(env.HOME, '.claude', 'settings.json');
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(
    settingsPath,
    JSON.stringify({ model: 'opus', hooks: { SessionEnd: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } }, null, 2),
  );

  await run(['watch'], { env });
  let settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  assert.equal(settings.model, 'opus'); // unrelated key preserved
  assert.ok(hasCommand(settings.hooks.SessionEnd, 'echo hi')); // unrelated hook preserved
  assert.ok(hasCommand(settings.hooks.SessionEnd, 'threadline handoff create --auto'));
  assert.ok(hasCommand(settings.hooks.PreCompact, 'threadline handoff create --auto'));

  const second = await run(['watch'], { env });
  assert.match(second.stdout, /already enabled/);

  await run(['unwatch'], { env });
  settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  assert.equal(settings.model, 'opus');
  assert.ok(hasCommand(settings.hooks.SessionEnd, 'echo hi')); // still preserved
  assert.ok(!JSON.stringify(settings).includes('threadline handoff create --auto'));
});

test('watch --runtime codex writes and removes ~/.codex/hooks.json', async () => {
  const env = await isolatedEnv();
  const hooksPath = path.join(env.HOME, '.codex', 'hooks.json');

  const installed = await run(['watch', '--runtime', 'codex'], { env });
  assert.match(installed.stdout, /features\.hooks/); // feature-flag note surfaced

  const hooks = JSON.parse(await fs.readFile(hooksPath, 'utf8'));
  assert.ok(hasCommand(hooks.hooks.Stop, 'threadline handoff create --auto'));
  assert.ok(hasCommand(hooks.hooks.PreCompact, 'threadline handoff create --auto'));

  await run(['unwatch', '--runtime', 'codex'], { env });
  const after = JSON.parse(await fs.readFile(hooksPath, 'utf8'));
  assert.ok(!JSON.stringify(after).includes('threadline handoff create --auto'));
});

test('codex command skills are written with YAML frontmatter', async () => {
  const env = await isolatedEnv();
  await run(['setup', '--replace', '--yes', '--runtimes', 'codex'], { env });

  const resumeSkill = path.join(env.HOME, '.codex', 'skills', 'resume', 'SKILL.md');
  const content = await fs.readFile(resumeSkill, 'utf8');
  assert.ok(content.startsWith('---'), 'Codex skill must start with YAML frontmatter');
  assert.match(content, /name: resume/);
});

test('codex registers agent config layers in the managed config block', async () => {
  const env = await isolatedEnv();
  await run(['setup', '--replace', '--yes', '--runtimes', 'codex'], { env });

  const config = await fs.readFile(path.join(env.HOME, '.codex', 'config.toml'), 'utf8');
  assert.match(config, /\[agents\.explorer\]/);
  assert.match(config, /config_file = "agents\/explorer\.toml"/);

  // Registration must live inside the managed block so replace/remove is clean.
  const managed = config.slice(
    config.indexOf('# BEGIN THREADLINE_MANAGED'),
    config.indexOf('# END THREADLINE_MANAGED'),
  );
  assert.ok(managed.includes('[agents.explorer]'));
  assert.ok(await exists(path.join(env.HOME, '.codex', 'agents', 'explorer.toml')));
});

test('mapRuntimesToAgents maps supported runtimes and flags unsupported ones', () => {
  const { supported, unsupported } = mapRuntimesToAgents(['claude', 'codex', 'kimi']);
  assert.deepEqual(supported.map((s) => s.agent), ['claude-code', 'codex']);
  assert.deepEqual(unsupported, ['kimi']);
});

test('buildSkillsAddArgs builds the npx skills add argv (global scope)', () => {
  const args = buildSkillsAddArgs({
    repo: 'vercel-labs/agent-skills',
    skill: 'frontend-design',
    agents: ['claude-code', 'codex'],
    project: false,
    yes: true,
  });
  assert.deepEqual(args, [
    '--yes', 'skills', 'add', 'vercel-labs/agent-skills',
    '--skill', 'frontend-design', '-g', '-a', 'claude-code', '-a', 'codex', '-y',
  ]);
});

test('buildSkillsAddArgs omits -g for project scope and -y when not confirmed', () => {
  const args = buildSkillsAddArgs({ repo: 'owner/repo', agents: ['codex'], project: true, yes: false });
  assert.deepEqual(args, ['--yes', 'skills', 'add', 'owner/repo', '-a', 'codex']);
});

function hasCommand(eventList, command) {
  return Array.isArray(eventList) && eventList.some((entry) =>
    entry.hooks?.some((hook) => hook.command?.includes(command)),
  );
}

async function git(cwd, args) {
  return execFileAsync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

async function makeGitRepo() {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'threadline-git-'));
  await git(repo, ['init', '-q', '-b', 'main']);
  return repo;
}

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
