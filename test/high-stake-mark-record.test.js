// Set 8 Y08 (development data, 24 Nov): a claimant removed the money_semantics label before the
// claim, so no sign-off was asked. Fix: the high-stake marks present when a person records the ACs
// are kept in the audited AC record; a mark recorded by a person other than the claimant still asks
// for the sign-off when it is gone at the claim, and a removal by the claimant is named.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextEvent } from '../src/audit.js';
import { ACS_EVENT, acHash } from '../src/approvals.js';
import { recordAcsAction } from '../src/approval-actions.js';
import { checkHumanSignoff } from '../src/verifier/checks.js';

const KEY = 'BANK-8';
const ACS = [{ acId: 'AC1', text: 'split', check: { type: 'test_passes', args: ['test_split'] } }];
const MERGE = 'm'.repeat(40);

function recorded({ by = 'po', marks = ['money_semantics'], eventMarks = marks } = {}) {
  const event = nextEvent(null, { actor: by, event: ACS_EVENT, data: { key: KEY, acHash: acHash(ACS), ...(eventMarks ? { marks: eventMarks } : {}) }, at: '2026-11-20T10:00:00.000Z' });
  return { approvals: { removals: [], changes: [], acs: { acHash: acHash(ACS), by, at: event.at, auditSeq: event.seq, ...(marks ? { marks } : {}) } }, approvalEvents: new Map([[event.seq, event]]) };
}
const ctxOf = (extra = {}) => ({ ticket: { key: KEY, labels: [], acceptanceCriteria: ACS }, pr: { mergeSha: MERGE }, claimant: 'dev', ...recorded(), ...extra });

test('a mark recorded with the ACs by another person asks for the sign-off when the label is gone', () => {
  const r = checkHumanSignoff(ctxOf());
  assert.equal(r.status, 'unknown');
  assert.match(r.reason, /money_semantics was recorded with the ACs \(audit seq 0\) and is not on the work item at the claim/);
  assert.match(r.reason, /a person's sign-off of the merged change is required, and none is recorded/);
});

test('a removal by the claimant is named in the reason', () => {
  const r = checkHumanSignoff(ctxOf({ markRemoval: { mark: 'money_semantics', by: 'dev', at: '2026-11-24T10:10:00.000Z' } }));
  assert.match(r.reason, /the claimant removed the label money_semantics/);
  const other = checkHumanSignoff(ctxOf({ markRemoval: { mark: 'money_semantics', by: 'po', at: '2026-11-24T10:10:00.000Z' } }));
  assert.doesNotMatch(other.reason, /the claimant removed/);
});

test('no lower bar: a sign-off of the merged commit by another person still passes', () => {
  const signoff = { by: 'po', sha: MERGE, at: 'T', auditSeq: 1 };
  const event = { seq: 1, event: 'change.signed_off', actor: 'po', data: { key: KEY, sha: MERGE } };
  const ctx = ctxOf({ ticket: { key: KEY, labels: [], acceptanceCriteria: ACS, signoff }, signoffEvent: event });
  // The sign-off audit check is the same as before; only the domain source changes.
  assert.equal(checkHumanSignoff(ctx).name, 'human_signoff');
});

test('a mark recorded by the claimant, a record with no marks, or an event that does not match adds nothing', () => {
  assert.equal(checkHumanSignoff(ctxOf(recorded({ by: 'dev' }))), null);
  assert.equal(checkHumanSignoff(ctxOf(recorded({ marks: null }))), null);
  assert.equal(checkHumanSignoff(ctxOf(recorded({ eventMarks: ['fairness'] }))), null);
});

test('a live label decides as before', () => {
  const r = checkHumanSignoff(ctxOf({ ticket: { key: KEY, labels: ['money_semantics'], acceptanceCriteria: ACS } }));
  assert.match(r.reason, /^money_semantics: a person's sign-off/);
});

test('recording the ACs keeps the high-stake marks of that moment in the event and the record', async () => {
  const events = [];
  const store = new Map();
  const deps = {
    canEdit: async () => true, readAcs: async () => ACS,
    readMarks: async () => ({ domain: null, labels: ['Money_Semantics', 'ui'] }),
    appendAudit: async (e) => { events.push(e); return { seq: events.length - 1, at: 'T' }; },
    store: { get: async (k) => store.get(k), set: async (k, v) => { store.set(k, v); } },
  };
  const r = await recordAcsAction({ key: KEY, accountId: 'po' }, deps);
  assert.equal(r.ok, true);
  assert.deepEqual(events[0].data, { key: KEY, acHash: acHash(ACS), marks: ['money_semantics'] });
  assert.deepEqual([...store.values()][0].acs.marks, ['money_semantics']);
  // No high-stake mark: the event is as before.
  const events2 = [];
  await recordAcsAction({ key: KEY, accountId: 'po' }, { ...deps, readMarks: async () => ({ domain: null, labels: [] }), appendAudit: async (e) => { events2.push(e); return { seq: 0, at: 'T' }; } });
  assert.deepEqual(events2[0].data, { key: KEY, acHash: acHash(ACS) });
});

test('the changelog gives the last removal of a recorded mark, and decide reads it only when the mark is gone', async () => {
  const { readMarkRemoval } = await import('../src/jira-evidence.js');
  const page = { values: [
    { author: { accountId: 'po' }, created: '2026-11-19T10:00:00.000+0000', items: [{ field: 'labels', fromString: '', toString: 'money_semantics' }] },
    { author: { accountId: 'dev' }, created: '2026-11-24T10:10:00.000+0000', items: [{ field: 'labels', fromString: 'money_semantics ui', toString: 'ui' }] },
  ], isLast: true };
  const requestJira = async () => ({ ok: true, json: async () => page });
  assert.deepEqual(await readMarkRemoval('BANK-8', ['money_semantics'], requestJira), { mark: 'money_semantics', by: 'dev', at: '2026-11-24T10:10:00.000+0000' });
  assert.equal(await readMarkRemoval('BANK-8', ['fairness'], requestJira), null);
  assert.equal(await readMarkRemoval('BANK-8', ['money_semantics'], async () => ({ ok: false, status: 403 })), null);
});
