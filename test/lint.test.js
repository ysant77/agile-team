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

test('lint v3: bare counts and HTTP codes from a fixed list are allowed; quantities still need a source', async () => {
  const { lintRequirement, LINT_VERSION } = await import('../src/lint.js');
  assert.equal(LINT_VERSION, 3);
  const request = ['A tester saw another customer\'s statement by changing the number in the URL.'];
  const draft = (description, statement = 'the API refuses the request') => ({ summary: 'Owner check on statements', description,
    acceptanceCriteria: [{ acId: 'AC1', statement, check: { type: 'manual', args: [] } }] });
  const ungrounded = (d) => lintRequirement(d, request).findings.filter((f) => f.rule === 'ungrounded-number').map((f) => f.message.split(' ')[0]);
  assert.deepEqual(ungrounded(draft('The API returns 404 for another customer\'s account and logs 2 fields.')), []);
  assert.deepEqual(ungrounded(draft('The API returns 418 for another customer\'s account.')), ['418']);
  assert.deepEqual(ungrounded(draft('The page loads within 3 seconds on a 3G network.')), ['3']);
  assert.deepEqual(ungrounded(draft('The service handles 5 requests per second.')), ['5']);
  assert.deepEqual(ungrounded(draft('Twenty threads run; 20 threads withdraw at once.')), ['20']);
  assert.deepEqual(ungrounded(draft('The balance never goes below 0.00.')), ['0.00']);
});
