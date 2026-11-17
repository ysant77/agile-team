// The monitor shows only work items the viewer can see (PR 4 review, finding 2).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextEvent } from '../src/audit.js';
import { monitorForViewer } from '../src/monitor.js';

function chain(items) {
  let prev = null;
  return items.map(([event, data]) => {
    prev = nextEvent(prev, { actor: 'team-lead-verifier', event, data, at: '2026-11-13T00:00:00Z' });
    return prev;
  });
}
const verdict = (issueKey, result) => ['verdict', { issueKey, type: 'fixed', result, twin: 'Raj', origin: 'scripted', skill: 'concurrency' }];
const decision = (issueKey, by) => ['decision', { issueKey, side: 'PR5', by }];

const events = chain([
  verdict('BANK-4', 'supported'),
  verdict('HR-9', 'contradicted'),
  decision('BANK-4', 'acc-bank'),
  decision('HR-9', 'acc-hr'),
]);

test('tickets and decisions on work items the viewer cannot see are left out', async () => {
  const asked = [];
  const canSee = async (key) => { asked.push(key); return key.startsWith('BANK-'); };
  const m = await monitorForViewer(events, canSee);
  assert.deepEqual(m.tickets.map((t) => t.issueKey), ['BANK-4']);
  assert.deepEqual(m.decisions.map((d) => d.issueKey), ['BANK-4']);
  assert.ok(!JSON.stringify(m).includes('HR-9'));
  assert.ok(!JSON.stringify(m).includes('acc-hr'));
  // One check per distinct key.
  assert.deepEqual(asked.sort(), ['BANK-4', 'HR-9']);
  // The chain is still checked over every event.
  assert.equal(m.chain.ok, true);
  assert.equal(m.chain.length, 4);
});

test('a failed permission check hides the work item (fail closed)', async () => {
  const canSee = async (key) => { if (key === 'HR-9') throw new Error('HTTP 500'); return true; };
  const m = await monitorForViewer(events, canSee);
  assert.deepEqual(m.tickets.map((t) => t.issueKey), ['BANK-4']);
  assert.deepEqual(m.decisions.map((d) => d.issueKey), ['BANK-4']);
});

test('a viewer who can see nothing gets no work items', async () => {
  const m = await monitorForViewer(events, async () => false);
  assert.deepEqual(m.tickets, []);
  assert.deepEqual(m.decisions, []);
});
