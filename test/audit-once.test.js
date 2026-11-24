// appendAuditOnce(opId, entry): one audit event per operation id, also when a write fails or the
// process stops between two writes. An operation key (audit-op:<opId>) is written before the
// event, and the event carries the opId, so a retry finds an event whose operation key was not
// updated. auditLength(store): the number of events, also when the head pointer lags behind.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendAudit, appendAuditOnce, auditLength, readAudit } from '../src/audit-store.js';
import { verifyChain } from '../src/audit.js';

function faultyStore() {
  const m = new Map();
  const faults = [];
  return {
    map: m,
    failOnce: (when) => faults.push(when),
    get: async (k) => structuredClone(m.get(k)),
    set: async (k, v, opts) => {
      const i = faults.findIndex((f) => f(k, v));
      if (i >= 0) { faults.splice(i, 1); throw new Error(`injected failure on ${k}`); }
      if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && m.has(k)) throw new Error('key exists');
      m.set(k, structuredClone(v));
    },
    delete: async (k) => { m.delete(k); },
  };
}
const all = (m) => [...m.entries()].filter(([k]) => /^audit:\d+$/.test(k)).map(([, v]) => v);
const E = { actor: 'a', event: 'x.done', data: { key: 'BANK-1' } };

test('the same operation id gives the same event, written once', async () => {
  const s = faultyStore();
  const a = await appendAuditOnce('op-1', E, { store: s });
  const b = await appendAuditOnce('op-1', E, { store: s });
  assert.equal(a.seq, b.seq);
  assert.equal(a.hash, b.hash);
  assert.equal(all(s.map).length, 1);
  assert.equal(all(s.map)[0].data.opId, 'op-1');
});

test('two operation ids give two events', async () => {
  const s = faultyStore();
  await appendAuditOnce('op-1', E, { store: s });
  await appendAuditOnce('op-2', E, { store: s });
  assert.equal(all(s.map).length, 2);
});

test('a stop after the event and before the operation key is updated: the retry finds the event', async () => {
  const s = faultyStore();
  s.failOnce((k, v) => k === 'audit-op:op-1' && Number.isInteger(v?.seq));
  await appendAudit({ actor: 'z', event: 'other', data: {} }, s);
  await assert.rejects(appendAuditOnce('op-1', E, { store: s }), /injected failure/);
  await appendAudit({ actor: 'z', event: 'other', data: {} }, s); // another writer moves on
  const r = await appendAuditOnce('op-1', E, { store: s });
  assert.equal(all(s.map).filter((e) => e.event === 'x.done').length, 1);
  assert.equal(r.seq, 1);
});

test('a failed event write: the retry writes the event once', async () => {
  const s = faultyStore();
  s.failOnce((k) => /^audit:\d+$/.test(k));
  await assert.rejects(appendAuditOnce('op-1', E, { store: s }), /injected failure/);
  await appendAuditOnce('op-1', E, { store: s });
  await appendAuditOnce('op-1', E, { store: s });
  assert.equal(all(s.map).length, 1);
});

test('injected append and read: the stub writer of a test is used, and the operation key still holds', async () => {
  const s = faultyStore();
  const log = [];
  const append = async (e) => { log.push(e); return { seq: log.length - 1, hash: `h${log.length - 1}` }; };
  const read = async (seq) => log[seq] ?? null;
  await appendAuditOnce('op-9', E, { store: s, append, read });
  await appendAuditOnce('op-9', E, { store: s, append, read });
  assert.equal(log.length, 1);
  assert.equal(log[0].data.opId, 'op-9');
});

test('the head pointer lags (its write failed): auditLength counts every event, and the chain checks', async () => {
  const s = faultyStore();
  await appendAudit(E, s);
  s.failOnce((k) => k === 'audit-head');
  await assert.rejects(appendAudit(E, s), /injected failure/);
  assert.equal((await s.get('audit-head')).seq, 0);
  assert.equal(await auditLength(s), 2);
  const events = await readAudit(0, await auditLength(s), s);
  assert.equal(verifyChain(events).ok, true);
});
