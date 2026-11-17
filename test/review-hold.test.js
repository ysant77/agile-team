// Review finding 7 (17 Nov): an accepted review with a blocking finding for the same head commit
// holds a claim that code would rate supported. A review can only hold, never pass.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide } from '../src/verify-claim.js';

const HEAD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const CI = '.github/workflows/ci.yml';
const TEST = 'test_BANK4_single_withdrawal_debits_once';

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
  };
}

const review = (extra = {}, finding = {}) => ({
  label: 'Review (not verified)', outcome: 'review', guard: null, prNumber: 61, headSha: HEAD,
  review: { findings: [{ hunk: 'P61:H1', file: 'src/bank/accounts.py', line: 41, severity: 'blocking', ac: 'AC1', text: 'The test runs one thread only, so AC1 has no evidence under load.', ...finding }], risks: [], proposedChecks: [] },
  ...extra,
});

function deps({ gh = github(), reviews = [] } = {}) {
  return {
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: null }),
    collectJira: async () => ({ key: 'BANK-4', type: 'Story', labels: [], acceptanceCriteria: [{ acId: 'AC1', check: { type: 'test_passes', args: [TEST] } }] }),
    collectGithub: async () => gh,
    collectPrStats: async () => ({ patches: {} }),
    collectReviews: async () => reviews,
    fetchFn: null,
  };
}

const run = (type, d) => decide({ issueKey: 'BANK-4', claim: { id: 'BANK-4:1', type, text: '' } }, d);

test('the fixture without a review is supported', async () => {
  const { verdict } = await run('ready', deps());
  assert.equal(verdict.result, 'supported', verdict.reason);
});

test('a blocking finding on the same head holds ready, fixed and done', async () => {
  for (const type of ['ready', 'fixed', 'done']) {
    assert.equal((await run(type, deps())).verdict.result, 'supported', type);
    const { verdict, record, comment } = await run(type, deps({ reviews: [review()] }));
    assert.equal(verdict.result, 'cannot_verify', type);
    assert.match(verdict.reason, /AC1/);
    assert.match(verdict.reason, /a person must check the reviewer's blocking finding/);
    assert.equal(record.result, 'cannot_verify');
    assert.match(comment, /CANNOT VERIFY/);
  }
});

test('a note-only review does not hold', async () => {
  const { verdict } = await run('ready', deps({ reviews: [review({}, { severity: 'note', ac: undefined })] }));
  assert.equal(verdict.result, 'supported');
});

test('a review for another head commit does not hold', async () => {
  const { verdict } = await run('ready', deps({ reviews: [review({ headSha: OTHER })] }));
  assert.equal(verdict.result, 'supported');
});

test('a refused review, no review or a failed read does not hold', async () => {
  const refused = review({ outcome: 'invalid_review', guard: 'quoted-line' });
  assert.equal((await run('ready', deps({ reviews: [refused] }))).verdict.result, 'supported');
  assert.equal((await run('ready', deps({ reviews: null }))).verdict.result, 'supported');
  const d = deps();
  d.collectReviews = async () => { throw new Error('Jira 503'); };
  assert.equal((await run('ready', d)).verdict.result, 'supported');
});

test('a review never turns contradicted or cannot_verify into supported', async () => {
  const failed = await run('ready', deps({ gh: github({ outcome: 'failed' }), reviews: [review()] }));
  assert.equal(failed.verdict.result, 'contradicted');
  const unknown = await run('ready', deps({ gh: github({ report: false }), reviews: [review()] }));
  assert.equal(unknown.verdict.result, 'cannot_verify');
  assert.doesNotMatch(unknown.verdict.reason, /reviewer's blocking finding/);
  const clean = await run('ready', deps({ gh: github({ outcome: 'failed' }), reviews: [review({}, { severity: 'note', ac: undefined })] }));
  assert.equal(clean.verdict.result, 'contradicted');
});
