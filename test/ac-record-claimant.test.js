// The AC record must come from a person other than the claimant of the claim under check (lead
// review of PR 28): a claimant who records the ACs could record ACs that fit the change.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextEvent } from '../src/audit.js';
import { acHash } from '../src/approvals.js';
import { acsRecorded } from '../src/verifier/checks.js';

const KEY = 'BANK-9';
const ACS = [{ acId: 'AC1', statement: 'balance never below 0.00', check: { type: 'test_passes', args: ['test_BANK9_balance'] } }];
const ctxOf = ({ by = 'lead-1', claimant = 'dev-1', record = true } = {}) => {
  const event = nextEvent(null, { actor: by, event: 'acs.recorded', data: { key: KEY, acHash: acHash(ACS) }, at: '2026-11-19T00:00:00Z' });
  return {
    ticket: { key: KEY, acceptanceCriteria: ACS },
    claimant,
    approvals: record ? { removals: [], changes: [], acs: { acHash: acHash(ACS), by, at: '2026-11-19T00:00:00Z', auditSeq: 0 } } : undefined,
    approvalEvents: new Map([[0, event]]),
  };
};

test('ACs recorded by another person pass', () => {
  assert.equal(acsRecorded(ctxOf()).status, 'pass');
});

test('ACs recorded by the claimant give unknown', () => {
  const r = acsRecorded(ctxOf({ by: 'dev-1' }));
  assert.equal(r.status, 'unknown');
  assert.ok(!r.advisory);
  assert.match(r.reason, /the claimant recorded the ACs; another person records them/);
});

test('a record with an unknown claimant gives unknown', () => {
  for (const claimant of [null, undefined, '']) {
    assert.equal(acsRecorded(ctxOf({ claimant })).status, 'unknown', String(claimant));
  }
});

test('no record and an unknown claimant stay advisory', () => {
  const r = acsRecorded(ctxOf({ record: false, claimant: null }));
  assert.equal(r.advisory, true);
});
