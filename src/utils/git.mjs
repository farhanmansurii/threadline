import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 5000;
const RECENT_COMMIT_LIMIT = 8;

/**
 * Run a git subcommand in `cwd`. Returns trimmed stdout, or null on any failure
 * (not a repo, no commits, no upstream, git missing). Never throws.
 */
async function runGit(cwd, args, { trim = true } = {}) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: GIT_TIMEOUT_MS });
    // `--porcelain` leading spaces are significant (they encode staged vs
    // unstaged), so callers parsing columns must opt out of trimming.
    return trim ? stdout.trim() : stdout.replace(/\n+$/, '');
  } catch {
    return null;
  }
}

/** Parse `git status --porcelain` into staged / unstaged / untracked file lists. */
function parsePorcelain(porcelain) {
  const staged = [];
  const unstaged = [];
  const untracked = [];
  if (!porcelain) return { staged, unstaged, untracked };

  for (const line of porcelain.split('\n')) {
    if (!line) continue;
    const x = line[0]; // index (staged) status
    const y = line[1]; // working-tree (unstaged) status
    const file = line.slice(3);
    if (x === '?' && y === '?') {
      untracked.push(file);
      continue;
    }
    if (x !== ' ' && x !== '?') staged.push(file);
    if (y !== ' ' && y !== '?') unstaged.push(file);
  }
  return { staged, unstaged, untracked };
}

/** Parse `git log` "<sha>\x1f<subject>" lines into commit objects. */
function parseCommits(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ...rest] = line.split('\x1f');
      return { sha, subject: rest.join('\x1f') };
    });
}

/**
 * Capture a snapshot of the repository state at `root`. Always resolves; on a
 * non-git directory it returns `{ isRepo: false }` with empty collections so
 * callers can render a clean fallback instead of handling errors everywhere.
 */
export async function captureGitState(root) {
  const empty = {
    isRepo: false,
    branch: null,
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    dirty: false,
    staged: [],
    unstaged: [],
    untracked: [],
    diffStat: null,
    recentCommits: [],
  };

  const inside = await runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') return empty;

  const [branch, head, upstream, porcelain, diffStat, commitsRaw] = await Promise.all([
    runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    runGit(root, ['rev-parse', '--short', 'HEAD']),
    runGit(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
    runGit(root, ['status', '--porcelain'], { trim: false }),
    runGit(root, ['diff', '--stat', 'HEAD']),
    runGit(root, ['log', `-n${RECENT_COMMIT_LIMIT}`, '--format=%h\x1f%s']),
  ]);

  const { staged, unstaged, untracked } = parsePorcelain(porcelain);

  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const counts = await runGit(root, ['rev-list', '--left-right', '--count', `${upstream}...HEAD`]);
    if (counts) {
      const [behindStr, aheadStr] = counts.split(/\s+/);
      behind = Number.parseInt(behindStr, 10) || 0;
      ahead = Number.parseInt(aheadStr, 10) || 0;
    }
  }

  return {
    isRepo: true,
    branch: branch || null,
    head: head || null,
    upstream: upstream || null,
    ahead,
    behind,
    dirty: staged.length + unstaged.length + untracked.length > 0,
    staged,
    unstaged,
    untracked,
    diffStat: diffStat || null,
    recentCommits: parseCommits(commitsRaw),
  };
}

/** Render captured git state as the "Changed Files" markdown section. */
export function renderChangedFiles(git) {
  if (!git.isRepo) return '- Not a git repository';
  const lines = [];
  for (const file of git.staged) lines.push(`- \`${file}\` (staged)`);
  for (const file of git.unstaged) lines.push(`- \`${file}\` (modified)`);
  for (const file of git.untracked) lines.push(`- \`${file}\` (untracked)`);
  return lines.length ? lines.join('\n') : '- Working tree clean';
}

/** Render captured git state as the "Git State" markdown section. */
export function renderGitState(git) {
  if (!git.isRepo) return '- Not a git repository';
  const lines = [];
  lines.push(`- Branch: \`${git.branch ?? 'unknown'}\` @ \`${git.head ?? 'unknown'}\``);
  if (git.upstream) {
    lines.push(`- Upstream: \`${git.upstream}\` (${git.ahead} ahead, ${git.behind} behind)`);
  } else {
    lines.push('- Upstream: none (no tracking branch)');
  }
  lines.push(`- Working tree: ${git.dirty ? 'dirty' : 'clean'}`);
  if (git.recentCommits.length) {
    lines.push('- Recent commits:');
    for (const commit of git.recentCommits) lines.push(`  - \`${commit.sha}\` ${commit.subject}`);
  }
  return lines.join('\n');
}
