// Owner decision 20 Nov, item 1: the model reviewer is advice only. A stored review finding is
// shown with its hunk and the quoted changed line, marked "advice from a model, not counted". It
// never changes a verdict: not to cannot_verify, not to held, and never to supported. Before this
// change, src/verify-claim.js called applyReviewHold (src/review-hold.js) on every supported claim
// with a head commit; no config could turn it off. The bench harness had a --rule switch.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decide } from '../src/verify-claim.js';
import * as advice from '../src/review-advice.js';
import { applyReviewGuards, buildReviewPacket, reviewGate } from '../src/review.js';
import { COMPLETE, withReader } from './helpers/reader.js';
import './helpers/unlisted.js';

const HEAD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const CI = '.github/workflows/ci.yml';
const TEST = 'test_BANK4_single_withdrawal_debits_once';
const LABEL = 'advice from a model, not counted';

function github({ outcome = 'passed', report = true } = {}) {
  return {
    pr: { number: 61, title: 'BANK-4 lock the withdrawal', branch: 'fix/bank-4-lock', state: 'open', headSha: HEAD },
    report: report ? { schema: 'aat-ci-report/1', head_sha: HEAD, tests: [{ id: `tests/test_accounts.py::${TEST}`, outcome }], metrics: {}, workflow_files: { [CI]: 'h' } } : null,
    reportAuthor: 'github-actions[bot]',
    reportComment: { createdAt: '2026-11-17T01:05:00Z', updatedAt: '2026-11-17T01:05:00Z' },
    baseWorkflowFiles: { [CI]: 'h' },
    workflowRuns: [{ name: 'CI', path: CI, headSha: HEAD, status: 'completed', conclusion: 'success', createdAt: '2026-11-17T01:00:00Z', runStartedAt: '2026-11-17T01:00:05Z', updatedAt: '2026-11-17T01:09:00Z' }],
    deployRuns: [],
    prFiles: ['src/bank/accounts.py', 'tests/test_accounts.py'],
    truncated: COMPLETE,
    prCandidates: [61],
  };
}

const FINDING = { hunk: 'P61:H1', file: 'src/bank/accounts.py', line: 41, quote: 'with lock: balance -= amount', severity: 'blocking', ac: 'AC1', text: 'The test runs one thread only, so AC1 has no evidence under load.' };
const review = (extra = {}, finding = {}) => ({
  label: 'Review (not verified)', outcome: 'review', guard: null, prNumber: 61, headSha: HEAD,
  review: { findings: [{ ...FINDING, ...finding }], risks: [], proposedChecks: [] },
  ...extra,
});

function deps({ gh = github(), reviews = [] } = {}) {
  return {
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: null }),
    collectJira: async () => ({ key: 'BANK-4', type: 'Story', labels: [], acceptanceCriteria: [{ acId: 'AC1', check: { type: 'test_passes', args: [TEST] } }], subtasks: [], links: [] }),
    collectGithub: async () => gh,
    collectPrStats: async () => ({ patches: {} }),
    collectReviews: async () => reviews,
    fetchFn: null,
  };
}

const run = (type, d) => decide({ issueKey: 'BANK-4', claim: { id: 'BANK-4:1', type, text: '' } }, d);
// What decides an outcome: the result, the reason and every check.
const decision = (v) => ({ result: v.result, reason: v.reason, checks: v.checks });

test('a blocking finding on the same head is advice: ready and fixed stay supported, with the same reason and checks', async () => {
  for (const type of ['ready', 'fixed']) {
    const plain = await run(type, deps());
    assert.equal(plain.verdict.result, 'supported', plain.verdict.reason);
    const { verdict, record, comment } = await run(type, deps({ reviews: [review()] }));
    assert.deepEqual(decision(verdict), decision(plain.verdict), type);
    assert.equal(record.result, 'supported');
    assert.equal(record.reason, plain.record.reason);
    assert.deepEqual(record.checks, plain.record.checks);
    assert.equal('reviewHold' in verdict, false);
    assert.equal('reviewHold' in record, false);
    assert.deepEqual(verdict.advice, [{ label: LABEL, hunk: 'P61:H1', file: 'src/bank/accounts.py', line: 41, quote: 'with lock: balance -= amount', severity: 'blocking', ac: 'AC1', text: FINDING.text }]);
    assert.deepEqual(record.advice, verdict.advice);
    assert.match(comment, /SUPPORTED|supported/i);
    assert.match(comment, /Advice from a model, not counted/);
    assert.match(comment, /P61:H1 src\/bank\/accounts\.py:41 "with lock: balance -= amount"/);
    assert.match(comment, /The test runs one thread only/);
    assert.match(comment, /Deterministic; no model decided this verdict\./);
    assert.doesNotMatch(comment, /holds the claim/);
  }
});

