// Independent review of unit 2 (16 Nov), findings 1 to 6. Each test failed before its fix.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arbitrate } from '../src/arbitration.js';
import { buildPacket, caseInputErrors } from '../src/case.js';
import { applyGuards } from '../src/opinion.js';
import { editsOutside } from '../bakeoff/tasks/code.js';
import { safeEnv } from '../bakeoff/repo.js';

const side = (prNumber, diffLines, metrics = {}, extra = {}) => ({
  prNumber, verdict: { result: 'supported', reason: 'all checks passed' }, diffLines, files: ['src/fraud/model.py'],
  pr: { body: `Fix for PR${prNumber}` }, report: { job_id: 'job-1', metrics }, newFailureModes: [], newDependencies: [], ...extra,
});
const ac = (type, name, bound) => ({ acId: 'AC1', check: { type, args: [name, bound] } });
const ticketWith = (...acs) => ({ key: 'BANK-42', acceptanceCriteria: acs, labels: [] });

test('U1: the metric direction comes from the ticket AC: a lower false positive rate wins', () => {
  const c = buildPacket({ issueKey: 'BANK-42', ticket: ticketWith(ac('metric_at_most', 'fpr', 0.2)), question: 'winner',
    evidence: [side(5, 10, { fpr: 0.30 }), side(7, 10, { fpr: 0.10 })] });
  assert.equal(c.arbitration.decidedBy, 'code-metric');
  assert.equal(c.arbitration.winner, 'PR7');
});

test('U1: a direction or metric in the payload that disagrees with the ticket is refused', () => {
  const t = ticketWith(ac('metric_at_most', 'fpr', 0.2));
  assert.match(caseInputErrors({ metric: 'fpr', higherIsBetter: true }, t).join(), /direction/);
  assert.match(caseInputErrors({ metric: 'recall' }, t).join(), /not a registered metric/);
  assert.deepEqual(caseInputErrors({ metric: 'fpr', higherIsBetter: false }, t), []);
  assert.deepEqual(caseInputErrors({}, t), []);
});

test('U2: the domain comes from the ticket; a payload domain that disagrees is refused', () => {
  const t = { ...ticketWith(), domain: 'money_semantics' };
  const c = buildPacket({ issueKey: 'BANK-42', ticket: t, question: 'winner', evidence: [side(5, 10), side(7, 200)] });
  assert.equal(c.arbitration.decidedBy, 'human');
  assert.equal(c.arbitration.rule, 'domain');
  assert.match(caseInputErrors({ domain: 'fairness' }, t).join(), /domain/);
  assert.match(caseInputErrors({ domain: 'fairness' }, ticketWith()).join(), /domain/);
});

test('U2: two registered metrics make the metric disputed, and a human decides', () => {
  const t = ticketWith(ac('metric_at_most', 'fpr', 0.2), { ...ac('metric_at_least', 'recall', 0.8), acId: 'AC2' });
  const c = buildPacket({ issueKey: 'BANK-42', ticket: t, question: 'winner',
    evidence: [side(5, 10, { fpr: 0.3, recall: 0.9 }), side(7, 200, { fpr: 0.1, recall: 0.8 })] });
  assert.equal(c.arbitration.decidedBy, 'human');
  assert.equal(c.arbitration.rule, 'metric');
});

test('U3: an unknown input in a tie-break rule sends the case to a human', () => {
  const unknownModes = arbitrate({}, [
    { id: 'PR5', gatesPassed: true, newFailureModes: null, newDependencies: [], diffLines: 10 },
    { id: 'PR7', gatesPassed: true, newFailureModes: [], newDependencies: [], diffLines: 200 },
  ]);
  assert.equal(unknownModes.decidedBy, 'human');
  assert.match(unknownModes.reason, /PR5: new failure modes not known/);
  const unknownDiff = arbitrate({}, [
    { id: 'PR5', gatesPassed: true, newFailureModes: [], newDependencies: [], diffLines: null },
    { id: 'PR7', gatesPassed: true, newFailureModes: [], newDependencies: [], diffLines: 200 },
  ]);
  assert.equal(unknownDiff.decidedBy, 'human');
  // The case builder no longer claims "no new failure modes" when nothing measured them.
  const c = buildPacket({ issueKey: 'BANK-42', ticket: ticketWith(), question: 'winner',
    evidence: [side(5, 10, {}, { newFailureModes: undefined }), side(7, 200, {}, { newFailureModes: undefined })] });
  assert.equal(c.arbitration.decidedBy, 'human');
});

