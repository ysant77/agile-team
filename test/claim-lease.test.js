// Review of 24 Nov, stale lease (P1). The claim lease (src/verify-claim.js) let one delivery of a
// claim work at a time. Two faults, shown here with barriers in a store double:
// 1. Stale takeover was "read, then write": two deliveries that both read the same stale lease
//    both took it over, and both ran the claim.
// 2. The lease was deleted in `finally` with no owner check: a slow delivery whose lease was taken
//    over deleted the new owner's lease, and kept posting after the takeover.
// The store double keeps FAIL_IF_EXISTS and the atomic swap `returnValue: 'PREVIOUS'` of Forge KVS.
// The queue runs one claim job at a time (concurrency limit 1), so these interleavings need the
// platform to run a second job while the first is alive; this is not seen live.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEASE_MS, verifyClaim } from '../src/verify-claim.js';

function store() {
  const m = new Map();
  const hooks = { afterGet: null };
  return {
    map: m,
    hooks,
    get: async (k) => {
      const v = structuredClone(m.get(k));
      if (hooks.afterGet) await hooks.afterGet(k, v);
      return v;
    },
    set: async (k, v, opts) => {
      if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && m.has(k)) throw new Error('key exists');
      const prev = m.get(k);
      m.set(k, structuredClone(v));
      if (opts?.returnValue === 'PREVIOUS') return prev === undefined ? undefined : { key: k, value: structuredClone(prev) };
      return undefined;
    },
    delete: async (k) => { m.delete(k); },
  };
}
const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };
const quiet = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

function deps(s, sink, pauses = {}) {
  return {
    store: s,
    env: () => ({ repo: null }),
    collectJira: async () => { sink.decides += 1; return { key: 'BANK-1', type: 'Story', acceptanceCriteria: [], subtasks: [], links: [], labels: [] }; },
    addVerdictProperty: async () => { sink.properties += 1; if (pauses.property) await pauses.property(); },
    appendAudit: async (e) => { sink.audit.push(e); return { seq: sink.audit.length - 1, hash: `h${sink.audit.length}`.padEnd(16, '0') }; },
    addComment: async (_k, t) => { sink.comments.push(t); },
    findComment: async (_k, marker) => sink.comments.some((t) => t.includes(marker)),
    releaseClaim: async () => {},
  };
}
const sinkOf = () => ({ decides: 0, properties: 0, audit: [], comments: [] });

test('two deliveries that read the same stale lease: only one takes it over and runs the claim', async () => {
  const s = store();
  const sink = sinkOf();
  const claim = { id: 'BANK-1:21', type: 'fixed' };
  s.map.set(`claim-lease:${claim.id}`, { at: Date.now() - LEASE_MS - 1000 });
  // Both deliveries read the stale lease before either writes.
  let waiting = 0;
  const both = gate();
  s.hooks.afterGet = async (k) => {
    if (k !== `claim-lease:${claim.id}`) return;
    waiting += 1;
    if (waiting === 2) both.open();
    if (waiting <= 2) await both.p;
  };
  const runs = await quiet(() => Promise.allSettled([verifyClaim({ issueKey: 'BANK-1', claim }, deps(s, sink)), verifyClaim({ issueKey: 'BANK-1', claim }, deps(s, sink))]));
  s.hooks.afterGet = null;
  assert.equal(runs.filter((r) => r.status === 'fulfilled').length, 1, 'one delivery runs');
  assert.equal(sink.decides, 1, 'the claim is decided once');
  assert.equal(sink.comments.length, 1);
});

test('a slow delivery whose lease was taken over neither deletes the new lease nor posts', async () => {
  const s = store();
  const sink = sinkOf();
  const claim = { id: 'BANK-1:22', type: 'fixed' };
  const leaseKey = `claim-lease:${claim.id}`;
  const aIn = gate(); const aGo = gate(); const bIn = gate(); const bGo = gate();
  let calls = 0;
  const pauses = { property: async () => { calls += 1; if (calls === 1) { aIn.open(); await aGo.p; } else { bIn.open(); await bGo.p; } } };
  const a = quiet(() => verifyClaim({ issueKey: 'BANK-1', claim }, deps(s, sink, pauses)));
  await aIn.p;
  // A has run past its lease time (as when the platform is slow): the lease goes stale.
  s.map.set(leaseKey, { ...s.map.get(leaseKey), at: Date.now() - LEASE_MS - 1000 });
  const b = quiet(() => verifyClaim({ issueKey: 'BANK-1', claim }, deps(s, sink, pauses)));
  await bIn.p;
  const bLease = structuredClone(s.map.get(leaseKey));
  aGo.open();
  await a.catch(() => {});
  assert.deepEqual(s.map.get(leaseKey), bLease, "A leaves B's lease in place");
  assert.equal(sink.comments.length, 0, 'A posts nothing after the takeover');
  bGo.open();
  await b;
  assert.equal(sink.comments.length, 1, 'one verdict comment in all');
  assert.equal(s.map.has(leaseKey), false, 'B releases its own lease');
});
