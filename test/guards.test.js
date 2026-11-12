import assert from 'node:assert/strict';
import { test } from 'node:test';

import { verify } from '../src/verifier/verdict.js';
import { VERIFY_CONFIG } from '../src/verify-claim.js';

const sha = 'b'.repeat(40);
const ctx = ({ prFiles = ['tests/test_bank17_gate.py'], metrics = { pr_auc: 0.39, auc: 0.89 }, checks, config = VERIFY_CONFIG, workflowFiles } = {}) => ({
  ticket: { key: 'BANK-17', type: 'Story', acceptanceCriteria: (checks ?? [['metric_at_least', 'pr_auc', 0.25]]).map(([type, ...args], i) => ({ acId: `AC${i + 1}`, check: { type, args } })) },
  pr: { number: 9, title: 'BANK-17: ship fraud model v3', state: 'open', headSha: sha },
  report: { schema: 'aat-ci-report/1', head_sha: sha, tests: [], metrics, ...(workflowFiles ? { workflow_files: workflowFiles } : {}) },
  reportAuthor: 'github-actions[bot]',
  workflowRuns: [{ name: 'CI', headSha: sha, status: 'completed', conclusion: 'success', createdAt: '2026-11-20T00:00:00Z' }],
  baseWorkflowFiles: workflowFiles ? { '.github/workflows/ci.yml': 'base' } : null,
  prFiles,
  config,
});
const ready = (c) => verify({ id: 'c', type: 'ready' }, c);

test('the production config guards every file that decides how a metric is measured', () => {
  for (const file of ['src/fraud/evaluate.py', 'src/fraud/model.py', 'src/bank/testing/ci_report.py',
    'tests/conftest.py', 'tests/test_fraud_model.py', 'tests/test_bench.py', 'pyproject.toml']) {
    const v = ready(ctx({ prFiles: ['src/fraud/data.py', file] }));
    assert.equal(v.result, 'cannot_verify', file);
    assert.match(v.reason, new RegExp(file.replace(/[./]/g, '\\$&')));
  }
});

test('a fix that touches only model inputs and new tests is judged on its numbers', () => {
  assert.equal(ready(ctx({ prFiles: ['src/fraud/data.py', 'tests/test_bank40_fraud_features.py'] })).result, 'supported');
  assert.equal(ready(ctx({ prFiles: ['src/fraud/data.py'], metrics: { pr_auc: 0.08 } })).result, 'contradicted');
});

test('a guarded directory matches by prefix only, a guarded file only exactly', () => {
  assert.equal(ready(ctx({ prFiles: ['src/bank/testing_notes.md'] })).result, 'supported');
  assert.equal(ready(ctx({ prFiles: ['src/fraud/evaluate.py.bak'] })).result, 'supported');
  assert.equal(ready(ctx({ prFiles: ['src/bank/testing/new_plugin.py'] })).result, 'cannot_verify');
});

test('without a file list a metric gate cannot be verified; without guards it is judged', () => {
  assert.equal(ready(ctx({ prFiles: null })).result, 'cannot_verify');
  assert.equal(ready(ctx({ prFiles: null, config: { requiredWorkflows: ['CI'] } })).result, 'supported');
});

test('the guard applies to upper and lower bounds and wins over a passing value', () => {
  const both = [['metric_at_least', 'pr_auc', 0.25], ['metric_at_most', 'auc', 0.95]];
  const v = ready(ctx({ prFiles: ['src/fraud/model.py'], checks: both }));
  assert.equal(v.result, 'cannot_verify');
  assert.equal(v.reason.split(';').length, 2);
});

test('a test check is not affected by the metric guard', () => {
  const c = ctx({ prFiles: ['src/fraud/evaluate.py'], checks: [['test_passes', 'test_BANK17_gate']] });
  c.report.tests = [{ id: 'tests/test_bank17_gate.py::test_BANK17_gate', outcome: 'passed' }];
  assert.equal(ready(c).result, 'supported');
});

test('the too-good guard still sends a leak to a human when no guarded file changed', () => {
  const v = ready(ctx({ checks: [['metric_at_most', 'auc', 0.95]], metrics: { auc: 0.983 } }));
  assert.equal(v.result, 'cannot_verify');
  assert.match(v.reason, /too good/);
});
