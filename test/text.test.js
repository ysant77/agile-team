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
