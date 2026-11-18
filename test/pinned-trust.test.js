// Trust of the protected regression set (lead review of PR 22). Whether a repository runs the
// pinned step comes from the app's own configuration, never from the head report, so a change
// cannot drop the pinned block to switch the check off. The script that writes the block is a
// report trust path: a pull request that changes it gets no trust in its report.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pinnedTestsHold, pipelineChange } from '../src/verifier/checks.js';
import { VERIFY_CONFIG } from '../src/verify-claim.js';

const ctxOf = (report, config = {}) => ({ ticket: { key: 'BANK-9' }, report: { tests: [], ...report }, config });

test('pinned not required: a missing block is advisory (the bank step is not deployed)', () => {
  const r = pinnedTestsHold(ctxOf({}, { pinnedRequired: false }));
  assert.equal(r.advisory, true);
});

test('pinned required by the app configuration: a missing block gives unknown, not a pass', () => {
  const r = pinnedTestsHold(ctxOf({}, { pinnedRequired: true }));
  assert.equal(r.status, 'unknown');
  assert.ok(!r.advisory);
  assert.match(r.reason, /no pinned block/);
});

test('the head report cannot turn the requirement off', () => {
  for (const field of [{ pinned: null }, { pinned_step: false }, { pinnedRequired: false }, { config: { pinnedRequired: false } }]) {
    const r = pinnedTestsHold(ctxOf(field, { pinnedRequired: true }));
    assert.equal(r.status, 'unknown', JSON.stringify(field));
    assert.ok(!r.advisory, JSON.stringify(field));
  }
});

test('a requirement setting that is not true or false is read as required', () => {
  for (const v of ['yes', 1, null]) {
    const r = pinnedTestsHold(ctxOf({}, { pinnedRequired: v }));
    assert.equal(r.status, 'unknown', String(v));
  }
});

test('the app configuration names the setting, and the script that writes the block is a trust path', () => {
  assert.equal(typeof VERIFY_CONFIG.pinnedRequired, 'boolean');
  assert.ok(VERIFY_CONFIG.reportTrustPaths.includes('scripts/pinned.py'));
  const reason = pipelineChange({ prFiles: ['src/bank/api.py', 'scripts/pinned.py'], config: VERIFY_CONFIG });
  assert.match(reason, /scripts\/pinned\.py/);
});
