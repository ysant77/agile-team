// Follow-ups from the PR 3 targeted check (16 Nov), fixed in unit 3.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arbitrate } from '../src/arbitration.js';

const side = (id, median, extra = {}) => ({ id, gatesPassed: true, metrics: { median, iqrLow: median, iqrHigh: median },
  newFailureModes: [], newDependencies: [], diffLines: 10, ...extra });
const pre = { preRegistered: { metric: 'recall', higherIsBetter: true, margin: 0.1 } };

test('arbitrate itself refuses a non-finite median: a human decides', () => {
  for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, '0.9']) {
    const d = arbitrate(pre, [side('PR5', 0.5), side('PR7', bad)]);
    assert.equal(d.winner, null, String(bad));
    assert.equal(d.decidedBy, 'human');
    assert.match(d.reason, /PR7 has no recall/);
  }
  const iqr = arbitrate(pre, [side('PR5', 0.5), side('PR7', 0.9, { metrics: { median: 0.9, iqrLow: 0.85, iqrHigh: Number.NaN } })]);
  assert.equal(iqr.winner, null);
});

test('when no side passes the gates, the record says a human decides, with a consistent label', () => {
  const d = arbitrate({}, [{ ...side('PR5', 1), gatesPassed: false }, { ...side('PR7', 1), gatesPassed: false }]);
  assert.equal(d.winner, null);
  assert.equal(d.decidedBy, 'human');
  assert.equal(d.basis, 'human_decision');
  assert.equal(d.rule, 'gates');
});
