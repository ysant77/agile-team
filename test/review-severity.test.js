// Finding severity (prompt code-review/2). Only a blocking finding that names an AC, states a
// defect in the reviewer's own words and cites a changed line can hold a claim (arm D rating rule).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyReviewGuards, blockingFindings, buildReviewPacket, REVIEW_PROMPT_VERSION, reviewGate } from '../src/review.js';

const s56 = JSON.parse(readFileSync(new URL('../fixtures/S56.json', import.meta.url), 'utf8'));
const step = s56.steps.find((s) => s.kind === 'review');
const packet = buildReviewPacket(step.packet);
const finding = (extra) => ({ hunk: 'P61:H1', file: 'src/bank/accounts.py', line: 41, text: 'The lock in P61:H1 covers the balance check and the debit.', ...extra });
const review = (f) => ({ findings: [f], risks: [], proposedChecks: [] });
const guard = (f) => applyReviewGuards(review(f), packet);

test('the prompt version is code-review/2', () => {
  assert.equal(REVIEW_PROMPT_VERSION, 'code-review/2');
});

test('a finding without a severity is a note, and a note never blocks', () => {
  const r = guard(finding({}));
  assert.equal(r.outcome, 'review');
  assert.equal(r.review.findings[0].severity, 'note');
  assert.deepEqual(blockingFindings(r), []);
});

test('a blocking finding with an AC and a defect statement blocks', () => {
  const r = guard(finding({ severity: 'blocking', ac: 'AC2', text: 'The check covers one thread only, so AC2 for 20 threads has no evidence.' }));
  assert.equal(r.outcome, 'review', JSON.stringify(r.reasons));
  assert.equal(blockingFindings(r).length, 1);
});

test('the schema refuses an unknown severity', () => {
  assert.equal(guard(finding({ severity: 'critical' })).guard, 'schema');
});

test('a blocking finding needs an AC of the ticket', () => {
  assert.equal(guard(finding({ severity: 'blocking' })).guard, 'blocking-needs-ac');
  assert.equal(guard(finding({ severity: 'blocking', ac: 'AC9' })).guard, 'unknown-ac');
});

test('a blocking finding that only quotes a changed line is refused', () => {
  const quote = finding({ severity: 'blocking', ac: 'AC1', text: 'if self.balance_cents < amount_cents:' });
  assert.equal(guard(quote).guard, 'quoted-line');
  // The same quote as a note is allowed; it never blocks.
  assert.equal(guard({ ...quote, severity: 'note' }).outcome, 'review');
});

test('a style fallback keeps the severity and the AC of each finding', () => {
  const r = guard(finding({ severity: 'blocking', ac: 'AC2', text: 'The check probably covers one thread only, so AC2 has no evidence.' }));
  const first = reviewGate(r, 0);
  assert.equal(first.action, 'retry');
  const after = reviewGate(r, 1).record;
  assert.equal(after.review.findings[0].severity, 'blocking');
  assert.equal(after.review.findings[0].ac, 'AC2');
  assert.equal(blockingFindings(after).length, 1);
});

test('a refused review has no blocking finding', () => {
  const r = guard(finding({ severity: 'blocking', ac: 'AC2', hunk: 'P61:H9', text: 'The check covers one thread only, so AC2 has no evidence.' }));
  assert.equal(r.outcome, 'invalid_review');
  assert.deepEqual(blockingFindings(r), []);
});
