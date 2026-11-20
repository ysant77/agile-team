// Verdict view: the three states, the set 4 lesson on every verdict, the stored check detail, the
// model's advice (shown, not counted; owner decision 20 Nov) and the monitor permission path.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextEvent } from '../src/audit.js';
import { stripChecks } from '../src/jira-evidence.js';
import { monitorForViewer } from '../src/monitor.js';
import { withAdvice } from '../src/review-advice.js';
import {
  NOT_CHECKED_COVERAGE, SUPPORTED_MEANS, compactChecks, latestView, verdictState, verdictView,
} from '../src/verdict-view.js';

const HEAD = '9d37307aa1b2c3d4e5f60718293a4b5c6d7e8f90';
const acCheck = (status, reason) => ({
  name: 'ac_tests', status, reason: 'per AC',
  parts: [{ acId: 'AC1', name: 'test_statement_filter_debit', status, reason }],
});
const base = (result, reason, checks, extra = {}) => ({
  claimId: 'c1', type: 'done', result, reason, checker: 'v6', at: '2026-11-18T10:00:00.000Z', headSha: HEAD, checks, ...extra,
});

test('supported: the proof is listed, and "not checked" still names test completeness', () => {
  const v = verdictView(base('supported', 'all checks passed', [
    acCheck('pass', 'fails on base by an assertion, passes on head'),
    { name: 'ci_green', status: 'pass', reason: 'pinned workflow passed on the head' },
  ]));
  assert.equal(v.state, 'supported');
  assert.equal(v.label, 'Supported');
  assert.deepEqual(v.proved, [
    'AC1 test_statement_filter_debit: fails on base by an assertion, passes on head',
    'ci_green: pinned workflow passed on the head',
  ]);
  assert.deepEqual(v.failed, []);
  assert.ok(v.notChecked.includes(NOT_CHECKED_COVERAGE));
  assert.equal(v.meaning, SUPPORTED_MEANS);
  assert.match(v.meaning, /fails before the change and passes after it/);
  assert.match(v.human, /A person decides/);
  assert.equal(v.meta.head, '9d37307');
  assert.equal(v.meta.decidedBy, 'code');
});

test('contradicted: the failed check is shown under "what failed", not as proved', () => {
  const v = verdictView(base('contradicted', 'test_statement_filter_debit passes on base, so it does not reproduce the problem', [
    acCheck('fail', 'passes on base, so it does not reproduce the problem'),
  ]));
  assert.equal(v.state, 'contradicted');
  assert.equal(v.label, 'Contradicted');
  assert.deepEqual(v.proved, []);
  assert.deepEqual(v.failed, ['AC1 test_statement_filter_debit: passes on base, so it does not reproduce the problem']);
  assert.match(v.why, /does not reproduce/);
  assert.match(v.human, /Fix the change or the test/);
});

test('cannot_verify: an unknown check is listed as not checked, with its reason', () => {
  const v = verdictView(base('cannot_verify', 'the CI report is for an older commit', [
    { name: 'ci_green', status: 'unknown', reason: 'the report is for 4be1c02, not the head' },
    acCheck('pass', 'fails on base, passes on 4be1c02'),
  ]));
  assert.equal(v.state, 'cannot_verify');
  assert.equal(v.label, 'Cannot verify');
  assert.deepEqual(v.notChecked, ['ci_green: the report is for 4be1c02, not the head', NOT_CHECKED_COVERAGE]);
  assert.match(v.human, /missing evidence/);
});

test('advice from a model: shown with its hunk and quoted line, marked not counted; the state is the code verdict', () => {
  const supported = { claimId: 'c1', result: 'supported', reason: 'all checks passed', checks: [acCheck('pass', 'fails on base, passes on head')], checkerVersion: 'v6' };
  const reviews = [{ outcome: 'review', headSha: HEAD, review: { findings: [
    { hunk: 'P118:H2', file: 'src/bank/statement.py', line: 41, quote: "if kind == 'credit':", severity: 'blocking', ac: 'AC1', text: 'Filters lines for kind=credit but not for kind=debit.' },
  ] } }];
  const out = withAdvice(supported, reviews, HEAD);
  const record = base(out.result, out.reason, compactChecks(out.checks), { advice: out.advice });
  assert.equal(verdictState(record), 'supported');
  const v = verdictView(record);
  assert.equal(v.label, 'Supported');
  assert.equal(v.why, 'all checks passed');
  assert.deepEqual(v.advice, {
    heading: 'Advice from a model, not counted',
    note: 'A model wrote this. Code did not check it, and it does not change the verdict. A person may read it.',
    lines: ["Blocking (AC1) P118:H2 src/bank/statement.py:41 \"if kind == 'credit':\": Filters lines for kind=credit but not for kind=debit."],
  });
  assert.deepEqual(v.proved, verdictView(base('supported', 'all checks passed', compactChecks(supported.checks))).proved);
});

