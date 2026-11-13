import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lintRequirement } from '../src/lint.js';

test('lint accepts a plural actor', () => {
  const draft = (description) => ({ summary: 'Send button on phones', description,
    acceptanceCriteria: [{ acId: 'AC1', statement: 's', check: { type: 'manual', args: [] } }] });
  const rules = (d) => lintRequirement(draft(d)).findings.map((f) => f.rule);
  assert.ok(!rules('On phones, users see the Send button').includes('no-actor'));
  assert.ok(rules('On phones, the Send button is visible').includes('no-actor'));
});

import { ticketGrounding } from '../src/index.js';

test('a ticket may not invent a number, unit or threshold (live case of 13 Nov: 3 s on 3G)', () => {
  const request = 'The login page should work better on slow networks.';
  const invented = {
    request,
    summary: 'Reduce login page load time on 3G networks',
    description: 'A user sees the login page load within 3 seconds on a 3G network.',
    acceptanceCriteria: 'AC1 | The login page loads within 3 seconds on a 3G network | metric_at_most(page_load_time_3g, 3)',
    storyPoints: 3,
  };
  assert.match(ticketGrounding(invented), /not in the request: 3/);
  const open = {
    request,
    summary: 'Measure login page load time on slow networks',
    description: 'A user sees the login page load on a slow network. Open question: what load time and which network speed?',
    acceptanceCriteria: 'AC1 | The PM sets the load time target with the user | manual()',
    storyPoints: 3,
  };
  assert.equal(ticketGrounding(open), null);
  assert.equal(ticketGrounding({ ...invented, request: 'Pages must load in 3 seconds on 3G.' }), null);
  assert.match(ticketGrounding({ ...open, request: '' }), /Pass the user's request/);
});
