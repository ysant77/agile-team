// Monitor view: chain check, ticket outcomes and posterior replay from verdict events.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextEvent } from '../src/audit.js';
import { buildMonitor, parseTwin, ticketReward } from '../src/monitor.js';

function chain(items) {
  let prev = null;
  return items.map(([event, data]) => {
    prev = nextEvent(prev, { actor: 'team-lead-verifier', event, data, at: '2026-11-13T00:00:00Z' });
    return prev;
  });
}
const v = (issueKey, result, extra = {}) => ['verdict', { issueKey, type: 'fixed', result, twin: 'Raj', origin: 'scripted', skill: 'concurrency', ...extra }];

test('the twin and origin come only from the generator line in the PR body', () => {
  assert.deepEqual(parseTwin('Twin change: scripted (Raj). Scenario S04: x'), { origin: 'scripted', twin: 'Raj' });
  assert.deepEqual(parseTwin('Twin change: live (Kai).'), { origin: 'live', twin: 'Kai' });
  assert.deepEqual(parseTwin('written by raj'), { origin: null, twin: null });
  assert.deepEqual(parseTwin(undefined), { origin: null, twin: null });
});

test('reward follows the design: 1, then 0.5 after one contradiction, 0 after two', () => {
  assert.equal(ticketReward(0), 1);
  assert.equal(ticketReward(1), 0.7);
  assert.equal(ticketReward(2), 0.4);
});

test('S04 shape: a contradicted claim then a supported one closes the ticket with reward 0.7', () => {
  const m = buildMonitor(chain([v('BANK-4', 'contradicted'), v('BANK-4', 'supported'), v('BANK-4', 'supported')]));
  assert.equal(m.chain.ok, true);
  assert.equal(m.chain.headSeq, 2);
  const t = m.tickets[0];
  assert.equal(t.reward, 0.7);
  assert.equal(t.claims.length, 3);
  assert.equal(m.outcomes, 1);
  const p = m.posteriors[0];
  assert.equal(p.twin, 'Raj');
  assert.equal(p.outcomes, 1);
  assert.equal(p.alpha, 1.65);
  assert.equal(p.beta, 1.25);
});

test('a twin whose first claim holds ranks above one who needed a second try', () => {
  const m = buildMonitor(chain([
    v('BANK-4', 'contradicted'), v('BANK-4', 'supported'),
    v('BANK-5', 'supported', { twin: 'Kai' }),
  ]));
  assert.deepEqual(m.posteriors.map((p) => p.twin), ['Kai', 'Raj']);
});

test('tickets without a twin and non-verdict events give no posterior update', () => {
  const m = buildMonitor(chain([['requirement.approved', { key: 'BANK-3' }], v('BANK-3', 'supported', { twin: null, origin: null })]));
  assert.equal(m.outcomes, 0);
  assert.equal(m.tickets[0].origin, null);
  assert.deepEqual(m.posteriors, []);
});

test('a tampered event fails the chain check', () => {
  const events = chain([v('BANK-4', 'contradicted'), v('BANK-4', 'supported')]);
  events[0] = { ...events[0], data: { ...events[0].data, result: 'supported' } };
  const m = buildMonitor(events);
  assert.equal(m.chain.ok, false);
  assert.equal(m.chain.reason, 'hash mismatch');
});

test('decisions are listed with the author account id and do not touch the posterior', () => {
  const m = buildMonitor(chain([
    v('BANK-32', 'supported'),
    ['decision', { issueKey: 'BANK-32', side: 'PR7', by: 'acc-123', agreesWithCode: false, agreesWithOpinion: true, overridesFailedGate: false }],
  ]));
  assert.equal(m.decisions.length, 1);
  assert.equal(m.decisions[0].by, 'acc-123');
  assert.equal(m.decisions[0].agreesWithCode, false);
  assert.equal(m.outcomes, 1);
  assert.ok(m.notes.some((n) => /Any user who can comment/.test(n)));
});
