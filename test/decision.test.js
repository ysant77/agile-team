// Human decision comments on arbitration cases (DESIGN 6c, gap 4).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDecision, formatDecision, parseDecision } from '../src/decision.js';

const kase = {
  prNumbers: [5, 7],
  arbitration: { winner: 'PR5', decidedBy: 'code', rule: 'smaller diff' },
  packet: { sides: [{ id: 'PR5', gatesPassed: true }, { id: 'PR7', gatesPassed: true }] },
  opinions: [
    { outcome: 'invalid_opinion', opinion: { decision: 'PR5' } },
    { outcome: 'opinion', opinion: { decision: 'PR7' } },
  ],
};
const meta = { by: 'acc-1', at: '2026-11-13T05:00:00Z' };

test('the decision comment is parsed; other text is not a decision', () => {
  assert.deepEqual(parseDecision('decision: PR7 because the lock table is clearer'), { prNumber: 7, reason: 'the lock table is clearer' });
  assert.deepEqual(parseDecision('Decision: PR #7 because  two\nlines'), { prNumber: 7, reason: 'two lines' });
  assert.equal(parseDecision('claim: fixed'), null);
  assert.equal(parseDecision('decision: PR7'), null);
  assert.equal(parseDecision('I think decision: PR7 because x'), null);
});

test('an override of code is recorded with the agreement fields', () => {
  const r = applyDecision(kase, parseDecision('decision: PR7 because easier to read'), meta);
  assert.equal(r.ok, true);
  assert.equal(r.record.side, 'PR7');
  assert.equal(r.record.agreesWithCode, false);
  assert.equal(r.record.opinionSide, 'PR7');
  assert.equal(r.record.agreesWithOpinion, true);
  assert.equal(r.kase.decisions.length, 1);
  const text = formatDecision('BANK-32', r.record);
  assert.match(text, /overrides the code decision \(PR5\)/);
  assert.match(text, /opinion \(not verified\) preferred PR7; the decision agrees/);
});

test('a discarded opinion does not count as the opinion side', () => {
  const r = applyDecision({ ...kase, opinions: [kase.opinions[0]] }, parseDecision('decision: PR5 because smaller diff'), meta);
  assert.equal(r.record.opinionSide, null);
  assert.equal(r.record.agreesWithOpinion, null);
  assert.equal(r.record.agreesWithCode, true);
});

test('no case, a PR outside the case, or a short reason is refused', () => {
  assert.equal(applyDecision(null, parseDecision('decision: PR5 because fine reason'), meta).ok, false);
  assert.match(applyDecision(kase, parseDecision('decision: PR9 because fine reason'), meta).error, /not in the case/);
  assert.match(applyDecision(kase, parseDecision('decision: PR5 because ok'), meta).error, /at least 5/);
});

test('choosing a side that failed a gate is allowed but flagged', () => {
  const failed = { ...kase, packet: { sides: [{ id: 'PR5', gatesPassed: true }, { id: 'PR7', gatesPassed: false }] } };
  const r = applyDecision(failed, parseDecision('decision: PR7 because product wants it'), meta);
  assert.equal(r.record.overridesFailedGate, true);
  assert.match(formatDecision('BANK-32', r.record), /Warning: PR7 failed a gate/);
});
