// Reviewer guard rules after the arm D regression of 17 Nov (benchmark
// REGRESSION-ARM-D-2026-11-17.md). The fixtures are the real packets and model reviews of arm D
// cases T08 and B21 (reviewer a3b8982, seed 1; packet hashes match the runs).
// (i) A guard that faults one part of a review refuses that part only.
// (ii) The advice uses the model's own guard-accepted finding text; the style fallback changes
//      only what people see in the review. Since 20 Nov a review is advice only (no hold).
// (iii) A finding whose model text has no defect statement (only a hunk or line reference) is
//      refused as a finding; the review stays.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyReviewGuards, blockingFindings, buildReviewPacket, reviewGate } from '../src/review.js';
import { withAdvice } from '../src/review-advice.js';

const load = (id) => JSON.parse(readFileSync(new URL(`../fixtures/review-${id}.json`, import.meta.url), 'utf8'));
const T08 = load('T08');
const B21 = load('B21');
const packetOf = (fx) => buildReviewPacket(fx.packetInput);
const supported = { result: 'supported', reason: 'all checks passed' };
const HEAD = 'a'.repeat(40);
const hold = (record) => withAdvice(supported, [{ ...record, headSha: HEAD }], HEAD);

test('T08: a proposed check for an AC with a code check is dropped; the review and its blocking finding stay', () => {
  const r = applyReviewGuards(T08.modelReviews[0], packetOf(T08));
  assert.equal(r.outcome, 'review', JSON.stringify(r.reasons));
  assert.deepEqual(r.review.proposedChecks, []);
  assert.equal(r.droppedChecks.length, 1);
  assert.equal(r.droppedChecks[0].guard, 'ac-has-check');
  assert.equal(r.droppedChecks[0].ac, 'AC1');
  const texts = blockingFindings(r).map((f) => f.text);
  assert.ok(texts.includes('Code does not handle kind=debit case for filtering lines.'), JSON.stringify(texts));
});

test('T08: the claim stays supported, and the advice shown to people has the model\'s defect statement', () => {
  const r = applyReviewGuards(T08.modelReviews[0], packetOf(T08));
  const v = hold(reviewGate(r, 1).record);
  assert.equal(v.result, 'supported');
  assert.equal(v.reason, supported.reason);
  assert.ok(v.advice.some((a) => /does not handle kind=debit/.test(a.text)), JSON.stringify(v.advice));
});

test('B21: the same rule keeps the reviewer\'s real blocking finding (the reviewer\'s true behaviour)', () => {
  const r = applyReviewGuards(B21.modelReviews[0], packetOf(B21));
  assert.equal(r.outcome, 'review', JSON.stringify(r.reasons));
  assert.deepEqual(r.review.proposedChecks, []);
  assert.ok(blockingFindings(r).some((f) => /does not reject underscores or spaces/.test(f.text)));
});

test('after a style fallback the advice uses the guard-accepted model text; people see the template in the review only', () => {
  // B21's second review passes the guards; its risk texts fail the style lint, so with the retry
  // used the gate falls back to the template.
  const accepted = reviewGate(applyReviewGuards(B21.modelReviews[1], packetOf(B21)), 1).record;
  assert.equal(accepted.style, 'fallback');
  assert.match(accepted.review.findings[0].text, /^Finding 1: see P\d+:H\d+, line \d+\.$/);
  const texts = blockingFindings(accepted).map((f) => f.text);
  assert.ok(texts.includes('Code does not reject underscores or spaces in amount strings.'), JSON.stringify(texts));
  const v = hold(accepted);
  assert.equal(v.result, 'supported');
  assert.ok(v.advice.some((a) => /does not reject underscores or spaces in amount strings/.test(a.text)));
  assert.ok(v.advice.every((a) => !/Finding 1: see/.test(a.text)));
});

test('a finding whose model text is only a hunk or line reference is refused as a finding; the review stays', () => {
  const raw = structuredClone(B21.modelReviews[1]);
  raw.findings[0].text = 'Finding 1: see P121:H3, line 62.';
  const r = applyReviewGuards(raw, packetOf(B21));
  assert.equal(r.outcome, 'review', JSON.stringify(r.reasons));
  assert.equal(r.review.findings.length, 1);
  assert.equal(r.droppedFindings.length, 1);
  assert.equal(r.droppedFindings[0].guard, 'no-defect-statement');
  assert.ok(blockingFindings(r).every((f) => !/^Finding 1: see/.test(f.text)));
  for (const text of ['see P121:H3', 'P121:H3, line 62', 'Line 62.', 'src/bank/money.py:62']) {
    const one = structuredClone(B21.modelReviews[1]);
    one.findings = [{ ...one.findings[0], text }];
    const g = applyReviewGuards(one, packetOf(B21));
    assert.equal(g.outcome, 'review', text);
    assert.deepEqual(blockingFindings(g), [], text);
  }
});

test('a stored review with template text only (no model text kept) gives no advice', () => {
  const stored = { outcome: 'review', style: 'fallback', review: { findings: [{ hunk: 'P121:H3', file: 'src/bank/money.py', line: 62, severity: 'blocking', ac: 'AC1', text: 'Finding 1: see P121:H3, line 62.' }], risks: [], proposedChecks: [] } };
  assert.deepEqual(blockingFindings(stored), []);
  assert.equal(hold(stored).result, 'supported');
  assert.deepEqual(hold(stored).advice, []);
});
