// Second review of unit 1, items 1 and 2, applied to the reviewer's file reader.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectPrFiles } from '../src/github-evidence.js';
import { buildReviewPacket } from '../src/review.js';

const REPO = 'ysant77/yms-bank-demo';
const page = (url) => Number(new URL(url).searchParams.get('page') ?? 1);
const reply = (status, body) => ({ ok: status === 200, status, json: async () => body });
const files = (n) => Array.from({ length: n }, (_, i) => ({ filename: `src/f${i}.py`, status: 'modified', patch: '@@ -1 +1 @@\n+x' }));

test('R2: a 404 on the reviewer file list is an error, not an empty change', async () => {
  await assert.rejects(collectPrFiles({ repo: REPO, prNumber: 3, fetchFn: async () => reply(404, {}) }), /HTTP 404/);
});

test('R1: a full last page of files is marked as cut, and the packet says so', async () => {
  const got = await collectPrFiles({ repo: REPO, prNumber: 3, fetchFn: async () => reply(200, files(100)) });
  assert.equal(got.truncated, true);
  const short = await collectPrFiles({ repo: REPO, prNumber: 3, fetchFn: async (u) => reply(200, page(u) === 1 ? files(3) : []) });
  assert.equal(short.truncated, false);
  assert.equal(short.files.length, 3);
  const packet = buildReviewPacket({ ticket: { key: 'BANK-1' }, pr: { number: 3 }, files: got.files, filesTruncated: true });
  assert.equal(packet.filesTruncated, true);
});
