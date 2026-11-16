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
  pr: { body: `Fix for PR${prNumber}` }, report: { metrics }, newFailureModes: [], newDependencies: [], ...extra,
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
  const t = { ...ticketWith(), labels: ['money_semantics'] };
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
