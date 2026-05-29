import path from 'node:path';
import { getAdapter } from '../adapters/index.mjs';
import { expandHome, readJsonIfExists, writeJsonIfChanged } from '../utils/fs.mjs';

// The command Threadline installs as a runtime hook. The substring is also the
// sentinel used to find and remove our entries on `unwatch`, so it must stay
// stable and unique.
const AUTO_COMMAND = 'threadline handoff create --auto';
const DEFAULT_EVENTS = ['SessionEnd', 'PreCompact'];
const EVENT_ALIASES = {
  sessionend: 'SessionEnd',
  precompact: 'PreCompact',
  stop: 'Stop',
};

/** Normalize a comma list or array of event names to canonical Claude casing. */
function normalizeEvents(input) {
  if (!input || input === true) return [...DEFAULT_EVENTS];
  const names = Array.isArray(input) ? input : String(input).split(',');
  const out = [];
  for (const raw of names) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const name = EVENT_ALIASES[key] ?? raw.trim();
    if (!out.includes(name)) out.push(name);
  }
  return out.length ? out : [...DEFAULT_EVENTS];
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

function claudeSettingsPath() {
  // Expand here: readJsonIfExists does not expand `~`, but writeJsonIfChanged
  // does. Reading and writing must resolve to the same absolute path, or we
  // read nothing and overwrite the user's real settings.json. (Regression-tested.)
  return expandHome(path.join(getAdapter('claude').homeDir, 'settings.json'));
}

function assertClaude(runtime) {
  if (runtime !== 'claude') {
    throw new Error(`watch currently supports only the "claude" runtime (got "${runtime}").`);
  }
}

/**
 * Install auto-handoff hooks into the runtime's settings, idempotently. Existing
 * hooks and unrelated settings are preserved. Re-running is a no-op.
 */
export async function executeWatchInstall({ runtime = 'claude', events } = {}) {
  assertClaude(runtime);
  const targetEvents = normalizeEvents(events);
  const settingsPath = claudeSettingsPath();
  const current = (await readJsonIfExists(settingsPath)) ?? {};
  const hooks = { ...(current.hooks ?? {}) };

  for (const event of targetEvents) {
    const list = Array.isArray(hooks[event]) ? hooks[event] : [];
    hooks[event] = list.some(isThreadlineEntry) ? list : [...list, makeEntry()];
  }

  const next = { ...current, hooks };
  const result = await writeJsonIfChanged(settingsPath, next);
  return { ...result, runtime, events: targetEvents, command: AUTO_COMMAND };
}

/**
 * Remove every auto-handoff hook Threadline installed, leaving unrelated hooks
 * and settings intact. Reversible counterpart to executeWatchInstall.
 */
export async function executeWatchRemove({ runtime = 'claude' } = {}) {
  assertClaude(runtime);
  const settingsPath = claudeSettingsPath();
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
