import assert from 'node:assert/strict';
import { test } from 'node:test';

import { advised, applyGuards, LABEL, packetHash, validateOpinion } from '../src/opinion.js';

const packet = (over = {}) => ({
  ticket: { key: 'BANK-32', domain: null, acs: [{ acId: 'AC1' }] },
  sides: [
    { id: 'A', gatesPassed: true },
    { id: 'B', gatesPassed: true },
    { id: 'C', gatesPassed: false },
  ],
  evidence: [
    { id: 'E1', kind: 'metric', text: 'A p95 latency 41 ms, B 43 ms; noise margin 5 ms' },
    { id: 'E2', kind: 'diff', text: 'A changes 12 lines in one file; B changes 140 lines in 6 files' },
  ],
  withinNoise: true,
  ...over,
});

const opinion = (over = {}) => ({
  decision: 'A',
  reasons: [{ text: 'A changes 12 lines against 140 for B, so it is easier to review', evidence: ['E2'] }],
  confidence: 0.8,
  risks: ['B may carry unrelated changes'],
  ...over,
});

test('a grounded opinion on a non-metric reason stands as advice, and a human still decides', () => {
  const record = applyGuards(opinion(), packet(), { model: 'm', digest: 'd' });
  assert.equal(record.outcome, 'opinion');
  assert.equal(record.finalDecision, 'human');
  assert.equal(record.label, LABEL);
  assert.equal(record.inputHash, packetHash(packet()));
  assert.equal(advised(record), 'A');
});

test('an invalid opinion is discarded', () => {
  for (const raw of ['not json', '[]', { decision: 'A' }, opinion({ confidence: 1.4 }), opinion({ reasons: [] }),
    opinion({ reasons: Array(6).fill({ text: 'x', evidence: ['E2'] }) }), opinion({ reasons: [{ text: 'x', evidence: [] }] })]) {
    const record = applyGuards(raw, packet());
    assert.equal(record.outcome, 'invalid_opinion', JSON.stringify(raw));
    assert.equal(record.guard, 'schema');
    assert.equal(advised(record), 'human');
  }
  assert.equal(validateOpinion(JSON.stringify(opinion())).ok, true);
});

test('an opinion cannot pick a side that failed a gate', () => {
  const record = applyGuards(opinion({ decision: 'C' }), packet());
  assert.equal(record.outcome, 'invalid_opinion');
  assert.equal(record.guard, 'failed-gate');
});

test('unknown sides and unknown evidence are rejected', () => {
  assert.equal(applyGuards(opinion({ decision: 'Z' }), packet()).guard, 'unknown-side');
  const cites = opinion({ reasons: [{ text: 'A is simpler', evidence: ['E9'] }] });
  assert.equal(applyGuards(cites, packet()).guard, 'unknown-evidence');
});

test('a number that is not in the evidence discards the opinion', () => {
  const made_up = opinion({ reasons: [{ text: 'A is 30% faster', evidence: ['E1'] }] });
  const record = applyGuards(made_up, packet({ withinNoise: false }));
  assert.equal(record.guard, 'ungrounded-number');
  // Ids such as AC1 and BANK-32 are not treated as made-up numbers.
  const ids = opinion({ reasons: [{ text: 'AC1 of BANK-32 holds for A, 12 lines', evidence: ['E2'] }] });
  assert.equal(applyGuards(ids, packet()).outcome, 'opinion');
});

test('low confidence hands the case to a human', () => {
  const record = applyGuards(opinion({ confidence: 0.69 }), packet());
  assert.equal(record.outcome, 'human');
  assert.equal(record.guard, 'low-confidence');
});

test('a high-stake domain gets a summary only', () => {
  for (const domain of ['money_semantics', 'security_exception', 'data_repair', 'model_risk', 'fairness']) {
    const record = applyGuards(opinion({ confidence: 0.99 }), packet({ ticket: { key: 'BANK-33', domain, acs: [] } }));
    assert.equal(record.outcome, 'summary_only', domain);
    assert.equal(advised(record), 'human');
  }
});

test('a metric-only reason inside the noise goes to a human', () => {
  const metricOnly = opinion({ reasons: [{ text: 'A has 41 ms against 43 ms', evidence: ['E1'] }] });
  assert.equal(applyGuards(metricOnly, packet()).guard, 'noise');
  assert.equal(applyGuards(metricOnly, packet({ withinNoise: false })).outcome, 'opinion');
});

test('the model may ask for a human itself', () => {
  assert.equal(applyGuards(opinion({ decision: 'human' }), packet()).outcome, 'human');
});
