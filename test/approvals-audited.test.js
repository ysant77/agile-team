// Approvals and acceptance criteria must come from the app, not from an issue property that any
// issue editor can write by REST (execution plan 19 Nov, finding E1). An approval of a removed or
// changed test counts only when it is in the app's store with a matching audit event, and was
// made by a person other than the claimant. The ACs are compared with the last audited record.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextEvent } from '../src/audit.js';
import { acHash, readApprovals, recordAcs, recordApproval } from '../src/approvals.js';
import { acsRecorded, pinnedTestsHold, testsNotRemoved } from '../src/verifier/checks.js';
import { verify } from '../src/verifier/verdict.js';

const KEY = 'BANK-9';
const H = (c) => c.repeat(64);
const memStore = () => {
  const m = new Map();
  return { get: async (k) => structuredClone(m.get(k)), set: async (k, v) => { m.set(k, structuredClone(v)); }, map: m };
};

// An audit chain with the events the panel actions write.
function chain(specs) {
  const events = [];
  for (const s of specs) events.push(nextEvent(events[events.length - 1] ?? null, { at: '2026-11-19T00:00:00Z', ...s }));
  return events;
}
const eventsMap = (events) => new Map(events.map((e) => [e.seq, e]));

const base = { tests: [{ id: 'tests/test_api.py::test_guard', outcome: 'passed' }, { id: 'tests/test_api.py::test_b', outcome: 'passed' }] };
const head = { tests: [{ id: 'tests/test_api.py::test_b', outcome: 'passed' }] };

function removalCtx({ property = [], approvals, events = [], claimant = 'dev-1' } = {}) {
  return { ticket: { key: KEY, approvedTestRemovals: property }, baseReport: base, claimant, approvals, approvalEvents: eventsMap(events) };
}
const removalApproval = (by, seq, extra = {}) => ({ test: 'test_guard', reason: 'the endpoint is retired in AC2', by, at: '2026-11-19T00:00:00Z', auditSeq: seq, ...extra });
const removalEvent = (by, extra = {}) => ({ actor: by, event: 'test.removal_approved', data: { key: KEY, test: 'test_guard', reason: 'the endpoint is retired in AC2', ...extra } });

test('a removal approved only in the issue property does not count', () => {
  const r = testsNotRemoved(removalCtx({ property: ['test_guard'] }), head);
  assert.equal(r.status, 'fail', r.reason);
  assert.match(r.reason, /test_guard/);
  assert.match(r.reason, /issue property/);
});

test('an audited removal approval by another person counts', () => {
  const events = chain([removalEvent('lead-1')]);
  const r = testsNotRemoved(removalCtx({ approvals: { removals: [removalApproval('lead-1', 0)] }, events }), head);
  assert.equal(r.status, 'pass', r.reason);
});

test('the claimant cannot approve the removal of their own change', () => {
  const events = chain([removalEvent('dev-1')]);
  const r = testsNotRemoved(removalCtx({ approvals: { removals: [removalApproval('dev-1', 0)] }, events }), head);
  assert.equal(r.status, 'fail', r.reason);
  assert.match(r.reason, /claimant/);
});

test('an approval with no matching audit event does not count', () => {
  const good = chain([removalEvent('lead-1')]);
  const cases = [
    { approvals: { removals: [removalApproval('lead-1', 0)] }, events: [] },
    { approvals: { removals: [removalApproval('lead-1', 0)] }, events: chain([removalEvent('lead-1', { test: 'test_other' })]) },
    { approvals: { removals: [removalApproval('lead-1', 0)] }, events: chain([removalEvent('lead-2')]) },
    { approvals: { removals: [removalApproval('lead-1', 0)] }, events: [{ ...good[0], data: { ...good[0].data, key: 'BANK-1' } }] },
    { approvals: { removals: [removalApproval('lead-1', 0, { reason: 'other reason text' })] }, events: good },
  ];
  for (const c of cases) assert.equal(testsNotRemoved(removalCtx(c), head).status, 'fail', JSON.stringify(c.events[0]?.data));
});

test('an unknown claimant: an audited approval cannot be shown to come from another person', () => {
  const events = chain([removalEvent('lead-1')]);
  const r = testsNotRemoved(removalCtx({ approvals: { removals: [removalApproval('lead-1', 0)] }, events, claimant: null }), head);
  assert.equal(r.status, 'unknown', r.reason);
});

test('a malformed approval record gives unknown', () => {
  for (const approvals of ['all', { removals: 'all' }, { removals: [null] }, { changes: {} }]) {
    assert.equal(testsNotRemoved(removalCtx({ approvals }), head).status, 'unknown', JSON.stringify(approvals));
  }
});

// The pinned check: a changed pin needs an audited approval by another person.
const pin = (extra = {}) => ({ id: 'tests/test_api.py::test_transfer_errors', base_hash: H('a'), head_id: 'tests/test_api.py::test_transfer_errors', head_hash: H('c'), outcome: 'failed', ...extra });
const pinnedCtx = ({ property = [], approvals, events = [], claimant = 'dev-1' } = {}) => ({
  ticket: { key: KEY, approvedTestRemovals: [], approvedTestChanges: property }, claimant, approvals, approvalEvents: eventsMap(events),
  report: { tests: [], pinned: { version: 1, base_sha: 'b'.repeat(40), tests: [pin()] } },
});
const changeApproval = (by, seq) => ({ test: 'test_transfer_errors', reason: 'AC2 changes the status to 400', by, at: '2026-11-19T00:00:00Z', auditSeq: seq });
const changeEvent = (by) => ({ actor: by, event: 'test.change_approved', data: { key: KEY, test: 'test_transfer_errors', reason: 'AC2 changes the status to 400' } });

