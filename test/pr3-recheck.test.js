// Re-check of PR 3 (16 Nov) and the outside review (B4). Each test failed before its fix.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arbitrate } from '../src/arbitration.js';
import { buildPacket, caseInputErrors, formatCase, formatOpinion, registeredMetrics, ticketDomain } from '../src/case.js';
import { editsOutside } from '../bakeoff/tasks/code.js';

const side = (prNumber, diffLines, metrics = {}, extra = {}) => ({
  prNumber, verdict: { result: 'supported', reason: 'all checks passed' }, diffLines, files: ['src/fraud/model.py'],
  pr: { body: '' }, report: { metrics }, newFailureModes: [], newDependencies: [], ...extra,
});
const ac = (acId, type, name, bound) => ({ acId, check: { type, args: [name, bound] } });
const ticketWith = (...acs) => ({ key: 'BANK-42', acceptanceCriteria: acs });
const upperBound = ac('AC1', 'metric_at_most', 'fpr', 0.2);
const lowerBound = ac('AC2', 'metric_at_least', 'fpr', 0.05);

test('R1: one metric registered with both directions goes to a human, in either AC order', () => {
  for (const t of [ticketWith(upperBound, lowerBound), ticketWith(lowerBound, upperBound)]) {
    const c = buildPacket({ issueKey: 'BANK-42', ticket: t, question: 'winner',
      evidence: [side(5, 10, { fpr: 0.30 }), side(7, 10, { fpr: 0.10 })] });
    assert.equal(c.arbitration.decidedBy, 'human');
    assert.equal(c.arbitration.winner, null);
    assert.equal(c.arbitration.rule, 'metric');
    assert.match(c.arbitration.reason, /fpr.*both directions/);
  }
  assert.equal(registeredMetrics(ticketWith(upperBound, lowerBound))[0].conflict, true);
  assert.match(caseInputErrors({ metric: 'fpr', higherIsBetter: false }, ticketWith(lowerBound, upperBound)).join(), /both directions/);
});

test('R2: a metric value that is not a finite number is missing, and a human decides', () => {
  const t = ticketWith(ac('AC1', 'metric_at_least', 'recall', 0.8));
  const bad = [
    JSON.parse('{"recall": 1e999}'),
    { recall: Number.NaN },
    { recall: '0.99' },
    JSON.parse('{"recall": {"median": 1e999}}'),
    { recall: { median: 0.9, iqr_low: '0.1', iqr_high: 0.95 } },
    { recall: { median: 0.9, iqr_low: 0.85, iqr_high: Number.POSITIVE_INFINITY } },
  ];
  for (const metrics of bad) {
    const c = buildPacket({ issueKey: 'BANK-42', ticket: t, question: 'winner', evidence: [side(5, 10, { recall: 0.5 }), side(7, 10, metrics)] });
    assert.equal(c.arbitration.decidedBy, 'human', JSON.stringify(metrics));
    assert.match(c.arbitration.reason, /PR7 has no recall/);
  }
  // A finite median with the IQR fields absent still counts.
  const ok = buildPacket({ issueKey: 'BANK-42', ticket: t, question: 'winner', evidence: [side(5, 10, { recall: 0.5 }), side(7, 10, { recall: { median: 0.9 } })] });
  assert.equal(ok.arbitration.decidedBy, 'code-metric');
});

const tie = (a, b) => [
  { id: 'PR5', gatesPassed: true, newFailureModes: [], newDependencies: [], diffLines: 10, ...a },
  { id: 'PR7', gatesPassed: true, newFailureModes: [], newDependencies: [], diffLines: 200, ...b },
];

test('R3: smaller diff, fewer dependencies or fewer failure modes only recommend; a human decides', () => {
  const cases = [
    [tie({}, {}), 'PR5', 'smaller diff'],
    [tie({ newDependencies: ['requests'] }, {}), 'PR7', 'no new dependency'],
    [tie({}, { newFailureModes: ['stale cache'] }), 'PR5', 'fewer new failure modes'],
  ];
  for (const [sides, id, rule] of cases) {
    const d = arbitrate({}, sides);
    assert.equal(d.decidedBy, 'human');
    assert.equal(d.winner, null);
    assert.equal(d.basis, 'recommendation');
    assert.deepEqual({ id: d.recommendation.id, rule: d.recommendation.rule }, { id, rule });
    assert.ok(d.sides.every((s) => s.outcome === 'pending'));
  }
});

test('R3: the record keeps verified by code, recommendation and human decision apart', () => {
  const gate = arbitrate({}, [{ id: 'PR5', gatesPassed: true }, { id: 'PR7', gatesPassed: false }]);
  assert.equal(gate.basis, 'verified_by_code');
  assert.equal(gate.recommendation, null);
  const none = arbitrate({}, tie({}, { diffLines: 10 }));
  assert.equal(none.basis, 'human_decision');
  assert.equal(none.recommendation, null);
  const c = buildPacket({ issueKey: 'BANK-42', ticket: ticketWith(), question: 'winner', evidence: [side(5, 10), side(7, 200)] });
  assert.equal(c.arbitration.basis, 'recommendation');
  assert.equal(c.opinionAllowed, true);
  const text = formatCase('BANK-42', c);
  assert.match(text, /Recommended, not verified: PR5 \(smaller diff\)/);
  assert.match(text, /A human decides/);
  assert.doesNotMatch(text, /Decided by code/);
  // An opinion that differs from a recommendation is not "against the code result".
  const record = { outcome: 'opinion', opinion: { decision: 'PR7', reasons: [], risks: [], confidence: 0.6 }, promptVersion: 'v', inputHash: 'abcdef0123456789', reasons: [] };
  const said = formatOpinion('BANK-42', record, c.arbitration);
  assert.doesNotMatch(said, /code result/);
  assert.match(said, /differs from the recommendation PR5 \(smaller diff\)/);
});

test('R4: a bake-off reply whose edits are not a list is refused, not thrown', () => {
  const bug = { files: ['src/a.py'] };
  for (const edits of ['src/a.py', { path: 'src/a.py' }, 7, [{ path: 5 }], [null]]) {
    assert.doesNotThrow(() => editsOutside(bug, edits));
    assert.ok(editsOutside(bug, edits).length > 0, JSON.stringify(edits));
  }
  assert.deepEqual(editsOutside(bug, [{ path: 'src/a.py' }]), []);
  assert.deepEqual(editsOutside(bug, undefined), []);
});

test('R5: the domain comes only from the stored ticket spec; Jira labels are not read', () => {
  assert.equal(ticketDomain({ domain: 'fairness' }), 'fairness');
  assert.equal(ticketDomain({ labels: ['money_semantics'] }), null);
});
