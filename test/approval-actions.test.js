// The panel actions that write approvals and the AC record (finding E1, 19 Nov). Each one checks
// that the person can edit the work item, writes the audit event first, then the app's store, so
// an entry always names a real audit event. The verifier counts the result
// (test/approvals-audited.test.js).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextEvent } from '../src/audit.js';
import { approveTest, recordAcsAction } from '../src/approval-actions.js';
import { acHash, readApprovals } from '../src/approvals.js';
import { pinnedTestsHold, acsRecorded } from '../src/verifier/checks.js';

function deps({ canEdit = true, acs = [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_BANK9_x'] } }] } = {}) {
  const m = new Map();
  const events = [];
  return {
    store: { get: async (k) => structuredClone(m.get(k)), set: async (k, v) => { m.set(k, structuredClone(v)); } },
    canEdit: async () => canEdit,
    readAcs: async () => structuredClone(acs),
    appendAudit: async (e) => { const next = nextEvent(events[events.length - 1] ?? null, { ...e, at: '2026-11-19T00:00:00Z' }); events.push(next); return next; },
    events,
  };
}

test('approve a changed test: audit event first, then the store; the verifier counts it for another claimant', async () => {
  const d = deps();
  const r = await approveTest({ key: 'BANK-9', accountId: 'lead-1', payload: { kind: 'change', test: 'test_transfer_errors', reason: 'AC2 changes the status to 400' } }, d);
  assert.equal(r.ok, true, r.error);
  assert.equal(d.events[0].event, 'test.change_approved');
  const approvals = await readApprovals('BANK-9', d.store);
  assert.equal(approvals.changes[0].auditSeq, d.events[0].seq);
  const ctx = {
    ticket: { key: 'BANK-9' }, claimant: 'dev-1', approvals, approvalEvents: new Map(d.events.map((e) => [e.seq, e])),
    report: { tests: [], pinned: { version: 1, base_sha: 'b'.repeat(40), tests: [{ id: 'tests/test_api.py::test_transfer_errors', base_hash: 'a'.repeat(64), head_id: 'tests/test_api.py::test_transfer_errors', head_hash: 'c'.repeat(64), outcome: 'failed' }] } },
  };
  assert.equal(pinnedTestsHold(ctx).status, 'pass');
});

test('a person who cannot edit the work item cannot approve, and nothing is written', async () => {
  const d = deps({ canEdit: false });
  const r = await approveTest({ key: 'BANK-9', accountId: 'x', payload: { kind: 'removal', test: 'test_a', reason: 'long enough reason' } }, d);
  assert.equal(r.ok, false);
  assert.equal(d.events.length, 0);
  assert.deepEqual(await readApprovals('BANK-9', d.store), { removals: [], changes: [], acs: null });
});

test('a malformed approval is refused before any write', async () => {
  for (const payload of [
    { kind: 'other', test: 'test_a', reason: 'long enough reason' },
    { kind: 'removal', test: '', reason: 'long enough reason' },
    { kind: 'removal', test: 'tests/x.py::test_a', reason: 'long enough reason' },
    { kind: 'removal', test: 'test a; drop', reason: 'long enough reason' },
    { kind: 'removal', test: 'test_a', reason: 'ok' },
    { kind: 'removal', test: 'test_a', reason: 'x'.repeat(501) },
    null,
  ]) {
    const d = deps();
    const r = await approveTest({ key: 'BANK-9', accountId: 'lead-1', payload }, d);
    assert.equal(r.ok, false, JSON.stringify(payload));
    assert.equal(d.events.length, 0);
  }
  const d = deps();
  assert.equal((await approveTest({ key: 'BANK-9', accountId: 'lead-1', payload: { kind: 'removal', test: 'TestApi::test_a', reason: 'long enough reason' } }, d)).ok, true);
});

test('record the ACs: the hash of the ACs the verifier reads, with its audit event', async () => {
  const acs = [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_BANK9_x'] } }];
  const d = deps({ acs });
  const r = await recordAcsAction({ key: 'BANK-9', accountId: 'lead-1' }, d);
  assert.equal(r.ok, true, r.error);
  const approvals = await readApprovals('BANK-9', d.store);
  assert.equal(approvals.acs.acHash, acHash(acs));
  assert.equal(d.events[0].event, 'acs.recorded');
  const ctx = { ticket: { key: 'BANK-9', acceptanceCriteria: acs }, claimant: 'dev-1', approvals, approvalEvents: new Map(d.events.map((e) => [e.seq, e])) };
  assert.equal(acsRecorded(ctx).status, 'pass');
  assert.equal((await recordAcsAction({ key: 'BANK-9', accountId: 'x' }, deps({ canEdit: false }))).ok, false);
});
