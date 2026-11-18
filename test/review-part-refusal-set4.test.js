// Rule (i) of 17 Nov, extended after blind set 4 (benchmark RESULTS-4.md): the guards
// line-not-added and quoted-line fault one finding, so they refuse that finding only. The rest of
// the review stays. A dropped finding is listed with its guard and reason, and it never holds a
// claim. On set 4, U09 and U21 lost a whole review this way.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { REVIEW_GUARD_VERSION, applyReviewGuards, blockingFindings, buildReviewPacket, reviewGate } from '../src/review.js';
import { applyReviewHold } from '../src/review-hold.js';

const s56 = JSON.parse(readFileSync(new URL('../fixtures/S56.json', import.meta.url), 'utf8'));
const packet = buildReviewPacket(s56.steps.find((s) => s.kind === 'review').packet);
const f = (extra) => ({ hunk: 'P61:H1', file: 'src/bank/accounts.py', line: 41, text: 'The lock in P61:H1 covers the balance check and the debit.', ...extra });
const GOOD = f({ severity: 'blocking', ac: 'AC2', text: 'The check covers one thread only, so AC2 for 20 threads has no evidence.' });
const run = (findings) => applyReviewGuards({ findings, risks: [], proposedChecks: [] }, packet);
const HEAD = 'b'.repeat(40);
const hold = (r) => applyReviewHold({ result: 'supported', reason: 'all checks passed' }, { type: 'done' }, [{ ...reviewGate(r, 1).record, headSha: HEAD }], HEAD);

test('the guard version is 7', () => {
  assert.equal(REVIEW_GUARD_VERSION, 7);
});

test('line-not-added drops that finding only; the other blocking finding stays and holds', () => {
  // Line 40 is a context line of P61:H1 (40 to 44).
  const r = run([f({ line: 40, severity: 'blocking', ac: 'AC1', text: 'The test expects 400 where the ticket asks for 409.' }), GOOD]);
  assert.equal(r.outcome, 'review', JSON.stringify(r.reasons));
  assert.deepEqual(r.review.findings.map((x) => x.line), [41]);
  assert.deepEqual(r.droppedFindings.map((d) => [d.guard, d.line]), [['line-not-added', 40]]);
  assert.match(r.droppedFindings[0].reason, /line 40 is not an added line of P61:H1/);
  assert.equal(blockingFindings(r).length, 1);
  assert.equal(hold(r).result, 'cannot_verify');
});

test('quoted-line drops that finding only; the other blocking finding stays and holds', () => {
  const r = run([f({ severity: 'blocking', ac: 'AC1', text: 'if self.balance_cents < amount_cents:' }), GOOD]);
  assert.equal(r.outcome, 'review', JSON.stringify(r.reasons));
  assert.deepEqual(r.droppedFindings.map((d) => d.guard), ['quoted-line']);
  assert.deepEqual(blockingFindings(r).map((x) => x.ac), ['AC2']);
  assert.equal(hold(r).result, 'cannot_verify');
});

test('a review whose only blocking finding is dropped stays a review, and holds nothing', () => {
  for (const bad of [
    f({ line: 40, severity: 'blocking', ac: 'AC1', text: 'The test expects 400 where the ticket asks for 409.' }),
    f({ severity: 'blocking', ac: 'AC1', text: 'if self.balance_cents < amount_cents:' }),
  ]) {
    const r = run([bad, f({})]);
    assert.equal(r.outcome, 'review', JSON.stringify(r.reasons));
    assert.equal(r.droppedFindings.length, 1);
    assert.deepEqual(blockingFindings(r), []);
    assert.equal(hold(r).result, 'supported');
  }
});

test('a dropped finding is not checked again by later guards', () => {
  // The dropped finding names a number that is not in the packet; it must not refuse the review.
  const r = run([f({ line: 40, text: 'The test expects 418 for this case.' }), GOOD]);
  assert.equal(r.outcome, 'review', JSON.stringify(r.reasons));
  assert.equal(r.droppedFindings[0].guard, 'line-not-added');
});

test('guards outside this change still refuse the whole review', () => {
  assert.equal(run([f({ hunk: 'P61:H9' }), GOOD]).guard, 'unknown-hunk');
  assert.equal(run([f({ line: 99 }), GOOD]).guard, 'line-outside-hunk');
  assert.equal(run([f({ text: 'I verify the lock.' }), GOOD]).guard, 'verdict-word');
  assert.equal(run([f({ severity: 'blocking', ac: 'AC9', text: 'No test for this case.' }), GOOD]).guard, 'unknown-ac');
});
