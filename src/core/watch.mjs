import path from 'node:path';
import { getAdapter } from '../adapters/index.mjs';
import { expandHome, readJsonIfExists, writeJsonIfChanged } from '../utils/fs.mjs';

// The command Threadline installs as a runtime hook. The substring is also the
// sentinel used to find and remove our entries on `unwatch`, so it must stay
// stable and unique.
const AUTO_COMMAND = 'threadline handoff create --auto';

// Per-runtime hook wiring. Both Claude Code and Codex use the same nested hook
// JSON shape ({ hooks: { Event: [ { hooks: [ { type, command } ] } ] } }); only
// the file and the available lifecycle events differ.
//   - Claude: ~/.claude/settings.json  (shares the file with other settings)
//   - Codex:  ~/.codex/hooks.json       (dedicated; needs features.hooks = true)
const RUNTIME_HOOKS = {
  claude: {
    file: () => path.join(getAdapter('claude').homeDir, 'settings.json'),
    defaultEvents: ['SessionEnd', 'PreCompact'],
    note: null,
  },
  codex: {
    file: () => path.join(getAdapter('codex').homeDir, 'hooks.json'),
    // Codex has no SessionEnd; Stop is the per-turn-completion boundary.
    defaultEvents: ['Stop', 'PreCompact'],
    note: 'Codex hooks require features.hooks = true in ~/.codex/config.toml.',
  },
};

// Canonical casing for events the user may pass lower-cased via --on.
const EVENT_ALIASES = {
  sessionend: 'SessionEnd',
  sessionstart: 'SessionStart',
  precompact: 'PreCompact',
  postcompact: 'PostCompact',
  stop: 'Stop',
};

function resolveRuntime(runtime) {
  const cfg = RUNTIME_HOOKS[runtime];
  if (!cfg) {
    const supported = Object.keys(RUNTIME_HOOKS).join(', ');
    throw new Error(`watch supports only these runtimes: ${supported} (got "${runtime}").`);
  }
  // Expand here: readJsonIfExists does not expand `~`, but writeJsonIfChanged
  // does. Reading and writing must resolve to the same absolute path, or we
  // read nothing and overwrite the user's real settings. (Regression-tested.)
  return { ...cfg, settingsPath: expandHome(cfg.file()) };
}

/** Normalize a comma list / array of event names to canonical casing. */
function normalizeEvents(input, defaults) {
  if (!input || input === true) return [...defaults];
  const names = Array.isArray(input) ? input : String(input).split(',');
  const out = [];
  for (const raw of names) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const name = EVENT_ALIASES[key] ?? raw.trim();
    if (!out.includes(name)) out.push(name);
  }
  return out.length ? out : [...defaults];
}

/** True when a hook entry is one Threadline installed (matches the sentinel). */
function isThreadlineEntry(entry) {
  const hooks = entry?.hooks;
  if (!Array.isArray(hooks)) return false;
  return hooks.some((hook) => typeof hook?.command === 'string' && hook.command.includes(AUTO_COMMAND));
}

function makeEntry() {
  return { hooks: [{ type: 'command', command: AUTO_COMMAND }] };
}

/**
 * Install auto-handoff hooks into the runtime's hook file, idempotently. Existing
 * hooks and unrelated keys are preserved. Re-running is a no-op.
 */
export async function executeWatchInstall({ runtime = 'claude', events } = {}) {
  const { settingsPath, defaultEvents, note } = resolveRuntime(runtime);
  const targetEvents = normalizeEvents(events, defaultEvents);
  const current = (await readJsonIfExists(settingsPath)) ?? {};
  const hooks = { ...(current.hooks ?? {}) };

  for (const event of targetEvents) {
    const list = Array.isArray(hooks[event]) ? hooks[event] : [];
    hooks[event] = list.some(isThreadlineEntry) ? list : [...list, makeEntry()];
  }

  const next = { ...current, hooks };
  const result = await writeJsonIfChanged(settingsPath, next);
  return { ...result, runtime, events: targetEvents, command: AUTO_COMMAND, note };
}

/**
 * Remove every auto-handoff hook Threadline installed, leaving unrelated hooks
 * and keys intact. Reversible counterpart to executeWatchInstall.
 */
export async function executeWatchRemove({ runtime = 'claude' } = {}) {
  const { settingsPath } = resolveRuntime(runtime);
  const current = await readJsonIfExists(settingsPath);
  if (!current?.hooks) {
    return { changed: false, target: settingsPath, runtime };
  }

  const hooks = {};
  for (const [event, list] of Object.entries(current.hooks)) {
    if (!Array.isArray(list)) {
      hooks[event] = list;
      continue;
    }
    const kept = list.filter((entry) => !isThreadlineEntry(entry));
    if (kept.length) hooks[event] = kept;
  }

  const next = { ...current };
  if (Object.keys(hooks).length === 0) {
    delete next.hooks;
  } else {
    next.hooks = hooks;
  }
  const result = await writeJsonIfChanged(settingsPath, next);
  return { ...result, runtime };
}