test('a changed pin approved only in the issue property does not count', () => {
  const r = pinnedTestsHold(pinnedCtx({ property: [{ test: 'test_transfer_errors', reason: 'AC2 changes the status to 400', auditSeq: 12 }] }));
  assert.equal(r.status, 'fail', r.reason);
});

test('a changed pin with an audited approval by another person passes; by the claimant it fails', () => {
  assert.equal(pinnedTestsHold(pinnedCtx({ approvals: { changes: [changeApproval('lead-1', 0)] }, events: chain([changeEvent('lead-1')]) })).status, 'pass');
  assert.equal(pinnedTestsHold(pinnedCtx({ approvals: { changes: [changeApproval('dev-1', 0)] }, events: chain([changeEvent('dev-1')]) })).status, 'fail');
});

// The ACs: the current ACs must match the last audited record.
const ACS = [{ acId: 'AC1', statement: 'balance never below 0.00', check: { type: 'test_passes', args: ['test_BANK9_balance'] } }];
const acRecord = (acs, seq, by = 'lead-1') => ({ acHash: acHash(acs), by, at: '2026-11-19T00:00:00Z', auditSeq: seq });
const acEvent = (acs, by = 'lead-1') => ({ actor: by, event: 'acs.recorded', data: { key: KEY, acHash: acHash(acs) } });
const acCtx = (ticketAcs, approvals, events = []) => ({ ticket: { key: KEY, acceptanceCriteria: ticketAcs }, approvals, approvalEvents: eventsMap(events) });

test('ACs with no audited record: advisory, shown as not checked', () => {
  const r = acsRecorded(acCtx(ACS, undefined));
  assert.equal(r.advisory, true);
  assert.match(r.reason, /no audited record/);
});

test('ACs that match the last audited record pass', () => {
  const r = acsRecorded(acCtx(ACS, { acs: acRecord(ACS, 0) }, chain([acEvent(ACS)])));
  assert.equal(r.status, 'pass', r.reason);
  assert.ok(!r.advisory);
});

test('ACs changed after the last audited record give unknown', () => {
  const changed = [{ ...ACS[0], statement: 'balance may go below 0.00' }];
  const r = acsRecorded(acCtx(changed, { acs: acRecord(ACS, 0) }, chain([acEvent(ACS)])));
  assert.equal(r.status, 'unknown');
  assert.match(r.reason, /changed after the last audited record/);
  const removed = acsRecorded(acCtx([], { acs: acRecord(ACS, 0) }, chain([acEvent(ACS)])));
  assert.equal(removed.status, 'unknown');
});

test('an AC record with no matching audit event gives unknown', () => {
  assert.equal(acsRecorded(acCtx(ACS, { acs: acRecord(ACS, 0) }, [])).status, 'unknown');
  assert.equal(acsRecorded(acCtx(ACS, { acs: acRecord(ACS, 0) }, chain([acEvent([])]))).status, 'unknown');
});

test('the AC hash does not depend on key order', () => {
  assert.equal(acHash([{ statement: 'x', acId: 'AC1' }]), acHash([{ acId: 'AC1', statement: 'x' }]));
});

test('verify: an acs claim is supported with the audited ACs, and cannot_verify after they change', () => {
  const acs = [{ acId: 'AC1', statement: 'every sub-task is done', check: { type: 'subtasks_done', args: [] } }];
  const ctxFor = (current) => ({ ...acCtx(current, { acs: acRecord(acs, 0) }, chain([acEvent(acs)])), ticket: { key: KEY, acceptanceCriteria: current, subtasks: [] } });
  assert.equal(verify({ id: 'c', type: 'acs' }, ctxFor(acs)).result, 'supported');
  const v = verify({ id: 'c', type: 'acs' }, ctxFor([{ ...acs[0], statement: 'most sub-tasks are done' }]));
  assert.equal(v.result, 'cannot_verify');
  assert.ok(v.checks.some((c) => c.name === 'acs_recorded' && c.status === 'unknown'));
});

// The store: only the app writes it (Forge KVS); the panel actions append after the audit event.
test('the store keeps approvals per work item and the latest AC record', async () => {
  const store = memStore();
  await recordApproval(store, KEY, 'removal', removalApproval('lead-1', 3));
  await recordApproval(store, KEY, 'change', changeApproval('lead-1', 4));
  await recordAcs(store, KEY, acRecord(ACS, 5));
  await recordAcs(store, KEY, acRecord([], 6));
  const a = await readApprovals(KEY, store);
  assert.deepEqual(a.removals.map((x) => x.auditSeq), [3]);
  assert.deepEqual(a.changes.map((x) => x.auditSeq), [4]);
  assert.equal(a.acs.auditSeq, 6);
  assert.deepEqual(await readApprovals('BANK-1', store), { removals: [], changes: [], acs: null });
  await assert.rejects(recordApproval(store, KEY, 'other', removalApproval('lead-1', 7)));
});
