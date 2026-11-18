// Protected regression set (docs/PROTECTED-TESTS.md): every base test is pinned by the hash of its
// body, and its base copy runs against the head code. A change cannot pass by editing, weakening,
// deselecting or deleting a pinned test. A rename with the same body is not a removal. A changed
// pin needs a recorded approval. Without the bank's pinned block the check is advisory.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pinnedTestsHold, testsNotRemoved } from '../src/verifier/checks.js';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { decide } from '../src/verify-claim.js';
import { verdictView } from '../src/verdict-view.js';
import { fetchFrom } from './helpers/recorded-github.js';

const H = (c) => c.repeat(64);
const pin = (name, extra = {}) => ({
  id: `tests/test_api.py::${name}`, base_hash: H('a'), head_id: `tests/test_api.py::${name}`, head_hash: H('a'), outcome: 'passed', ...extra,
});
const block = (tests) => ({ version: 1, base_sha: 'b'.repeat(40), tests });
const ctxOf = (tests, ticket = {}) => ({
  ticket: { key: 'BANK-9', approvedTestRemovals: [], ...ticket },
  report: { tests: [{ id: 'tests/test_api.py::test_x', outcome: 'passed' }], pinned: tests === undefined ? undefined : block(tests) },
});

test('pinned and unchanged, base copy passes on head: pass', () => {
  const r = pinnedTestsHold(ctxOf([pin('test_transfer_errors')]));
  assert.equal(r.name, 'pinned_tests_hold');
  assert.equal(r.status, 'pass', r.reason);
  assert.ok(!r.advisory);
});

test('a weakened or edited old assertion: the base copy fails on head, contradicted with the test named', () => {
  const r = pinnedTestsHold(ctxOf([pin('test_transfer_errors', { head_hash: H('c'), outcome: 'failed' })]));
  assert.equal(r.status, 'fail');
  assert.match(r.reason, /test_transfer_errors/);
  assert.match(r.reason, /base copy fails on the head code/);
});

test('an unchanged pinned test whose base copy fails on head (behaviour broken): fail', () => {
  const r = pinnedTestsHold(ctxOf([pin('test_account_numbers_are_obviously_fake', { outcome: 'error' })]));
  assert.equal(r.status, 'fail');
});

test('an edited pinned test whose base copy still passes: unknown until a person approves the new pin', () => {
  const r = pinnedTestsHold(ctxOf([pin('test_transfer_errors', { head_hash: H('c') })]));
  assert.equal(r.status, 'unknown');
  assert.match(r.reason, /changed; a person approves the new pin/);
});

test('a deleted pinned test: fail, unless its removal is approved', () => {
  const deleted = pin('test_statement_rejects_bad_dates', { head_id: null, head_hash: null, outcome: 'not_run' });
  assert.equal(pinnedTestsHold(ctxOf([deleted])).status, 'fail');
  assert.match(pinnedTestsHold(ctxOf([deleted])).reason, /deleted/);
  const ok = pinnedTestsHold(ctxOf([deleted], { approvedTestRemovals: ['test_statement_rejects_bad_dates'] }));
  assert.equal(ok.status, 'pass', ok.reason);
});

test('a deselected or skipped pinned test (base copy not run on head): fail', () => {
  const r = pinnedTestsHold(ctxOf([pin('test_a_huge_session_cookie_is_401', { outcome: 'not_run' })]));
  assert.equal(r.status, 'fail');
  assert.match(r.reason, /did not run on the head code/);
});

test('a rename with the same body is not a removal, in this check and in tests_not_removed', () => {
  const renamed = pin('test_statement_rejects_bad_dates', { head_id: 'tests/test_api.py::test_statement_window_rejects_bad_dates' });
  const ctx = ctxOf([renamed]);
  assert.equal(pinnedTestsHold(ctx).status, 'pass', pinnedTestsHold(ctx).reason);
  ctx.baseReport = { tests: [{ id: 'tests/test_api.py::test_statement_rejects_bad_dates', outcome: 'passed' }] };
  ctx.report.tests = [{ id: 'tests/test_api.py::test_statement_window_rejects_bad_dates', outcome: 'passed' }];
  const removed = testsNotRemoved(ctx);
  assert.equal(removed.status, 'pass', removed.reason);
});