test('a review never moves contradicted or cannot_verify, and never adds a reviewer reason', async () => {
  for (const gh of [github({ outcome: 'failed' }), github({ report: false })]) {
    const plain = (await run('ready', deps({ gh }))).verdict;
    const with_ = (await run('ready', deps({ gh, reviews: [review()] }))).verdict;
    assert.notEqual(plain.result, 'supported');
    assert.deepEqual(decision(with_), decision(plain));
    assert.doesNotMatch(with_.reason, /review/i);
    assert.equal(with_.advice.length, 1, 'the advice is still shown');
  }
});

test('a supported done claim (S59, merged PR) stays supported with a blocking finding', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/S59.json', import.meta.url), 'utf8'));
  const defaults = JSON.parse(readFileSync(new URL('../fixtures/_defaults.json', import.meta.url), 'utf8'));
  const gh = () => {
    const c = withReader({ ...defaults, ...structuredClone(fixture.steps[0].context) });
    const r = c.workflowRuns[0];
    c.report.workflow_files = defaults.baseWorkflowFiles;
    c.mergeReport.workflow_files = defaults.baseWorkflowFiles;
    c.reportComment = { createdAt: r.createdAt, updatedAt: r.createdAt };
    delete c.ticket;
    return c;
  };
  const head = gh().pr.headSha;
  const ticket = { key: 'BANK-4', type: 'Story', labels: [], subtasks: [], links: [], acceptanceCriteria: [{ acId: 'AC1', check: { type: 'ci_green', args: [] } }] };
  const d = (reviews) => ({
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: null }),
    collectJira: async () => structuredClone(ticket), collectGithub: async () => gh(),
    collectPrStats: async () => ({ patches: gh().prPatches }), collectReviews: async () => reviews,
    readAudit: async () => [], fetchFn: null,
  });
  const done = async (reviews) => (await decide({ issueKey: 'BANK-4', claim: { id: 'BANK-4:d', type: 'done', by: 'acc-dev' } }, d(reviews))).verdict;
  const plain = await done([]);
  assert.equal(plain.result, 'supported', plain.reason);
  const v = await done([review({ headSha: head, prNumber: 14 }, { hunk: 'P14:H1', line: 12 })]);
  assert.deepEqual(decision(v), decision(plain));
  assert.equal(v.advice.length, 1);
});

test('no advice from another head, a refused review, no review, a failed read or a note without a defect statement', async () => {
  const none = async (d) => {
    const { verdict } = await run('ready', d);
    assert.equal(verdict.result, 'supported');
    assert.deepEqual(verdict.advice, []);
  };
  await none(deps({ reviews: [review({ headSha: OTHER })] }));
  await none(deps({ reviews: [review({ outcome: 'invalid_review', guard: 'quoted-line' })] }));
  await none(deps({ reviews: null }));
  await none(deps({ reviews: [review({}, { severity: 'note', ac: undefined, text: 'Finding 1: see P61:H1, line 41.' })] }));
  const d = deps();
  d.collectReviews = async () => { throw new Error('Jira 503'); };
  await none(d);
});

test('a note finding with a defect statement is advice too, marked note', async () => {
  const { verdict } = await run('ready', deps({ reviews: [review({}, { severity: 'note', ac: undefined })] }));
  assert.equal(verdict.result, 'supported');
  assert.equal(verdict.advice[0].severity, 'note');
  assert.equal(verdict.advice[0].ac, null);
});

test('a malformed stored review gives no advice, does not throw and changes nothing', async () => {
  const malformed = [
    review({ review: { findings: null, risks: [], proposedChecks: [] } }),
    review({ review: { findings: 'blocking', risks: [], proposedChecks: [] } }),
    review({ review: { findings: { severity: 'blocking', ac: 'AC1' }, risks: [], proposedChecks: [] } }),
    review({ review: { findings: [null, 'blocking', 7], risks: [], proposedChecks: [] } }),
    review({ review: 'not an object' }),
  ];
  for (const r of malformed) {
    const { verdict } = await run('ready', deps({ reviews: [r] }));
    assert.equal(verdict.result, 'supported', JSON.stringify(r.review));
    assert.deepEqual(verdict.advice, []);
  }
  const { verdict } = await run('ready', deps({ reviews: [malformed[0], review()] }));
  assert.equal(verdict.result, 'supported');
  assert.equal(verdict.advice.length, 1);
});

