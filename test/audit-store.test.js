// F8 and F10 (review of 16 Nov): the audit store under concurrency, deletion and storage errors.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyChain } from '../src/audit.js';
import { appendAudit, readAudit } from '../src/audit-store.js';

// An in-memory KVS with FAIL_IF_EXISTS. `yieldEvery` lets other appends run between calls.
function fakeKvs({ failSet } = {}) {
  const data = new Map();
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    data,
    get: async (k) => { await tick(); return data.has(k) ? structuredClone(data.get(k)) : undefined; },
    set: async (k, v, opts) => {
      await tick();
      if (failSet) throw failSet;
      if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && data.has(k)) throw new Error('key already exists');
      data.set(k, structuredClone(v));
    },
    delete: async (k) => { data.delete(k); },
  };
}

test('F10: concurrent appends take distinct sequence numbers and form one valid chain', async () => {
  const store = fakeKvs();
  const done = await Promise.all(Array.from({ length: 8 }, (_, i) => appendAudit({ actor: 'a', event: 'e', data: { i } }, store)));
  assert.deepEqual(done.map((e) => e.seq).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(verifyChain(await readAudit(0, 8, store)).ok, true);
});

test('F8: a deleted middle or tail event breaks the chain instead of shortening it', async () => {
  const store = fakeKvs();
  for (let i = 0; i < 5; i += 1) await appendAudit({ actor: 'a', event: 'e', data: { i } }, store);
  store.data.delete('audit:000000000002');
  const middle = await readAudit(0, 5, store);
  assert.equal(middle.length, 5);
  assert.equal(verifyChain(middle).ok, false);
  store.data.set('audit:000000000002', 'restored later');
  store.data.delete('audit:000000000004');
  const tail = await readAudit(0, 5, store);
  assert.equal(verifyChain(tail).ok, false);
});

test('F8: a storage error that is not a key conflict is thrown, not retried as one', async () => {
  const store = fakeKvs({ failSet: new Error('KVS 503') });
  await assert.rejects(appendAudit({ actor: 'a', event: 'e', data: {} }, store), /KVS 503/);
});
