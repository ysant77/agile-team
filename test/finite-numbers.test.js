// Only finite numbers count in the verifier and the case builder (PR 4 review, finding 1).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { metricCompare } from '../src/verifier/checks.js';
import { verify } from '../src/verifier/verdict.js';
import { buildSide } from '../src/case.js';
import { arbitrate } from '../src/arbitration.js';
import { withReader } from './helpers/reader.js';

const sha = 'c'.repeat(40);
// The reader fields that PR 9 requires (page flags, sub-task and link lists).
const ctx = (metrics, config = {}) => withReader({
  ticket: { key: 'BANK-17', type: 'Story', acceptanceCriteria: [] },
  pr: { number: 9, title: 'BANK-17: x', state: 'open', headSha: sha },
  report: { schema: 'aat-ci-report/1', head_sha: sha, tests: [], metrics, workflow_files: { '.github/workflows/ci.yml': 'base' } },
  reportAuthor: 'github-actions[bot]',
  reportComment: { createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' },
  workflowRuns: [{ name: 'CI', path: '.github/workflows/ci.yml', headSha: sha, status: 'completed', conclusion: 'success', createdAt: '2026-11-20T00:00:00Z' }],
  baseWorkflowFiles: { '.github/workflows/ci.yml': 'base' },
  prFiles: ['src/a.py'],
  config,
});

test('a non-finite metric value is unknown, not a pass', () => {
  const report = JSON.parse('{"plain": 1e999, "bench": {"median": 1e999, "runs": 5}}');
  for (const name of ['plain', 'bench']) {
    const r = metricCompare(ctx(report), name, 0.5, 'min');
    assert.equal(r.status, 'unknown', name);
    assert.match(r.reason, /not a finite number/);
  }
  assert.equal(metricCompare(ctx({ x: Number.NaN }), 'x', 0.5, 'max').status, 'unknown');
  assert.equal(metricCompare(ctx({ x: { median: Number.NEGATIVE_INFINITY } }), 'x', 0.5, 'max').status, 'unknown');
});

test('a missing or non-numeric bound is unknown, never coerced to 0', () => {
  for (const bound of [null, '', undefined, 'abc', '0.5', Number.POSITIVE_INFINITY, Number.NaN]) {
    const r = metricCompare(ctx({ auc: 0.4 }), 'auc', bound, 'min');
    assert.equal(r.status, 'unknown', String(bound));
    assert.match(r.reason, /bound/);
  }
});

test('the full verifier maps a non-finite metric to cannot_verify', () => {
  const c = ctx(JSON.parse('{"auc": 1e999}'));
  c.ticket.acceptanceCriteria = [{ acId: 'AC1', check: { type: 'metric_at_least', args: ['auc', 0.8] } }];
  assert.equal(verify({ id: 'c', type: 'ready' }, c).result, 'cannot_verify');
});

test('a non-finite too-good limit is reported as a config error, not as 0', () => {
  const r = metricCompare(ctx({ auc: 0.6 }, { tooGood: { auc: null } }), 'auc', 0.5, 'min');
  assert.equal(r.status, 'unknown');
  assert.match(r.reason, /too-good limit for auc is not a finite number/);
});

test('a non-finite diff size is not known', () => {
  for (const diffLines of [Number.POSITIVE_INFINITY, Number.NaN]) {
    assert.equal(buildSide({ prNumber: 5, diffLines }, null).diffLines, null, String(diffLines));
  }
  assert.equal(buildSide({ prNumber: 5, diffLines: 12 }, null).diffLines, 12);
});

test('a non-finite margin falls back to the default margin, never to 0', () => {
  const side = (id, median) => ({ id, gatesPassed: true, metrics: { median, iqrLow: median, iqrHigh: median },
    newFailureModes: [], newDependencies: [], diffLines: 10 });
  for (const margin of ['', Number.NaN, '0']) {
    const d = arbitrate({ preRegistered: { metric: 'recall', higherIsBetter: true, margin } }, [side('PR5', 0.5), side('PR7', 0.52)]);
    assert.notEqual(d.decidedBy, 'code-metric', String(margin));
  }
});
