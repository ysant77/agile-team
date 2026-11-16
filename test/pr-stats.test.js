// Second review of unit 1, item 1, applied to the PR size reader: a capped file list is not known.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectPrStats } from '../src/github-evidence.js';

const REPO = 'ysant77/yms-bank-demo';
const page = (url) => Number(new URL(url).searchParams.get('page') ?? 1);
function fetchWith(filesFor) {
  return async (url) => {
    if (/\/pulls\/3\/files/.test(url)) return { ok: true, status: 200, json: async () => filesFor(page(url)) };
    if (/\/pulls\/3$/.test(url)) return { ok: true, status: 200, json: async () => ({ additions: 5, deletions: 1 }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}
const files = (n, from) => Array.from({ length: n }, (_, i) => ({ filename: `tests/t${from + i}.py`, patch: '+x' }));

test('R1: the PR size reader reads every page of changed files', async () => {
  const stats = await collectPrStats({ repo: REPO, prNumber: 3, fetchFn: fetchWith((p) => (p === 1 ? files(100, 0) : p === 2 ? files(5, 100) : [])) });
  assert.equal(stats.files.length, 105);
  assert.equal(Object.keys(stats.patches).length, 105);
});

test('R1: a full last page of changed files makes the files and patches unknown', async () => {
  const stats = await collectPrStats({ repo: REPO, prNumber: 3, fetchFn: fetchWith(() => files(100, 0)) });
  assert.equal(stats.files, null);
  assert.equal(stats.patches, null);
});
