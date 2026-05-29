import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { getThreadlinePaths } from './paths.mjs';
import { normalizeRuntimes } from '../adapters/index.mjs';
import { detectInstalledRuntimes } from '../utils/detect-runtimes.mjs';
import { readJsonIfExists, writeJsonIfChanged } from '../utils/fs.mjs';

const execFileAsync = promisify(execFile);
const NPX_TIMEOUT_MS = 180000;

// Threadline runtime id -> vercel `skills` agent id. Threadline delegates the
// per-agent install to `npx skills` (it already handles paths, frontmatter, and
// multi-file layout per the Agent Skills spec); threadline owns runtime mapping
// and provenance. Runtimes absent here (e.g. kimi) aren't supported by the
// vercel CLI and are reported back to the caller.
const VERCEL_AGENT_IDS = {
  claude: 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
  opencode: 'opencode',
};

/** Split runtimes into those the vercel CLI supports (with agent id) and those it doesn't. */
export function mapRuntimesToAgents(runtimes) {
  const supported = [];
  const unsupported = [];
  for (const runtime of normalizeRuntimes(runtimes)) {
    const agent = VERCEL_AGENT_IDS[runtime];
    if (agent) supported.push({ runtime, agent });
    else unsupported.push(runtime);
  }
  return { supported, unsupported };
}

/** Build the argv for `npx skills add`. Pure — no side effects. */
export function buildSkillsAddArgs({ repo, skill, agents, project = false, yes = true }) {
  const args = ['--yes', 'skills', 'add', repo];
  if (skill) args.push('--skill', skill);
  if (!project) args.push('-g'); // global scope mirrors threadline's default
  for (const agent of agents) args.push('-a', agent);
  if (yes) args.push('-y');
  return args;
}

/** Resolve which runtimes to install for: explicit list, else detected installed runtimes. */
async function resolveRuntimes(runtimes) {
  if (runtimes?.length) return runtimes;
  const detected = await detectInstalledRuntimes();
  return detected.filter((r) => r.installed).map((r) => r.id);
}

async function recordProvenance({ repo, skill, supported, project }) {
  const { configDir } = getThreadlinePaths();
  const lockPath = path.join(configDir, 'skills.lock.json');
  const lock = (await readJsonIfExists(lockPath)) ?? { version: 1, managedBy: 'threadline', skills: [] };
  const external = Array.isArray(lock.external) ? lock.external : [];
  const entry = {
    source: repo,
    skill: skill ?? null,
    runtimes: supported.map((s) => s.runtime),
    agents: supported.map((s) => s.agent),
    scope: project ? 'project' : 'global',
    via: 'npx skills',
    installedAt: new Date().toISOString(),
  };
  const next = {
    ...lock,
    external: [entry, ...external.filter((e) => !(e.source === repo && e.skill === entry.skill))],
  };
  const result = await writeJsonIfChanged(lockPath, next);
  return result.target;
}

/**
 * Install an ecosystem skill by delegating to the vercel `npx skills` CLI, then
 * recording provenance in skills.lock.json. Returns a summary including any
 * runtimes the vercel CLI cannot target.
 */
export async function executeSkillsAdd({ repo, skill, runtimes, project = false, yes = true } = {}) {
  if (!repo) throw new Error('A skill source is required (e.g. owner/repo).');

  const resolved = await resolveRuntimes(runtimes);
  const { supported, unsupported } = mapRuntimesToAgents(resolved);

  if (!supported.length) {
    throw new Error(
      `No runtimes supported by \`npx skills\` among: ${resolved.join(', ') || '(none detected)'}. ` +
        `Supported: ${Object.keys(VERCEL_AGENT_IDS).join(', ')}.`,
    );
  }

  const args = buildSkillsAddArgs({ repo, skill, agents: supported.map((s) => s.agent), project, yes });

  let stdout = '';
  let stderr = '';
  try {
    const result = await execFileAsync('npx', args, { timeout: NPX_TIMEOUT_MS });
    stdout = result.stdout ?? '';
    stderr = result.stderr ?? '';
  } catch (err) {
    const detail = err.stderr || err.stdout || err.message;
    throw new Error(`\`npx ${args.join(' ')}\` failed: ${detail}`);
  }

  const lockTarget = await recordProvenance({ repo, skill, supported, project });

  return {
    repo,
    skill: skill ?? null,
    installed: supported,
    unsupported,
    scope: project ? 'project' : 'global',
    command: `npx ${args.join(' ')}`,
    lockTarget,
    stdout,
    stderr,
  };
}
