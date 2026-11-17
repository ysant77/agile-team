import assert from 'node:assert/strict';
import { test } from 'node:test';
import { betaSample, reward, seededRng, updatePosterior } from '../src/assignment.js';
import { nextEvent, verifyChain } from '../src/audit.js';
import { extractReport, testName } from '../src/verifier/report.js';
import { verify } from '../src/verifier/verdict.js';

test('audit chain verifies and detects a broken link', () => {
  let prev = null;
  const events = [1, 2, 3].map((n) => (prev = nextEvent(prev, { actor: 'a', event: 'e', data: { n }, at: 't' })));
  assert.equal(verifyChain(events).ok, true);
  events.splice(1, 1);
  assert.equal(verifyChain(events).ok, false);
});

test('beta sampler mean is close to alpha / (alpha + beta)', () => {
  const rng = seededRng(42);
  let sum = 0;
  for (let i = 0; i < 4000; i += 1) sum += betaSample(8, 2, rng);
  assert.ok(Math.abs(sum / 4000 - 0.8) < 0.02);
});

test('reward and posterior update follow the design', () => {
  assert.equal(reward({ onTime: true, firstClaimSupported: true }), 1);
  assert.equal(reward({ onTime: false, firstClaimSupported: true, reopenedWithin7d: true }), 0);
  assert.deepEqual(updatePosterior({ alpha: 1, beta: 1 }, 1), { alpha: 1.95, beta: 0.95 });
});

test('report extraction needs the marker and the schema', () => {
  const body = '<!-- aat-ci-report -->\n```json\n{"schema":"aat-ci-report/1","tests":[]}\n```';
  assert.equal(extractReport(body).schema, 'aat-ci-report/1');
  assert.equal(extractReport('```json\n{"schema":"aat-ci-report/1"}\n```'), null);
  assert.equal(testName('tests/t.py::C::test_x[eur-2]'), 'test_x');
});

// A CI context the verifier trusts: the pinned workflow ran on the head, the PR changes no
// workflow, and the report comment was written during that run.
const trustedCi = (head) => ({
  reportAuthor: 'github-actions[bot]',
  baseWorkflowFiles: { '.github/workflows/ci.yml': 'h' },
  prFiles: ['src/bank/service.py'],
  reportComment: { createdAt: '2026-11-16T00:00:00Z', updatedAt: '2026-11-16T00:00:00Z' },
  workflowRuns: [{ name: 'CI', path: '.github/workflows/ci.yml', headSha: head, status: 'completed', conclusion: 'success', createdAt: '2026-11-16T00:00:00Z' }],
});

test('too-good guard turns a passing metric into cannot_verify', () => {
  const head = 'f'.repeat(40);
  const v = verify(
    { id: 'c', type: 'acs' },
    {
      ...trustedCi(head),
      config: { tooGood: { auc: 0.98 } },
      ticket: { key: 'BANK-40', acceptanceCriteria: [{ acId: 'AC1', check: { type: 'metric_at_least', args: ['auc', 0.88] } }] },
      pr: { headSha: head },
      report: { schema: 'aat-ci-report/1', head_sha: head, workflow_files: { '.github/workflows/ci.yml': 'h' }, metrics: { auc: 0.995 } },
    },
  );
  assert.equal(v.result, 'cannot_verify');
  assert.match(v.reason, /too good/);
});

test('unknown claim type cannot be verified', () => {
  assert.equal(verify({ id: 'x', type: 'vibes' }, { ticket: { key: 'BANK-1' } }).result, 'cannot_verify');
});

test('AC test names may use the {TOKEN} placeholder', () => {
  const head = 'e'.repeat(40);
  const v = verify(
    { id: 'c', type: 'acs' },
    {
      ...trustedCi(head),
      ticket: { key: 'BANK-7', acceptanceCriteria: [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_{TOKEN}_x'] } }] },
      pr: { headSha: head },
      report: { schema: 'aat-ci-report/1', head_sha: head, workflow_files: { '.github/workflows/ci.yml': 'h' }, tests: [{ id: 't.py::test_BANK7_x', outcome: 'passed' }] },
    },
  );
  assert.equal(v.result, 'supported', v.reason);
});
