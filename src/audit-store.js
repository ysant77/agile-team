// Audit chain in Forge KVS. Events are append-only: each key is written with FAIL_IF_EXISTS,
// so two writers can never both take the same sequence number.

import { kvs } from '@forge/kvs';
import { nextEvent } from './audit.js';

const PREFIX = 'audit:';
const HEAD = 'audit-head';
const keyFor = (seq) => `${PREFIX}${String(seq).padStart(12, '0')}`;

export async function appendAudit({ actor, event, data }, store = kvs) {
  let head = (await store.get(HEAD)) ?? null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    // Move forward if the head pointer is behind the stored events.
    const ahead = await store.get(keyFor(head ? head.seq + 1 : 0));
    if (ahead) {
      head = ahead;
      continue;
    }
    const next = nextEvent(head, { actor, event, data, at: new Date().toISOString() });
    try {
      await store.set(keyFor(next.seq), next, { keyPolicy: 'FAIL_IF_EXISTS' });
    } catch (error) {
      // A conflict means another writer took this sequence number: the key now exists. Any other
      // error (storage down, quota) is thrown, not retried as a conflict.
      const taken = await store.get(keyFor(next.seq));
      if (!taken) throw error;
      head = taken;
      continue;
    }
    await store.set(HEAD, { seq: next.seq, hash: next.hash, prevHash: next.prevHash, at: next.at });
    return next;
  }
  throw new Error('audit append failed after 20 attempts');
}

// Reads `count` events from `fromSeq`. A missing key is returned as a gap marker, so a deleted
// middle or tail event makes verifyChain fail instead of looking like a shorter valid chain.
// Callers pass count = head.seq + 1 - fromSeq.
export async function readAudit(fromSeq, count, store = kvs) {
  const events = [];
  for (let seq = fromSeq; seq < fromSeq + count; seq += 1) {
    const e = await store.get(keyFor(seq));
    events.push(e && typeof e === 'object' ? e : { seq, missing: true });
  }
  return events;
}
