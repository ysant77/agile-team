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
