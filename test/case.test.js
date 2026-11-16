import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPacket, formatCase, formatOpinion } from '../src/case.js';
import { applyGuards } from '../src/opinion.js';

const side = (prNumber, result, diffLines, extra = {}) => ({
  prNumber, verdict: { result, reason: `${result} by checks` }, diffLines, files: ['src/bank/ledger.py'],
  pr: { body: `Fix for PR${prNumber}` }, report: { metrics: {} }, ...extra,
});
const base0 = { issueKey: "BANK-36", ticket: { acceptanceCriteria: [{ acId: "AC1" }] }, domain: null, question: "winner", metric: null };
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
  assert.deepEqual(ids, ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']);
  const record = applyGuards({ decision: 'PR7', reasons: [{ text: 'PR7 explains the fix', evidence: ['E8'] }], confidence: 0.8, risks: [] }, c.packet);
  assert.equal(record.outcome, 'opinion');
  assert.match(formatOpinion('BANK-32', record), /^Opinion \(not verified\) on BANK-32: prefers PR7\. A human decides\./);
});

test('in one job, a metric inside the noise sets withinNoise; a clear margin decides by code', () => {
  const m = (v) => ({ report: { job_id: 'job-1', metrics: { p95_ms: v } } });
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
    prPatches: Object.fromEntries((prFiles ?? []).filter((f) => f.endsWith('.py')).map((f) => [f, '@@ -0,0 +1,2 @@\n+def test_new():\n+    assert 1 + 1 == 2'])),
    config: { requiredWorkflowPaths: ['.github/workflows/ci.yml'], guardedPaths: ['src/fraud/evaluate.py', 'src/bank/testing/'] },
  });
  assert.equal(verify({ id: 'c', type: 'ready' }, ctx(['tests/test_bank17_gate.py'])).result, 'supported');
  const tampered = verify({ id: 'c', type: 'ready' }, ctx(['src/fraud/evaluate.py']));
  assert.equal(tampered.result, 'cannot_verify');
  assert.match(tampered.reason, /src\/fraud\/evaluate\.py, which can change how pr_auc is measured/);
  assert.equal(verify({ id: 'c', type: 'ready' }, ctx(['src/bank/testing/ci_report.py'])).result, 'cannot_verify');
  assert.equal(verify({ id: 'c', type: 'ready' }, ctx(undefined)).result, 'cannot_verify');
});

import { newDependencies, newFailureModes } from '../src/case.js';

test('new dependencies are the head lock packages the base lock does not have', () => {
  assert.deepEqual(newDependencies({ deps: { a: '1', b: '2' } }, { deps: { a: '1', b: '3', redis: '5' } }), ['redis']);
  assert.equal(newDependencies(null, { deps: { a: '1' } }), null);
});

test('a cache change without a stale-read test is a new failure mode', () => {
  const files = ['src/bank/statement_cache.py'];
  assert.deepEqual(newFailureModes({ files, report: { tests: [{ id: 'tests/test_x.py::test_fast' }] } }), ['cache without a stale-read test']);
  assert.deepEqual(newFailureModes({ files, report: { tests: [{ id: 'tests/test_x.py::test_no_stale_balance' }] } }), []);
  assert.deepEqual(newFailureModes({ files: ['migrations/0004_index.sql'], report: { tests: [] } }), []);
});

test('S36 shape: the cache side loses on "fewer new failure modes" before the diff size counts', () => {
  const base = { deps: { pytest: '8' } };
  const evidence = [
    { ...side(5, 'supported', 30), files: ['src/bank/statement_cache.py'], baseReport: base, report: { metrics: {}, deps: { pytest: '8', cachetools: '5' }, tests: [] } },
    { ...side(7, 'supported', 60), files: ['migrations/0004_statement_index.sql'], baseReport: base, report: { metrics: {}, deps: { pytest: '8' }, tests: [] } },
  ];
  const c = buildPacket({ ...base0, evidence });
  assert.equal(c.arbitration.winner, 'PR7');
  assert.equal(c.arbitration.rule, 'fewer new failure modes');
  assert.ok(c.packet.evidence.some((e) => e.kind === 'rule' && /PR5: new dependencies: cachetools; new failure modes: cache without a stale-read test/.test(e.text)));
});

test('reports from different CI jobs are not compared on performance', () => {
  const m = (job, median, low, high) => ({ report: { job_id: job, metrics: { transfers_per_s: { median, iqr_low: low, iqr_high: high, runs: 20 } } } });
  // The real case: main measured about 10 000 and an unchanged branch 23 000, on two runners.
  const c = buildPacket({ ...base, metric: 'transfers_per_s', evidence: [
    side(5, 'supported', 40, m('job-a', 10320.7, 10100, 10500)),
    side(7, 'supported', 60, m('job-b', 23468.75, 20435.5, 23617.5)),
  ] });
  assert.equal(c.packet.crossJob, true);
  assert.equal(c.packet.withinNoise, true);
  assert.notEqual(c.arbitration.decidedBy, 'code-metric');
  assert.equal(c.arbitration.rule, 'smaller diff');
  assert.ok(c.packet.evidence.some((e) => /cannot compare across jobs/.test(e.text)));
  assert.match(formatCase('BANK-32', c), /Performance: cannot compare across jobs/);
  // Reports without a job id count as different jobs.
  const none = buildPacket({ ...base, metric: 'transfers_per_s', evidence: [
    side(5, 'supported', 40, { report: { metrics: { transfers_per_s: 10 } } }),
    side(7, 'supported', 60, { report: { metrics: { transfers_per_s: 99 } } }),
  ] });
  assert.equal(none.packet.crossJob, true);
});
