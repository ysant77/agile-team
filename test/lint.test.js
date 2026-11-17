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
  assert.equal(LINT_VERSION, 6);
  const request = ['A tester saw another customer\'s statement by changing the number in the URL.'];
  const draft = (description, statement = 'the API refuses the request') => ({ summary: 'Owner check on statements', description,
    acceptanceCriteria: [{ acId: 'AC1', statement, check: { type: 'manual', args: [] } }] });
  const ungrounded = (d) => lintRequirement(d, request).findings.filter((f) => f.rule === 'ungrounded-number').map((f) => f.message.split(' ')[0]);
  // Version 5: a bare count is a number like any other and needs a source.
  assert.deepEqual(ungrounded(draft('The API returns 404 for another customer\'s account and logs 2 fields.')), ['2']);
  assert.deepEqual(ungrounded(draft('The API returns 418 for another customer\'s account.')), ['418']);
  assert.deepEqual(ungrounded(draft('The page loads within 3 seconds on a 3G network.')), ['3']);
  assert.deepEqual(ungrounded(draft('The service handles 5 requests per second.')), ['5']);
  assert.deepEqual(ungrounded(draft('Twenty threads run; 20 threads withdraw at once.')), ['20']);
  assert.deepEqual(ungrounded(draft('The balance never goes below 0.00.')), ['0.00']);
});

test('lint: a status code before a unit and a count of an open noun need a source', () => {
  const request = ['A tester saw another customer\'s statement by changing the number in the URL.'];
  const draft = (description) => ({ summary: 'Owner check on statements', description,
    acceptanceCriteria: [{ acId: 'AC1', statement: 'the API refuses the request', check: { type: 'manual', args: [] } }] });
  const ungrounded = (d) => lintRequirement(draft(d), request).findings
    .filter((f) => f.rule === 'ungrounded-number').map((f) => f.message.split(' ')[0]);
  assert.deepEqual(ungrounded('The API returns 500 ms after a call.'), ['500']);
  assert.deepEqual(ungrounded('The customer gets 200 EUR back.'), ['200']);
  assert.deepEqual(ungrounded('The API returns 200 % of the fee.'), ['200']);
  assert.deepEqual(ungrounded('The account locks after 5 failures.'), ['5']);
  assert.deepEqual(ungrounded('The code has 6 digits.'), ['6']);
  assert.deepEqual(ungrounded('At most 9 users see the page.'), ['9']);
  // Still allowed: a status code with no unit. Version 5: an ungrounded count is flagged.
  assert.deepEqual(ungrounded('The API returns 404 and logs 2 fields.'), ['2']);
});

test('lint v5: only a status code used as a status is allowed without a source', () => {
  const request = ['A tester saw another customer\'s statement by changing the number in the URL. Show 3 tabs.'];
  const draft = (description) => ({ summary: 'Owner check on statements', description,
    acceptanceCriteria: [{ acId: 'AC1', statement: 'the API refuses the request', check: { type: 'manual', args: [] } }] });
  const ungrounded = (d) => lintRequirement(draft(d), request).findings
    .filter((f) => f.rule === 'ungrounded-number').map((f) => f.message.split(' ')[0]);
  // Invented thresholds from the re-check of PR 5: each one must be flagged.
  const invented = {
    'The API returns 500 milliseconds after a call.': '500',
    'The customer gets 200 dollars back.': '200',
    'The customer gets 200 € back.': '200',
    'The customer gets 400 INR back.': '400',
    'The API returns 404 items.': '404',
    'The API returns 500/s.': '500',
    'The API returns 429 calls.': '429',
    'Users keep 9 tabs open at most.': '9',
  };
  for (const [d, n] of Object.entries(invented)) assert.deepEqual(ungrounded(d), [n], d);
  // Allowed: a status code with nothing after it, or an error/status word or a clause word.
  for (const d of [
    'The API returns 404.',
    'The API gives a 500 error.',
    'The API responds with 201 when the user saves.',
    'The API returns 403 for another customer\'s account.',
    'The API returns 409, and the page shows the error.',
    'The API returns HTTP 401 if the token is old.',
    'Users see 3 tabs.',
  ]) assert.deepEqual(ungrounded(d), [], d);
});

