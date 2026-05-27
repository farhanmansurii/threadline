import { createGenericAdapter } from './generic/adapter.mjs';
import * as claude from './claude/adapter.mjs';
import * as codex from './codex/adapter.mjs';
import * as cursor from './cursor/adapter.mjs';
import * as kimi from './kimi/adapter.mjs';
import * as opencode from './opencode/adapter.mjs';

const BUILTIN = new Map([
  ['claude', claude],
  ['codex', codex],
  ['cursor', cursor],
  ['kimi', kimi],
  ['opencode', opencode],
]);

export function listAdapters() {
  return Array.from(BUILTIN.values()).map((a) => ({ id: a.id, name: a.name, homeDir: a.homeDir, supports: a.supports }));
}

export function getAdapter(runtimeId) {
  const builtin = BUILTIN.get(runtimeId);
  if (builtin) return builtin;
  return createGenericAdapter(runtimeId);
}

export function isKnownAdapter(runtimeId) {
  return BUILTIN.has(runtimeId);
}

export function normalizeRuntimes(runtimes) {
  return [...new Set(runtimes.map((r) => r.trim().toLowerCase()).filter(Boolean))];
}
