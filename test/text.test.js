import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adfToText,
  checkStoryPoints,
  parseClaim,
  parseRepository,
  textToAdf,
} from '../src/text.js';

test('ADF round trip keeps lines', () => {
  assert.equal(adfToText(textToAdf('claim: fixed\nsee PR 4')), 'claim: fixed\nsee PR 4\n');
});

test('literal backslash-n becomes a line break', () => {
  assert.equal(adfToText(textToAdf('a\\n- [ ] b')), 'a\n- [ ] b\n');
});

test('parseClaim reads type and detail', () => {
  assert.deepEqual(parseClaim('Claim: Fixed the race'), { type: 'fixed', detail: 'the race' });
  assert.equal(parseClaim('looks fixed to me'), null);
  assert.equal(parseClaim(undefined), null);
});

test('parseRepository rejects paths and accepts owner/name', () => {
  assert.equal(parseRepository(''), 'octocat/Hello-World');
  assert.equal(parseRepository('a-b/c.d_e'), 'a-b/c.d_e');
  assert.throws(() => parseRepository('../../user'));
  assert.throws(() => parseRepository('owner/name/extra'));
});

test('story points must be Fibonacci values', () => {
  assert.equal(checkStoryPoints('5'), 5);
  assert.throws(() => checkStoryPoints(4));
});

import { parseAcLines } from '../src/ticket-spec.js';

test('acceptance criteria lines parse into checks', () => {
  const acs = parseAcLines('AC1 | button visible at 390 px | test_passes(test_BANK1_send_button)\\nAC2 | p95 fast | metric_at_most(statement_p95_ms, 300)\nnot an AC\nAC3 | finance signs off | manual()');
  assert.equal(acs.length, 3);
  assert.deepEqual(acs[0].check, { type: 'test_passes', args: ['test_BANK1_send_button'] });
  assert.deepEqual(acs[1].check, { type: 'metric_at_most', args: ['statement_p95_ms', 300] });
  assert.deepEqual(acs[2].check, { type: 'manual', args: ['finance signs off'] });
});

import { normaliseTestName } from '../src/ticket-spec.js';

test('test names are normalised to the {TOKEN} form', () => {
  assert.equal(normaliseTestName('test_BANK_send_money_mobile_flow', 'BANK'), 'test_{TOKEN}_send_money_mobile_flow');
  assert.equal(normaliseTestName('test_BANK12_x', 'BANK'), 'test_{TOKEN}_x');
  assert.equal(normaliseTestName('test_{TOKEN}_y', 'BANK'), 'test_{TOKEN}_y');
  assert.equal(normaliseTestName('balance_after_send', 'BANK'), 'test_{TOKEN}_balance_after_send');
});

import { malformedAcLines } from '../src/ticket-spec.js';

test('criteria without a check are reported as malformed', () => {
  assert.deepEqual(malformedAcLines('AC1 | ok | test_passes(test_{TOKEN}_a)\nAC2: no check here'), ['AC2: no check here']);
  assert.deepEqual(malformedAcLines('AC1 | a | manual()'), []);
});