test('U4: a registered metric missing on a side that passes the gates sends the case to a human', () => {
  const c = buildPacket({ issueKey: 'BANK-42', ticket: ticketWith(ac('metric_at_least', 'recall', 0.8)), question: 'winner',
    evidence: [side(5, 10, { recall: 0.9 }), side(7, 200, {})] });
  assert.equal(c.arbitration.decidedBy, 'human');
  assert.match(c.arbitration.reason, /PR7 has no recall/);
});

test('U5: a PR description is author text and does not ground a number', () => {
  const c = buildPacket({ issueKey: 'BANK-42', ticket: ticketWith(), question: 'design',
    evidence: [side(5, 10, {}, { pr: { body: 'Recall is 0.99' } }), side(7, 200)] });
  const body = c.packet.evidence.find((e) => e.text.includes('Recall is 0.99'));
  assert.equal(body.kind, 'pr_text');
  const r = applyGuards({ decision: 'PR5', reasons: [{ text: 'PR5 has recall 0.99', evidence: [body.id] }], confidence: 0.8, risks: [] }, c.packet);
  assert.equal(r.guard, 'ungrounded-number');
});

test('U6: model code runs without secrets in its environment', () => {
  const env = safeEnv({ PATH: '/bin', HOME: '/h', GITHUB_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'y', FORGE_API_TOKEN: 'z', LANG: 'C' });
  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'LANG', 'PATH']);
});

test('U6: an edit outside the bug files is refused before anything runs', () => {
  const bug = { files: ['src/bank/ledger.py'] };
  assert.deepEqual(editsOutside(bug, [{ path: 'src/bank/ledger.py' }, { path: 'tests/conftest.py' }, { path: 'pyproject.toml' }]), ['tests/conftest.py', 'pyproject.toml']);
  assert.deepEqual(editsOutside(bug, [{ path: 'src/bank/ledger.py' }]), []);
});

test('U3: a PR size without line counts is unknown, not 0', async () => {
  const { collectPrStats } = await import('../src/github-evidence.js');
  const fetchFn = async (url) => ({ ok: true, status: 200, json: async () => (/\/files/.test(url) ? [] : {}) });
  assert.equal((await collectPrStats({ repo: 'o/r', prNumber: 3, fetchFn })).diffLines, null);
});

test('U7: a PR picked by number is marked unlinked when it is a fork or does not name the key; numbers may not repeat', async () => {
  const { collectGithub } = await import('../src/github-evidence.js');
  const { parseCaseInput } = await import('../src/case-actions.js');
  const pull = (number, title, full) => ({ number, title, state: 'open', head: { ref: 'b', sha: 'a'.repeat(40), repo: { full_name: full } } });
  const fetchWith = (pulls) => async (url) => {
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    const body = /\/pulls\?/.test(url) ? (page === 1 ? pulls : []) : /\/files|\/comments/.test(url) ? [] : /\/actions\/runs/.test(url) ? { workflow_runs: [] } : null;
    return body === null ? { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } } : { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
  };
  const fork = await collectGithub({ repo: 'o/r', key: 'BANK-42', prNumber: 5, fetchFn: fetchWith([pull(5, 'BANK-42 fix', 'evil/r')]) });
  assert.equal(fork.pr.linked, false);
  const other = await collectGithub({ repo: 'o/r', key: 'BANK-42', prNumber: 5, fetchFn: fetchWith([pull(5, 'BANK-7 fix', 'o/r')]) });
  assert.equal(other.pr.linked, false);
  const good = await collectGithub({ repo: 'o/r', key: 'BANK-42', prNumber: 5, fetchFn: fetchWith([pull(5, 'BANK-42 fix', 'o/r')]) });
  assert.equal(good.pr.linked, true);
  assert.match(parseCaseInput({ issueKey: 'BANK-42', prNumbers: '5,5' }).errors.join(), /repeat/);
});

