import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPacket, formatCase, formatOpinion } from '../src/case.js';
import { applyGuards } from '../src/opinion.js';

const side = (prNumber, result, diffLines, extra = {}) => ({
  prNumber, verdict: { result, reason: `${result} by checks` }, diffLines, files: ['src/bank/ledger.py'],
  pr: { body: `Fix for PR${prNumber}` }, report: { metrics: {} }, ...extra,
});
const base = { issueKey: 'BANK-32', ticket: { acceptanceCriteria: [{ acId: 'AC1' }] }, domain: null, question: 'winner', metric: null };

test('code decides by the smaller diff, so no opinion is needed', () => {
  const c = buildPacket({ ...base, evidence: [side(5, 'supported', 12), side(7, 'supported', 140)] });
  assert.equal(c.arbitration.winner, 'PR5');
  assert.equal(c.arbitration.rule, 'smaller diff');
  assert.equal(c.opinionAllowed, false);
});

test('a failed gate decides; the packet marks the side', () => {
  const c = buildPacket({ ...base, evidence: [side(5, 'contradicted', 12), side(7, 'supported', 140)] });
  assert.equal(c.arbitration.winner, 'PR7');
  assert.deepEqual(c.packet.sides, [{ id: 'PR5', gatesPassed: false }, { id: 'PR7', gatesPassed: true }]);
});

test('a tie leaves the case to a human, and an opinion may be recorded', () => {
  const c = buildPacket({ ...base, evidence: [side(5, 'supported', 40), side(7, 'supported', 40)] });
  assert.equal(c.arbitration.decidedBy, 'human');
  assert.equal(c.opinionAllowed, true);
  assert.match(formatCase('BANK-32', c), /Code does not decide/);
  const ids = c.packet.evidence.map((e) => e.id);
  assert.deepEqual(ids, ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']);
  const record = applyGuards({ decision: 'PR7', reasons: [{ text: 'PR7 explains the fix', evidence: ['E6'] }], confidence: 0.8, risks: [] }, c.packet);
  assert.equal(record.outcome, 'opinion');
  assert.match(formatOpinion('BANK-32', record), /^Opinion \(not verified\) on BANK-32: prefers PR7\. A human decides\./);
});

test('a metric inside the noise sets withinNoise; a clear margin decides by code', () => {
  const m = (v) => ({ report: { metrics: { p95_ms: v } } });
  const close = buildPacket({ ...base, metric: 'p95_ms', higherIsBetter: false,
    evidence: [side(5, 'supported', 40, m(41)), side(7, 'supported', 40, m(43))] });
  assert.equal(close.packet.withinNoise, true);
  const clear = buildPacket({ ...base, metric: 'p95_ms', higherIsBetter: false,
    evidence: [side(5, 'supported', 40, m(20)), side(7, 'supported', 40, m(43))] });
  assert.equal(clear.arbitration.decidedBy, 'code-metric');
  assert.equal(clear.arbitration.winner, 'PR5');
});

test('a high-stake domain is flagged and goes to a human', () => {
  const c = buildPacket({ ...base, domain: 'money_semantics', evidence: [side(5, 'supported', 12), side(7, 'supported', 140)] });
  assert.equal(c.highStake, true);
  assert.equal(c.arbitration.decidedBy, 'human');
});

test('a design question allows an opinion even when code picks a winner', () => {
  const c = buildPacket({ ...base, question: 'design', evidence: [side(5, 'supported', 12), side(7, 'supported', 140)] });
  assert.equal(c.opinionAllowed, true);
});

test('case input is validated before any call', async () => {
  const { parseCaseInput } = await import('../src/case-actions.js');
  assert.deepEqual(parseCaseInput({ issueKey: 'bank-32', prNumbers: '5, 7' }).errors, []);
  assert.equal(parseCaseInput({ issueKey: 'BANK-32', prNumbers: '5' }).errors.length, 1);
  assert.equal(parseCaseInput({ issueKey: 'main', prNumbers: '5,7', question: 'x', domain: 'y' }).errors.length, 3);
});

test('a metric gate is not trusted when the PR changes how the metric is measured', async () => {
  const { verify } = await import('../src/verifier/verdict.js');
  const sha = 'a'.repeat(40);
  const ctx = (prFiles) => ({
    ticket: { key: 'BANK-17', type: 'Story', acceptanceCriteria: [{ acId: 'AC1', check: { type: 'metric_at_least', args: ['pr_auc', 0.25] } }] },
    pr: { number: 3, title: 'BANK-17: ship fraud model v3', state: 'open', headSha: sha },
    report: { schema: 'aat-ci-report/1', head_sha: sha, tests: [], metrics: { pr_auc: 0.9 }, workflow_files: { '.github/workflows/ci.yml': 'h' } },
    reportAuthor: 'github-actions[bot]',
    reportComment: { createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' },
    baseWorkflowFiles: { '.github/workflows/ci.yml': 'h' },
    workflowRuns: [{ name: 'CI', path: '.github/workflows/ci.yml', headSha: sha, status: 'completed', conclusion: 'success', createdAt: '2026-11-20T00:00:00Z' }],
    prFiles,
    config: { requiredWorkflowPaths: ['.github/workflows/ci.yml'], guardedPaths: ['src/fraud/evaluate.py', 'src/bank/testing/'] },
  });
  assert.equal(verify({ id: 'c', type: 'ready' }, ctx(['tests/test_bank17_gate.py'])).result, 'supported');
  const tampered = verify({ id: 'c', type: 'ready' }, ctx(['src/fraud/evaluate.py']));
  assert.equal(tampered.result, 'cannot_verify');
  assert.match(tampered.reason, /src\/fraud\/evaluate\.py, which can change how pr_auc is measured/);
  assert.equal(verify({ id: 'c', type: 'ready' }, ctx(['src/bank/testing/ci_report.py'])).result, 'cannot_verify');
  assert.equal(verify({ id: 'c', type: 'ready' }, ctx(undefined)).result, 'cannot_verify');
});
