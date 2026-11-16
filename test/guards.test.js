import assert from 'node:assert/strict';
import { test } from 'node:test';

import { verify } from '../src/verifier/verdict.js';
import { VERIFY_CONFIG } from '../src/verify-claim.js';

const sha = 'b'.repeat(40);
const BENCH = [{ id: 'tests/test_bench.py::test_transfer_throughput', outcome: 'passed' }];
const ctx = ({ prFiles = ['tests/test_bank17_gate.py'], metrics = { pr_auc: 0.39, auc: 0.89 }, checks, config = VERIFY_CONFIG, workflowFiles, tests = BENCH, patches } = {}) => ({
  ticket: { key: 'BANK-17', type: 'Story', acceptanceCriteria: (checks ?? [['metric_at_least', 'pr_auc', 0.25]]).map(([type, ...args], i) => ({ acId: `AC${i + 1}`, check: { type, args } })) },
  pr: { number: 9, title: 'BANK-17: ship fraud model v3', state: 'open', headSha: sha },
  report: { schema: 'aat-ci-report/1', head_sha: sha, tests, metrics, workflow_files: workflowFiles ?? { '.github/workflows/ci.yml': 'base' } },
  reportAuthor: 'github-actions[bot]',
  reportComment: { createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' },
  workflowRuns: [{ name: 'CI', path: '.github/workflows/ci.yml', headSha: sha, status: 'completed', conclusion: 'success', createdAt: '2026-11-20T00:00:00Z' }],
  baseWorkflowFiles: { '.github/workflows/ci.yml': 'base' },
  prFiles,
  prPatches: patches ?? Object.fromEntries((prFiles ?? []).filter((f) => f.endsWith('.py')).map((f) => [f, '@@ -0,0 +1,2 @@\n+def test_new():\n+    assert 1 + 1 == 2'])),
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

test('without a file list no CI evidence is trusted, guards or not (review B4, 16 Nov)', () => {
  assert.equal(ready(ctx({ prFiles: null })).result, 'cannot_verify');
  assert.equal(ready(ctx({ prFiles: null, config: { requiredWorkflowPaths: ['.github/workflows/ci.yml'] } })).result, 'cannot_verify');
  assert.equal(ready(ctx({ prFiles: [], config: { requiredWorkflowPaths: ['.github/workflows/ci.yml'] } })).result, 'supported');
});

test('the guard applies to upper and lower bounds and wins over a passing value', () => {
  const both = [['metric_at_least', 'pr_auc', 0.25], ['metric_at_most', 'auc', 0.95]];
  const v = ready(ctx({ prFiles: ['src/fraud/model.py'], checks: both }));
  assert.equal(v.result, 'cannot_verify');
  // Both metric ACs name the guard, and the claim-wide measurement check adds the paths.
  assert.equal(v.reason.split(';').filter((r) => /model\.py/.test(r)).length, 3);
});

test('a test check is affected by the measurement guard too (benchmark B19, B20)', () => {
  const c = ctx({ prFiles: ['src/fraud/evaluate.py'], checks: [['test_passes', 'test_BANK17_gate']] });
  c.report.tests = [{ id: 'tests/test_bank17_gate.py::test_BANK17_gate', outcome: 'passed' }];
  const v = ready(c);
  assert.equal(v.result, 'cannot_verify');
  assert.match(v.reason, /evaluate\.py.*measured/);
});

test('the too-good guard still sends a leak to a human when no guarded file changed', () => {
  const v = ready(ctx({ checks: [['metric_at_most', 'auc', 0.95]], metrics: { auc: 0.983 } }));
  assert.equal(v.result, 'cannot_verify');
  assert.match(v.reason, /too good/);
});

test('a repeated benchmark is gated on its median and shows the spread', () => {
  const checks = [['metric_at_least', 'transfers_per_s', 400]];
  const prFiles = ['src/bank/ledger.py'];
  const good = ready(ctx({ checks, prFiles, metrics: { transfers_per_s: { median: 412.5, iqr_low: 401, iqr_high: 420, runs: 20 } } }));
  assert.equal(good.result, 'supported');
  const part = good.checks.find((c) => c.name === 'ac_mapped').parts[0];
  assert.match(part.reason, /median 412\.5 \(IQR 401 to 420, 20 runs\)/);
  const slow = ready(ctx({ checks, prFiles, metrics: { transfers_per_s: { median: 380, iqr_low: 360, iqr_high: 405, runs: 20 } } }));
  assert.equal(slow.result, 'contradicted');
  const missing = ready(ctx({ checks, prFiles, metrics: { transfers_per_s: { iqr_low: 1 } } }));
  assert.equal(missing.result, 'contradicted');
  assert.match(missing.reason, /not reported/);
});

test('a registered benchmark needs its form, run count, passed test and untouched setup', () => {
  const checks = [['metric_at_least', 'transfers_per_s', 400]];
  const ok = { transfers_per_s: { median: 412.5, iqr_low: 401, iqr_high: 420, runs: 20 } };
  const reason = (c) => ready(c).checks.find((k) => k.name === 'ac_mapped').parts[0];
  assert.equal(reason(ctx({ checks, prFiles: ['src/bank/ledger.py'], metrics: ok })).status, 'pass');
  assert.match(reason(ctx({ checks, prFiles: ['src/bank/ledger.py'], metrics: { transfers_per_s: 412 } })).reason, /one number/);
  assert.match(reason(ctx({ checks, prFiles: ['src/bank/ledger.py'], metrics: { transfers_per_s: { ...ok.transfers_per_s, runs: 5 } } })).reason, /5 runs; 20 are registered/);
  assert.match(reason(ctx({ checks, prFiles: ['src/bank/ledger.py', '.github/workflows/ci.yml'], metrics: ok })).reason, /workflows/);
  assert.match(reason(ctx({ checks, prFiles: ['src/bank/ledger.py'], metrics: ok, tests: [] })).reason, /missing in the report/);
});

test('each known way to fake a metric in a green run goes to a human', () => {
  const checks = [['metric_at_least', 'transfers_per_s', 400]];
  const ok = { transfers_per_s: { median: 412.5, iqr_low: 401, iqr_high: 420, runs: 20 } };
  const part = (c) => ready(ctx({ checks, metrics: ok, ...c })).checks.find((k) => k.name === 'ac_mapped').parts[0];
  const add = (file, line) => ({ prFiles: ['src/bank/ledger.py', file], patches: { 'src/bank/ledger.py': '+x = 1', [file]: `@@ -0,0 +1 @@\n+${line}` } });
  // baseline: a clean fix is judged on its number
  assert.equal(part({ prFiles: ['src/bank/ledger.py'], patches: { 'src/bank/ledger.py': '+x = 1' } }).status, 'pass');
  const cases = [
    ['a red run (a failed test)', { prFiles: ['src/bank/ledger.py'], tests: [...BENCH, { id: 'tests/test_x.py::test_y', outcome: 'failed' }] }, /failed in the report run/],
    ['a conftest anywhere (stash, metrics.pop, sessionfinish hook)', { prFiles: ['src/bank/ledger.py', 'tests/sub/conftest.py'] }, /conftest\.py/],
    ['a test that writes the metric', add('tests/test_more.py', 'record_samples("transfers_per_s", [99999.0] * 20)'), /names transfers_per_s/],
    ['a sessionfinish hook in a test module', add('tests/test_more.py', 'def pytest_sessionfinish(session):'), /touches how metrics/],
    ['a patched clock', add('tests/test_more.py', 'time.perf_counter = lambda: 0.0'), /touches how metrics/],
    ['an xfail on the benchmark', { prFiles: ['src/bank/ledger.py'], tests: [{ id: BENCH[0].id, outcome: 'skipped' }] }, /skipped in the report/],
    ['a deselected benchmark', { prFiles: ['src/bank/ledger.py'], tests: [] }, /missing in the report/],
    ['a test diff GitHub did not return', { prFiles: ['src/bank/ledger.py', 'tests/test_big.py'], patches: { 'tests/test_big.py': null } }, /not available/],
  ];
  for (const [what, c, reason] of cases) {
    const p = part(c);
    assert.equal(p.status, 'unknown', what);
    assert.match(p.reason, reason, what);
  }
});

test('a report for another commit, or a run that is not green, is not trusted for a metric', () => {
  const checks = [['metric_at_least', 'pr_auc', 0.25]];
  const old = ctx({ checks, prFiles: ['src/fraud/data.py'] });
  old.report = { ...old.report, head_sha: 'c'.repeat(40) };
  assert.equal(ready(old).result, 'cannot_verify');
  const red = ctx({ checks, prFiles: ['src/fraud/data.py'] });
  red.workflowRuns = [{ ...red.workflowRuns[0], conclusion: 'failure' }];
  assert.notEqual(ready(red).result, 'supported');
});

import { applyGuards, idsIn } from '../src/opinion.js';

test('ids in an opinion must match the evidence exactly', () => {
  assert.deepEqual(idsIn('PR #7 at b941c25 fixes AC1 of BANK-4 (E2)').sort(), ['AC1', 'BANK-4', 'E2', 'PR7', 'b941c25'].sort());
  const packet = { ticket: { key: 'BANK-32', domain: null, acs: [{ acId: 'AC1' }] }, withinNoise: false,
    sides: [{ id: 'PR5', gatesPassed: true }, { id: 'PR7', gatesPassed: true }],
    evidence: [{ id: 'E1', kind: 'diff', text: 'PR7 head b941c25: 12 changed lines' }] };
  const op = (text, risks = []) => ({ decision: 'PR7', reasons: [{ text, evidence: ['E1'] }], confidence: 0.8, risks });
  assert.equal(applyGuards(op('PR7 at b941c25 changes 12 lines (E1).'), packet).outcome, 'opinion');
  assert.equal(applyGuards(op('PR7 at b941c26 changes 12 lines.'), packet).guard, 'ungrounded-id');
  assert.equal(applyGuards(op('PR9 is smaller.'), packet).guard, 'ungrounded-id');
  assert.equal(applyGuards(op('PR7 is smaller (E1).', ['PR7 adds 40 lines.']), packet).guard, 'ungrounded-number');
});