test('U9: the metric margin works for negative values', () => {
  const s = (id, v) => ({ id, gatesPassed: true, metrics: { median: v, iqrLow: v, iqrHigh: v }, newFailureModes: [], newDependencies: [], diffLines: 10 });
  const close = arbitrate({ preRegistered: { metric: 'pnl', higherIsBetter: true, margin: 0.1 } }, [s('PR5', -1.9), s('PR7', -2.0)]);
  assert.notEqual(close.decidedBy, 'code-metric');
  const clear = arbitrate({ preRegistered: { metric: 'pnl', higherIsBetter: true, margin: 0.1 } }, [s('PR5', -1.0), s('PR7', -2.0)]);
  assert.equal(clear.winner, 'PR5');
});

test('U11: the too-good guard covers every AUC name, and guarded paths ignore case and sub-folders', async () => {
  const { metricCompare } = await import('../src/verifier/checks.js');
  const sha = 'a'.repeat(40);
  const ctx = (metrics, prFiles = ['src/bank/service.py']) => ({
    ticket: { key: 'BANK-17' }, pr: { headSha: sha }, prFiles,
    report: { schema: 'aat-ci-report/1', head_sha: sha, tests: [], metrics, workflow_files: { '.github/workflows/ci.yml': 'h' } },
    reportAuthor: 'github-actions[bot]', baseWorkflowFiles: { '.github/workflows/ci.yml': 'h' },
    reportComment: { createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' },
    workflowRuns: [{ path: '.github/workflows/ci.yml', headSha: sha, status: 'completed', conclusion: 'success', createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:30Z' }],
    config: { requiredWorkflowPaths: ['.github/workflows/ci.yml'], tooGood: { auc: 0.95 }, guardedPaths: ['src/fraud/evaluate.py', 'src/bank/testing/'] },
  });
  for (const name of ['auc', 'pr_auc', 'AUC', 'roc_auc']) {
    assert.equal(metricCompare(ctx({ [name]: 0.999 }), name, 0.5, 'min').status, 'unknown', name);
  }
  assert.equal(metricCompare(ctx({ recall: 0.999 }), 'recall', 0.5, 'min').status, 'pass');
  for (const f of ['src/fraud/sub/evaluate.py', 'src/bank/Testing/x.py', 'SRC/fraud/evaluate.py']) {
    assert.equal(metricCompare(ctx({ recall: 0.9 }, [f]), 'recall', 0.5, 'min').status, 'unknown', f);
  }
});

test('U12: the protocol text is in the repository and the report header states the full rule', async () => {
  const { readFileSync } = await import('node:fs');
  const doc = readFileSync('docs/model-selection.md', 'utf8');
  for (const part of ['bootstrap', 'repeat', 'tie-break', 'scorer version']) assert.match(doc, new RegExp(part, 'i'));
  assert.match(readFileSync('bakeoff/report.js', 'utf8'), /spreads? across repeats do not overlap/);
});

test('U10: an opinion that prefers another PR than the code result says so', async () => {
  const { formatOpinion } = await import('../src/case.js');
  const record = { outcome: 'opinion', reasons: [], opinion: { decision: 'PR7', reasons: [], risks: [], confidence: 0.8 }, promptVersion: 'p', inputHash: 'a'.repeat(64) };
  assert.match(formatOpinion('BANK-42', record, { winner: 'PR5', rule: 'smaller diff' }), /prefers PR7, against the code result PR5 \(smaller diff\)/);
});