test('lint v5: "and" or "or" after a status code does not hide a quantity', () => {
  const draft = (description) => ({ summary: 'Refund limit', description,
    acceptanceCriteria: [{ acId: 'AC1', statement: 'the refund is limited', check: { type: 'manual', args: [] } }] });
  const ungrounded = (d) => lintRequirement(draft(d), ['A customer asked for a refund.']).findings
    .filter((f) => f.rule === 'ungrounded-number').map((f) => f.message.split(' ')[0]);
  for (const d of ['The customer gets 200 or more credits.', 'The API returns 500 and above per call.', 'It gets 300 or fewer items.']) {
    assert.equal(ungrounded(d).length, 1, d);
  }
  assert.deepEqual(ungrounded('The API returns 409 or refuses the body.'), []);
});

// Final review of PR 5. One helper for the tests below.
function ungroundedFor(request) {
  return (description, acs = [{ acId: 'AC1', statement: 'the API refuses the request', check: { type: 'manual', args: [] } }]) =>
    lintRequirement({ summary: 'Owner check on statements', description, acceptanceCriteria: acs }, [request]).findings
      .filter((f) => f.rule === 'ungrounded-number').map((f) => f.message.split(' ')[0]);
}

test('lint v6: only an issue key or AC id from the request or the draft is stripped', async () => {
  const { LINT_VERSION } = await import('../src/lint.js');
  assert.equal(LINT_VERSION, 6);
  const ungrounded = ungroundedFor('A customer saw the wrong balance, see KAN-12.');
  const invented = {
    'The job stops after TIMEOUT-30 seconds.': '30',
    'The export reads LIMIT-1000 rows.': '1000',
    'The client makes MAX-5 retries.': '5',
    'The page keeps P-95 latency low.': '95',
    'The fix waits for KAN-77 first.': '77',
  };
  for (const [d, n] of Object.entries(invented)) assert.deepEqual(ungrounded(d), [n], d);
  assert.deepEqual(ungrounded('The fix links KAN-12.'), []);
  const acs = [
    { acId: 'AC1', statement: 'the API refuses the request', check: { type: 'manual', args: [] } },
    { acId: 'AC2', statement: 'the page shows the error after AC1', check: { type: 'blocked_by_done', args: ['KAN-12'] } },
  ];
  assert.deepEqual(ungrounded('The API refuses the request.', acs), []);
});

test('lint v6: text is normalised, and a plural noun, a unit or a test name hides no number', () => {
  const ungrounded = ungroundedFor('A customer saw the wrong balance.');
  const check = (type, args) => [{ acId: 'AC1', statement: 'the API refuses the request', check: { type, args } }];
  const invented = {
    'The API returns 500 errors.': ['500'],
    'The API gets 200 responses per minute.': ['200'],
    'The API returns 500\nms after a call.': ['500'],
    'The API returns 500\n\tms after a call.': ['500'],
    'The page loads in ５ seconds.': ['5'],
    'The story is 4 points.': ['4'],
  };
  for (const [d, n] of Object.entries(invented)) assert.deepEqual(ungrounded(d), n, d);
  assert.ok(ungrounded('The page loads in ½ second.').length > 0, 'a vulgar fraction is a number');
  assert.deepEqual(ungrounded('The API refuses the request.', check('test_passes', ['test_500ms'])), ['500']);
  assert.deepEqual(ungrounded('The API refuses the request.', check('test_passes', ['test_BANK2_owner_check'])), []);
  for (const d of [
    'The API returns 500 error.',
    'The API returns 404 status.',
    'The API returns 404',
    'The story is 5 points.',
  ]) assert.deepEqual(ungrounded(d), [], d);
});

test('lint v6: list markers, status phrases, joined codes and thousands separators are not flagged', () => {
  const ungrounded = ungroundedFor('Exports of 1,000 rows time out for the customer.');
  for (const d of [
    '1. The API refuses the request.\n2) The page shows the error.',
    'The API returns 200 OK.',
    'The API returns 404 Not Found for another account.',
    'The API returns 200 and 404.',
    'The API returns 401, 403 or 404.',
    'The export of 1000 rows finishes.',
    'The export of 1,000 rows finishes.',
  ]) assert.deepEqual(ungrounded(d), [], d);
  // Still flagged.
  assert.deepEqual(ungrounded('The API returns 200 and 300 credits.'), ['200', '300']);
  assert.deepEqual(ungrounded('The API returns 200 and 5 items.'), ['200', '5']);
  assert.deepEqual(ungrounded('The page shows 2. The API refuses it.'), ['2']);
  assert.deepEqual(ungrounded('The export of 2,000 rows finishes.'), ['2000']);
});
