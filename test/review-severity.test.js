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
// Guard version 7: quoted-line refuses the finding only; the review stays (rule i).
const dropped = (r) => (r.outcome === 'review' ? r.droppedFindings.map((d) => d.guard).join() : `whole review: ${r.guard}`);

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

test('a blocking finding that only quotes a changed line is refused as a finding', () => {
  const quote = finding({ severity: 'blocking', ac: 'AC1', text: 'if self.balance_cents < amount_cents:' });
  assert.equal(dropped(guard(quote)), 'quoted-line');
  assert.deepEqual(blockingFindings(guard(quote)), []);
  // The same quote as a note is allowed; it never blocks.
  assert.equal(guard({ ...quote, severity: 'note' }).outcome, 'review');
});

test('a blocking finding that is mostly a copied line plus a label is refused as a finding', () => {
  const copied = [
    'Bad: if self.balance_cents < amount_cents:',
    'P61:H1 AC1: self.balance_cents -= amount_cents',
    'Wrong: with self._lock: if self.balance_cents < amount_cents: raise InsufficientFunds(self.id)',
  ];
  for (const text of copied) {
    assert.equal(dropped(guard(finding({ severity: 'blocking', ac: 'AC1', text }))), 'quoted-line', text);
  }
  // A short identifier inside the reviewer's own sentence is not a copied line.
  const own = finding({ severity: 'blocking', ac: 'AC2', text: 'The lock guards self.balance_cents, but no test runs 20 threads, so AC2 has no evidence.' });
  assert.equal(guard(own).outcome, 'review', JSON.stringify(guard(own).reasons));
});

test('a blocking quote in other letter case or with extra spaces is refused as a finding', () => {
  const quotes = [
    'IF SELF.BALANCE_CENTS < AMOUNT_CENTS:',
    'BAD: IF SELF.BALANCE_CENTS < AMOUNT_CENTS:',
    'acct . withdraw ( 300 )',
    'assert acct . balance_cents == 700',
  ];
  for (const text of quotes) {
    assert.equal(dropped(guard(finding({ severity: 'blocking', ac: 'AC1', text }))), 'quoted-line', text);
  }
});

// Known limit (docs/claims.md, "When a review holds a claim"): a blocking finding with no
// defect statement and no copied code, such as "Bad.", passes the guard. It can only hold a
// supported claim for a person to check; it can never pass a claim.
test('known limit: a bare "Bad." passes the quoted-line guard as a blocking finding', () => {
  const r = guard(finding({ severity: 'blocking', ac: 'AC1', text: 'Bad.' }));
  assert.equal(r.outcome, 'review', JSON.stringify(r.reasons));
  assert.equal(blockingFindings(r).length, 1);
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

test('the agent view gives the exact test-name prefix that the name guard needs', async () => {
  const { packetForAgent } = await import('../src/review-actions.js');
  const view = packetForAgent(packet, { suggest: false });
  assert.equal(view.testNamePrefix, 'test_BANK4_');
});
