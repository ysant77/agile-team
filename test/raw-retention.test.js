// Retention of the raw reply copies (raw:<hash>, src/trace.js). Each scope (actor, work item and
// pull request) keeps at most RAW_KEEP copies and none older than RAW_MAX_AGE_DAYS. The copy of an
// accepted record is pinned: the count limit does not remove it, but the age limit does.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RAW_KEEP, RAW_MAX_AGE_DAYS, rawIndexKey, rawKey, storeRawCopy } from '../src/trace.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-11-18T00:00:00Z');
function memory() {
  const m = new Map();
  return { m, get: async (k) => structuredClone(m.get(k)), set: async (k, v) => { m.set(k, structuredClone(v)); }, delete: async (k) => { m.delete(k); } };
}
const SCOPE = 'code-reviewer:BANK-1:7';
const put = (s, hash, at, pin = false) => storeRawCopy(s, SCOPE, hash, { excerpt: hash }, { now: T0 + at, pin });

test('the limits are 5 copies and 30 days', () => {
  assert.equal(RAW_KEEP, 5);
  assert.equal(RAW_MAX_AGE_DAYS, 30);
});

test('a sixth copy in one scope deletes the oldest copy', async () => {
  const s = memory();
  for (let i = 1; i <= 6; i += 1) await put(s, `h${i}`, i * 1000);
  assert.equal(s.m.has(rawKey('h1')), false);
  for (let i = 2; i <= 6; i += 1) assert.equal(s.m.has(rawKey(`h${i}`)), true, `h${i}`);
  assert.deepEqual(s.m.get(rawIndexKey(SCOPE)).map((e) => e.hash), ['h2', 'h3', 'h4', 'h5', 'h6']);
});

test('the copy of an accepted record is pinned against the count limit', async () => {
  const s = memory();
  await put(s, 'accepted', 0, true);
  for (let i = 1; i <= 7; i += 1) await put(s, `h${i}`, i * 1000);
  assert.equal(s.m.has(rawKey('accepted')), true);
  assert.equal(s.m.get(rawIndexKey(SCOPE)).filter((e) => !e.pin).length, RAW_KEEP);
});

test('a copy older than 30 days is deleted on the next write in its scope, pinned or not', async () => {
  const s = memory();
  await put(s, 'old', 0, true);
  await put(s, 'mid', 5 * DAY);
  await put(s, 'new', 31 * DAY);
  assert.equal(s.m.has(rawKey('old')), false);
  assert.equal(s.m.has(rawKey('mid')), true);
  assert.equal(s.m.has(rawKey('new')), true);
});

test('the same reply twice is one copy and one index entry', async () => {
  const s = memory();
  await put(s, 'same', 0);
  await put(s, 'same', 1000);
  assert.deepEqual(s.m.get(rawIndexKey(SCOPE)).map((e) => e.hash), ['same']);
});

test('scopes are separate: a write in one scope deletes nothing in another', async () => {
  const s = memory();
  await storeRawCopy(s, 'code-reviewer:BANK-2:9', 'other', { excerpt: 'x' }, { now: T0 });
  for (let i = 1; i <= 6; i += 1) await put(s, `h${i}`, 40 * DAY + i);
  assert.equal(s.m.has(rawKey('other')), true);
});

test('a copy that another scope still lists is not deleted', async () => {
  const s = memory();
  await storeRawCopy(s, 'code-reviewer:BANK-2:9', 'shared', { excerpt: 'x' }, { now: T0 });
  await put(s, 'shared', 0);
  for (let i = 1; i <= 6; i += 1) await put(s, `h${i}`, i * 1000);
  assert.equal(s.m.has(rawKey('shared')), true);
});

test('a malformed index is replaced, and the write never throws', async () => {
  const s = memory();
  s.m.set(rawIndexKey(SCOPE), 'not a list');
  await put(s, 'h1', 0);
  assert.deepEqual(s.m.get(rawIndexKey(SCOPE)).map((e) => e.hash), ['h1']);
});
