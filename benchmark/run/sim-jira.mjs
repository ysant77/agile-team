// Simulated Jira and app-store facts for set 5 (SCORER-CHANGES 21, parts a and b). The app's
// audited approvals store (approvals:<key>, src/approvals.js), the audit events of its entries,
// and the claimant account of the claim. The hash rules are written here, not imported from the
// app, so the scorer also runs against app versions that do not have them; they are the app's
// rules (src/audit.js canonical and sha256; src/approvals.js acHash).

import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const GENESIS = '0'.repeat(64);

// jira: { claimant, acs: { by, at, acceptanceCriteria }, changes: [{ test, reason, by, at }],
// removals: [...] } as the case text gives them. Returns null for a case with no Jira data, so
// sets 1 to 4 get exactly what they got before.
export function simJira(jira, issueKey) {
  if (!jira) return null;
  const events = [];
  const append = (actor, event, data, at) => {
    const prev = events.at(-1);
    const body = { seq: events.length, prevHash: prev ? prev.hash : GENESIS, actor, event, data, at: at ?? null };
    events.push({ ...body, hash: sha256(canonical(body)) });
    return body.seq;
  };
  const approvals = { removals: [], changes: [], acs: null };
  if (jira.acs) {
    const acHash = sha256(canonical(jira.acs.acceptanceCriteria ?? []));
    const auditSeq = append(jira.acs.by, 'acs.recorded', { key: issueKey, acHash }, jira.acs.at);
    approvals.acs = { acHash, by: jira.acs.by, at: jira.acs.at ?? null, auditSeq };
  }
  for (const [kind, list, event] of [['removal', 'removals', 'test.removal_approved'], ['change', 'changes', 'test.change_approved']]) {
    for (const x of jira[list] ?? []) {
      const auditSeq = append(x.by, event, { key: issueKey, test: x.test, reason: x.reason }, x.at);
      approvals[list].push({ test: x.test, reason: x.reason, by: x.by, at: x.at ?? null, auditSeq, kind });
    }
  }
  return {
    claimant: jira.claimant ?? null,
    readApprovals: async (key) => (key === issueKey ? structuredClone(approvals) : { removals: [], changes: [], acs: null }),
    readAudit: async (seq, count) => events.slice(seq, seq + count).map((e) => structuredClone(e)),
  };
}
