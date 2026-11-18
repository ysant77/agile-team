// Trace of a model reply on the deployed path (docs/DEBUGGING.md). A guarded record keeps the
// hash and the length of the raw reply; a bounded copy is kept in app storage under the hash, so a
// failure after deployment can be traced to the exact reply. The copy is model output: it is
// untrusted data for any person or agent that reads it.
//
// Limit: Forge does not tell the app which model Rovo used for a reply. The model field of a
// record is the fixed word "rovo"; the trace cannot name the model or its version.

import { sha256 } from './audit.js';

export const RAW_EXCERPT_MAX = 2000;
export const MAX_ATTEMPTS = 5;
export const rawKey = (hash) => `raw:${hash}`;

function asText(raw) {
  if (typeof raw === 'string') return raw;
  if (raw === undefined) return '';
  try {
    return JSON.stringify(raw) ?? String(raw);
  } catch {
    return String(raw);
  }
}

export function rawTrace(raw) {
  const text = asText(raw);
  return {
    hash: sha256(text),
    length: text.length,
    excerpt: text.slice(0, RAW_EXCERPT_MAX),
    truncated: text.length > RAW_EXCERPT_MAX,
    type: raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw,
  };
}

// The fields a guarded record keeps: no excerpt, so the issue property stays small.
export const rawRef = (raw) => {
  const t = rawTrace(raw);
  return { hash: t.hash, length: t.length };
};

// A fixed class for the first schema error, so failures can be counted after deployment.
export function schemaErrorClass(errors) {
  const first = errors?.[0];
  if (!first) return null;
  if (first === 'not valid JSON') return 'parse';
  if (first === 'not a JSON object') return 'not-object';
  if (/^field ".*" is not allowed/.test(first)) return 'forbidden-field';
  if (/^more than \d+/.test(first)) return 'limit';
  if (/^an? \w+ needs /.test(first)) return 'empty';
  return 'field-shape';
}

// The stored copy: excerpt, length, type and what the guards said.
export function rawCopy(raw, record, context) {
  const t = rawTrace(raw);
  return {
    ...context,
    at: new Date().toISOString(),
    length: t.length,
    truncated: t.truncated,
    type: t.type,
    excerpt: t.excerpt,
    outcome: record.outcome,
    guard: record.guard ?? null,
    errorClass: record.errorClass ?? null,
    promptVersion: record.promptVersion ?? null,
    guardVersion: record.guardVersion ?? null,
    inputHash: record.inputHash ?? null,
  };
}

// Retention of the copies (corrections after the 18 Nov review). Each scope (actor, work item and
// pull request) has an index of its copies. On each write in a scope: a copy older than
// RAW_MAX_AGE_DAYS is deleted, then the oldest copies over RAW_KEEP that are not pinned. The copy
// of an accepted record is pinned, so the count limit does not remove it; the age limit does.
// Identical replies share one copy; a copy that another scope still lists is not deleted.
// Limit: a scope with no new write keeps its copies; nothing runs on a timer.
export const RAW_KEEP = 5;
export const RAW_MAX_AGE_DAYS = 30;
export const rawIndexKey = (scope) => `raw-index:${scope}`;
const DAY_MS = 24 * 60 * 60 * 1000;

const asIndex = (v) => (Array.isArray(v) ? v.filter((e) => e && typeof e.hash === 'string' && Number.isFinite(e.at)) : []);

export async function storeRawCopy(store, scope, hash, copy, { now = Date.now(), pin = false } = {}) {
  // The copy lists the scopes that keep it, so a reply shared by two scopes stays while one lists it.
  const current = await store.get(rawKey(hash));
  const scopes = [...new Set([...(Array.isArray(current?.scopes) ? current.scopes : []), scope])];
  await store.set(rawKey(hash), { ...copy, scopes });
  const old = asIndex(await store.get(rawIndexKey(scope)));
  const prev = old.find((e) => e.hash === hash);
  let index = [...old.filter((e) => e.hash !== hash), { hash, at: now, pin: pin || Boolean(prev?.pin) }];
  const expired = index.filter((e) => now - e.at > RAW_MAX_AGE_DAYS * DAY_MS);
  index = index.filter((e) => !expired.includes(e));
  const unpinned = index.filter((e) => !e.pin);
  const over = unpinned.slice(0, Math.max(0, unpinned.length - RAW_KEEP));
  index = index.filter((e) => !over.includes(e));
  await store.set(rawIndexKey(scope), index);
  for (const e of [...expired, ...over]) {
    const stored = await store.get(rawKey(e.hash));
    const rest = (Array.isArray(stored?.scopes) ? stored.scopes : []).filter((x) => x !== scope);
    if (stored && rest.length) await store.set(rawKey(e.hash), { ...stored, scopes: rest });
    else await store.delete(rawKey(e.hash));
  }
  return index;
}