test('no "held" state: an old record with a review hold shows as cannot_verify and says why', () => {
  const old = base('cannot_verify', 'AC1: a person must check the reviewer\'s blocking finding', [], { reviewHold: ['AC1'] });
  assert.equal(verdictState(old), 'cannot_verify');
  const v = verdictView(old);
  assert.equal(v.label, 'Cannot verify');
  assert.ok(v.notChecked.some((t) => /older checker let a model review hold this claim/.test(t)), JSON.stringify(v.notChecked));
  assert.equal(verdictState(base('supported', 'x', [], { reviewHold: ['AC1'] })), 'supported');
  assert.equal(verdictView(base('supported', 'x', [])).advice, null);
});

test('an old record without checks says that the detail is missing', () => {
  const { checks: _, ...old } = base('supported', 'all checks passed', []);
  const v = verdictView(old);
  assert.deepEqual(v.proved, []);
  assert.match(v.notChecked[0], /Per-check detail is not stored/);
  assert.equal(v.notChecked.at(-1), NOT_CHECKED_COVERAGE);
});

test('bad input gives no view and never throws', () => {
  for (const bad of [null, undefined, 'x', 1, {}, { result: 'merge' }]) assert.equal(verdictView(bad), null);
  assert.equal(latestView(null), null);
  assert.equal(latestView([null, 'x', { result: 'nope' }]), null);
  const v = verdictView(base('supported', 'ok', [null, 'x', { name: 'n', status: 'weird', reason: 'r' }]));
  assert.deepEqual(v.notChecked[0], 'n: r');
});

test('latestView shows the newest valid verdict', () => {
  const list = [base('contradicted', 'first', []), base('supported', 'second', []), { result: 'bad' }];
  assert.equal(latestView(list).why, 'second');
});

test('compact checks are bounded in size', () => {
  const long = 'x'.repeat(5000);
  const c = compactChecks([{ name: long, status: 'pass', reason: long, parts: Array.from({ length: 40 }, () => ({ acId: 'AC1', name: long, status: 'fail', reason: long })) }]);
  assert.ok(c[0].name.length <= 80);
  assert.ok(c[0].reason.length <= 200);
  assert.equal(c[0].parts.length, 20);
  assert.ok(JSON.stringify(c).length < 8000);
});

test('only the newest verdict keeps its checks in the Jira property', () => {
  assert.deepEqual(stripChecks({ a: 1, checks: [1] }), { a: 1 });
  assert.deepEqual(stripChecks({ a: 1 }), { a: 1 });
  assert.equal(stripChecks(null), null);
});

// Monitor permission path: the new state is shown only on work items the viewer can see.
function chain(items) {
  let prev = null;
  return items.map((data) => {
    prev = nextEvent(prev, { actor: 'team-lead-verifier', event: 'verdict', data, at: '2026-11-18T00:00:00Z' });
    return prev;
  });
}

test('monitor: an old review-hold record shows its code result on a visible item and is left out on a hidden one', async () => {
  const events = chain([
    { issueKey: 'BANK-1', type: 'done', result: 'cannot_verify', reviewHold: ['AC1'] },
    { issueKey: 'HR-2', type: 'done', result: 'cannot_verify', reviewHold: ['AC1'], reason: 'secret finding text' },
    { issueKey: 'BANK-3', type: 'done', result: 'cannot_verify' },
  ]);
  const m = await monitorForViewer(events, async (key) => key.startsWith('BANK-'));
  assert.deepEqual(m.tickets.map((t) => [t.issueKey, t.claims[0].state]), [['BANK-1', 'cannot_verify'], ['BANK-3', 'cannot_verify']]);
  assert.ok(!JSON.stringify(m).includes('HR-2'));
  assert.ok(!JSON.stringify(m).includes('secret finding text'));
});

test('monitor: a permission check that throws hides the item (fail closed)', async () => {
  const events = chain([{ issueKey: 'BANK-1', type: 'done', result: 'cannot_verify', reviewHold: ['AC1'] }]);
  const m = await monitorForViewer(events, async () => { throw new Error('Jira down'); });
  assert.deepEqual(m.tickets, []);
});