test('withAdvice never changes the result, reason or checks of any verdict', () => {
  const checks = [{ name: 'ci_green', status: 'pass', reason: 'ok' }];
  for (const result of ['supported', 'contradicted', 'cannot_verify']) {
    const v = { result, reason: `r-${result}`, checks, checkerVersion: 'v' };
    for (const reviews of [[review()], [review(), review({}, { severity: 'note' })], [], null, 'x']) {
      const out = advice.withAdvice(v, reviews, HEAD);
      assert.deepEqual(decision(out), decision(v));
      assert.equal(out.checkerVersion, 'v');
      assert.ok(Array.isArray(out.advice));
    }
    assert.deepEqual(advice.withAdvice(v, [review()], null).advice, []);
  }
});

test('the old hold is gone: no hold export, no reviewer branch in the verdict comment, no --rule switch in the bench', () => {
  assert.equal(advice.applyReviewHold, undefined);
  assert.equal(advice.HOLD_CLAIMS, undefined);
  const src = readFileSync(new URL('../src/verify-claim.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /applyReviewHold|reviewHold|review-hold/);
  const armD = readFileSync(new URL('../benchmark/run/arm_d.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(armD, /--rule|any-finding|blockingFindings/);
  assert.match(armD, /D: cResult\.outcome/);
});

// ---- The quoted line comes from the packet, by code ----
const packet = buildReviewPacket({
  ticket: { key: 'BANK-9', acceptanceCriteria: [{ acId: 'AC1', statement: 'A zero amount is refused.', check: { type: 'manual' } }] },
  pr: { number: 70, headSha: HEAD },
  files: [{ filename: 'src/bank/ledger.py', patch: '@@ -10,2 +10,3 @@\n def withdraw(a):\n+    if a < 0: raise ValueError\n     return a' }],
  reportTests: [], verdict: { result: 'cannot_verify', reason: 'AC1 needs a human' }, trigger: 'manual_ac',
});
const raw = (text, extra = {}) => JSON.stringify({ findings: [{ hunk: 'P70:H1', file: 'src/bank/ledger.py', line: 11, severity: 'blocking', ac: 'AC1', text, ...extra }], risks: [], proposedChecks: [] });

test('an accepted finding carries the changed line it points at, quoted from the packet', () => {
  const r = applyReviewGuards(raw('A zero amount still passes, so AC1 is not met by this change.'), packet);
  assert.equal(r.outcome, 'review', JSON.stringify(r.reasons));
  assert.equal(r.review.findings[0].quote, '    if a < 0: raise ValueError');
  const accepted = reviewGate(r, 1).record;
  const items = advice.reviewAdvice([{ ...accepted, headSha: HEAD }], HEAD);
  assert.equal(items[0].quote, '    if a < 0: raise ValueError');
  assert.match(advice.formatAdvice(items).join('\n'), /P70:H1 src\/bank\/ledger\.py:11 "    if a < 0: raise ValueError"/);
});

test('a model-sent quote is not trusted: code replaces it with the packet line', () => {
  const r = applyReviewGuards(raw('A zero amount still passes, so AC1 is not met by this change.', { quote: 'return "approved"' }), packet);
  assert.equal(r.outcome, 'review', JSON.stringify(r.reasons));
  assert.equal(r.review.findings[0].quote, '    if a < 0: raise ValueError');
});

test('a review can still never approve: a verdict word is refused and gives no advice', () => {
  const r = applyReviewGuards(raw('This is approved; ship it.'), packet);
  assert.equal(r.outcome, 'invalid_review');
  assert.equal(r.guard, 'verdict-word');
  const accepted = reviewGate(r, 1).record;
  assert.deepEqual(advice.reviewAdvice([{ ...accepted, headSha: HEAD }], HEAD), []);
});

test('an old stored finding without a quote shows that the line is not stored', () => {
  const items = advice.reviewAdvice([review({}, { quote: undefined })], HEAD);
  assert.equal(items[0].quote, null);
  assert.match(advice.formatAdvice(items)[1], /\(line text not stored\)/);
});