test('a rename to another body is not accepted as a rename', () => {
  const ctx = ctxOf([pin('test_statement_rejects_bad_dates', { head_id: 'tests/test_api.py::test_other', head_hash: H('d') })]);
  ctx.baseReport = { tests: [{ id: 'tests/test_api.py::test_statement_rejects_bad_dates', outcome: 'passed' }] };
  ctx.report.tests = [{ id: 'tests/test_api.py::test_other', outcome: 'passed' }];
  assert.equal(testsNotRemoved(ctx).status, 'fail');
});

test('a new pin needs a recorded approval with a reason', () => {
  const edited = pin('test_transfer_errors', { head_hash: H('c'), outcome: 'failed' });
  const approval = { test: 'test_transfer_errors', reason: 'AC2 changes the status to 400', auditSeq: 12 };
  assert.equal(pinnedTestsHold(ctxOf([edited], { approvedTestChanges: [approval] })).status, 'pass');
  // No reason, a short reason or no audit entry: not an approval.
  for (const bad of [{ test: 'test_transfer_errors', auditSeq: 12 }, { ...approval, reason: 'ok' }, { ...approval, auditSeq: undefined }]) {
    assert.equal(pinnedTestsHold(ctxOf([edited], { approvedTestChanges: [bad] })).status, 'fail', JSON.stringify(bad));
  }
  // A malformed list cannot show an approval.
  assert.equal(pinnedTestsHold(ctxOf([edited], { approvedTestChanges: 'all' })).status, 'unknown');
});

test('no pinned block: advisory, not counted, and says the check did not run', () => {
  const r = pinnedTestsHold(ctxOf(undefined));
  assert.equal(r.advisory, true);
  assert.match(r.reason, /not run/);
});

test('a malformed pinned block gives unknown', () => {
  for (const pinned of [null, 'x', { version: 1 }, { version: 2, tests: [] }, block([{ id: 'x' }]), block([pin('t', { outcome: 'maybe' })]), block([pin('t', { base_hash: 'short' })])]) {
    const ctx = ctxOf([]);
    ctx.report.pinned = pinned;
    assert.equal(pinnedTestsHold(ctx).status, 'unknown', JSON.stringify(pinned));
  }
  assert.equal(pinnedTestsHold(ctxOf([])).status, 'unknown', 'an empty pinned set cannot show protection');
});

// The real U01 evidence (fixtures/judge): supported today; with a failing pinned base copy, the
// whole claim is contradicted. Without a block it stays supported, and the view says "not checked".
async function verdictWith(pinned) {
  const c = JSON.parse(readFileSync(new URL('../fixtures/judge/U01.json', import.meta.url), 'utf8'));
  if (pinned !== undefined) c.github.report.pinned = pinned;
  const log = console.log;
  console.log = () => {};
  try {
    return await decide({ issueKey: c.ticket.key, claim: { id: 'p', type: c.claim } }, {
      collectJira: async () => ({ subtasks: [], links: [], ...structuredClone(c.ticket) }),
      env: () => ({ repo: 'ysant77/yms-bank-demo', token: 'local' }),
      collectGithub, collectPrStats, fetchFn: fetchFrom(c.github), collectReviews: async () => [],
    });
  } finally {
    console.log = log;
  }
}

test('U01 evidence: no pinned block keeps "supported", and the view lists the check as not checked', async () => {
  const { record } = await verdictWith(undefined);
  assert.equal(record.result, 'supported');
  const v = verdictView(record);
  assert.ok(v.notChecked.some((t) => t.startsWith('pinned_tests_hold: not run')), JSON.stringify(v.notChecked));
  assert.ok(!v.proved.some((t) => t.startsWith('pinned_tests_hold')));
});

test('U01 evidence: a pinned base copy that fails on head contradicts the done claim', async () => {
  const { record } = await verdictWith(block([pin('test_transfer_errors', { head_hash: H('c'), outcome: 'failed' })]));
  assert.equal(record.result, 'contradicted');
  assert.match(record.reason, /test_transfer_errors/);
});

test('U01 evidence: every pinned base copy passes on head, still supported, and the check is proved', async () => {
  const { record } = await verdictWith(block([pin('test_transfer_errors'), pin('test_a_replay_returns_the_original')]));
  assert.equal(record.result, 'supported');
  assert.ok(verdictView(record).proved.some((t) => t.startsWith('pinned_tests_hold')));
});
