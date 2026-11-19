// Approvals of removed or changed tests, and the audited record of a work item's acceptance
// criteria (execution plan 19 Nov, finding E1). They live in the app's store (Forge KVS), which no
// user can write; the issue property aat.ticket can be written by any issue editor, so it proves
// nothing. Each entry names the audit event that the panel action wrote first; the verifier counts
// an entry only when that event matches (src/verifier/checks.js, auditedApprovals and acsRecorded).

import { canonical, sha256 } from './audit.js';

const KINDS = { removal: 'removals', change: 'changes' };
// At most this many approvals of each kind per work item; the oldest go first.
export const MAX_APPROVALS = 50;
export const approvalsKey = (issueKey) => `approvals:${issueKey}`;
export const APPROVAL_EVENTS = { removal: 'test.removal_approved', change: 'test.change_approved' };
export const ACS_EVENT = 'acs.recorded';

// The hash of an AC list, independent of key order inside each AC.
export const acHash = (acs) => sha256(canonical(Array.isArray(acs) ? acs : []));

const empty = () => ({ removals: [], changes: [], acs: null });

export async function readApprovals(issueKey, store) {
  const v = await store.get(approvalsKey(issueKey));
  return v && typeof v === 'object' ? { ...empty(), ...v } : empty();
}

// Appends one approval ({ test, reason, by, at, auditSeq }) of kind "removal" or "change".
export async function recordApproval(store, issueKey, kind, entry) {
  const list = KINDS[kind];
  if (!list) throw new Error(`unknown approval kind ${JSON.stringify(kind)}`);
  const current = await readApprovals(issueKey, store);
  current[list] = [...current[list], entry].slice(-MAX_APPROVALS);
  await store.set(approvalsKey(issueKey), current);
  return current;
}

// Sets the latest audited AC record ({ acHash, by, at, auditSeq }).
export async function recordAcs(store, issueKey, record) {
  const current = await readApprovals(issueKey, store);
  current.acs = record;
  await store.set(approvalsKey(issueKey), current);
  return current;
}

// The audit sequence numbers that the verifier must read to check the entries.
export function auditSeqs(approvals) {
  if (!approvals || typeof approvals !== 'object') return [];
  const entries = [...(Array.isArray(approvals.removals) ? approvals.removals : []), ...(Array.isArray(approvals.changes) ? approvals.changes : []), approvals.acs];
  return [...new Set(entries.map((e) => e?.auditSeq).filter((s) => Number.isInteger(s) && s >= 0))];
}
