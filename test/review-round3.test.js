// Independent review of the Code Reviewer guards (17 Nov), items 1 to 5. Each test failed before its fix.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import api from '@forge/api';
import { kvs } from '@forge/kvs';
import { adoptFromReviews, adoptProposal, applyReviewGuards, buildReviewPacket } from '../src/review.js';
import { recordReview } from '../src/review-actions.js';

const s56 = JSON.parse(readFileSync(new URL('../fixtures/S56.json', import.meta.url), 'utf8'));
const reviewStep = s56.steps.find((s) => s.kind === 'review');
const packet = buildReviewPacket(reviewStep.packet);
const good = reviewStep.review;
const withReview = (change) => change(structuredClone(good));
const guardOf = (raw) => applyReviewGuards(raw, packet);

test('item 1: a decimal number of 7 or more digits is a number, not a commit sha', () => {
  const r = guardOf(withReview((v) => { v.risks = ['The bug loses 1000000 dollars for 98765432 users.']; return v; }));
  assert.equal(r.guard, 'ungrounded-number');
  assert.match(r.reasons[0], /1000000/);
  // A sha with letters is still an id.
  assert.equal(guardOf(withReview((v) => { v.risks = ['The head 4c1e9a07 has no test for AC2.']; return v; })).outcome, 'review');
});

test('item 2: a proposal for an AC that has a code check makes the review invalid', () => {
  const r = guardOf(withReview((v) => { v.proposedChecks[0].ac = 'AC1'; return v; }));
  assert.equal(r.outcome, 'invalid_review');
  assert.equal(r.guard, 'ac-has-check');
});

test('item 2: adoption never replaces a code check', () => {
  const ticket = s56.steps[0].context.ticket;
  assert.throws(() => adoptProposal(ticket, { ac: 'AC1', testName: 'test_BANK4_other_check' }), /code check/);
  // An AC with no check can take a proposal.
  const open = { ...ticket, acceptanceCriteria: [{ acId: 'AC3', statement: 'x' }] };
  assert.equal(adoptProposal(open, { ac: 'AC3', testName: 'test_BANK4_x' }).acceptanceCriteria[0].check.type, 'test_passes');
  // A guarded record that names AC1 (written before this guard) still cannot be adopted.
  const spec = { key: 'BANK-4', acceptanceCriteria: ticket.acceptanceCriteria };
  const record = { ...applyReviewGuards(good, packet), prNumber: 61 };
  record.review.proposedChecks[0] = { ...record.review.proposedChecks[0], ac: 'AC1' };
  const out = adoptFromReviews(spec, [record], { prNumber: 61, testName: 'test_BANK4_concurrent_withdrawals_20_threads', reason: 'adopt for AC1' });
  assert.equal(out.ok, false);
});

test('item 3: "verify", "criteria are met" and "merge now" are verdict words', () => {
  for (const text of ['I verify the lock.', 'All criteria are met.', 'Merge now.']) {
    assert.equal(guardOf(withReview((v) => { v.findings[0].text = text; return v; })).guard, 'verdict-word', text);
  }
  // Words that only contain them stay allowed.
  for (const text of ['The verifier maps the test to AC2.', 'AC2 is unverifiable without a test.']) {
    assert.equal(guardOf(withReview((v) => { v.findings[0].text = text; return v; })).outcome, 'review', text);
  }
});

test('item 4: a finding line must be an added line of its hunk', () => {
  // Line 40 is a context line of P61:H1 (40 to 44).
  const r = guardOf(withReview((v) => { v.findings[0].line = 40; return v; }));
  assert.equal(r.outcome, 'invalid_review');
  assert.equal(r.guard, 'line-not-added');
  assert.equal(guardOf(withReview((v) => { v.findings[0].line = 44; return v; })).outcome, 'review');
});

test('item 4: "line N" in a finding must be an added line of that finding\'s hunk', () => {
  // Line 5 is in P61:H2, not in P61:H1.
  assert.equal(guardOf(withReview((v) => { v.findings[0].text = 'Line 5 debits the account.'; return v; })).guard, 'ungrounded-number');
  // Line 40 is a context line of P61:H1.
  assert.equal(guardOf(withReview((v) => { v.findings[0].text = 'Line 40 opens the method.'; return v; })).guard, 'ungrounded-number');
  assert.equal(guardOf(withReview((v) => { v.findings[0].text = 'Line 42 checks the balance.'; return v; })).outcome, 'review');
});

test('item 4: "line N" in a risk must be an added line of some hunk', () => {
  assert.equal(guardOf(withReview((v) => { v.risks = ['Line 40 has no lock.']; return v; })).guard, 'ungrounded-number');
  assert.equal(guardOf(withReview((v) => { v.risks = ['Line 5 has no concurrency test.']; return v; })).outcome, 'review');
});

test('item 5: a failed save of the review property is an error, and no comment is posted', async (t) => {
  const store = new Map();
  t.mock.method(kvs, 'get', async (k) => structuredClone(store.get(k)));
  t.mock.method(kvs, 'set', async (k, v) => { store.set(k, structuredClone(v)); });
  const calls = [];
  // route`...` returns an object that holds the path in value_.
  const pathOf = (r) => r?.value_ ?? String(r);
  t.mock.method(api, 'asApp', () => ({
    requestJira: async (path, opts) => {
      calls.push({ path: pathOf(path), method: opts?.method ?? 'GET' });
      if (pathOf(path).includes('aat.reviews')) {
        return { ok: false, status: opts?.method === 'PUT' ? 500 : 404, json: async () => ({}) };
      }
      return { ok: true, status: 201, json: async () => ({}) };
    },
  }));
  store.set('review:BANK-4:61', { packet, retries: 0 });
  const out = await recordReview({ issueKey: 'BANK-4', prNumber: 61, review: good });
  assert.equal(out.ok, false);
  assert.match(out.error, /review/);
  assert.ok(calls.some((c) => c.method === 'PUT' && c.path.endsWith('/aat.reviews')), 'the save was tried');
  assert.ok(!calls.some((c) => c.path.endsWith('/comment')), 'no comment after a failed save');
});

test('adoption is refused when the ticket has two ACs with the same id', () => {
  const ticket = {
    key: 'BANK-4',
    acceptanceCriteria: [
      { acId: 'AC3', statement: 'first', check: { type: 'manual' } },
      { acId: 'AC3', statement: 'second', check: { type: 'manual' } },
    ],
  };
  assert.throws(() => adoptProposal(ticket, { ac: 'AC3', testName: 'test_BANK4_x' }), /not unique/);
  const spec = { key: 'BANK-4', acceptanceCriteria: ticket.acceptanceCriteria };
  const record = { ...applyReviewGuards(good, packet), prNumber: 61 };
  const name = record.review.proposedChecks[0].testName;
  record.review.proposedChecks[0] = { ...record.review.proposedChecks[0], ac: 'AC3' };
  const out = adoptFromReviews(spec, [record], { prNumber: 61, testName: name, reason: 'adopt for AC3' });
  assert.equal(out.ok, false);
  assert.match(out.error, /not unique/);
});
