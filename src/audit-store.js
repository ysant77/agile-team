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

// The number of events: the head pointer, then forward over events that the head does not name
// yet (its write can fail after the event is written). Review of 24 Nov, audit order.
export async function auditLength(store = kvs) {
  const head = await store.get(HEAD);
  let n = head ? head.seq + 1 : 0;
  while (await store.get(keyFor(n))) n += 1;
  return n;
}

// One audit event per operation id (review of 24 Nov, audit order). The operation key
// audit-op:<opId> is written (FAIL_IF_EXISTS) before the event, with the seq where the search
// starts; the event carries the opId in its data; then the key gets the event's seq. A retry
// returns the recorded event, or finds an event whose key was not updated (a stop between the two
// writes), or writes the event when no earlier try did.
// append and read are injected by callers that use their own writer (tests); read: null means no
// search, so a stop between the event and the key update can then give a second event.
// Limit: two calls with the same opId at the same moment can both write; the callers serialize
// them (the claim lease, the create-ticket "pending" key, the finding's createOnce).
const opKey = (opId) => `audit-op:${opId}`;
export async function appendAuditOnce(opId, entry, { store = kvs, append = null, read } = {}) {
  const id = String(opId);
  const write = append ?? ((e) => appendAudit(e, store));
  const readOne = read === undefined ? async (seq) => (await store.get(keyFor(seq))) ?? null : read;
  let op = await store.get(opKey(id));
  if (op && Number.isInteger(op.seq)) return { seq: op.seq, hash: op.hash ?? null, at: op.at ?? null, duplicate: true };
  if (op && readOne) {
    for (let seq = Number.isInteger(op.fromSeq) ? op.fromSeq : 0; ; seq += 1) {
      const e = await readOne(seq);
      if (!e || e.missing) break;
      if (e.data?.opId === id) {
        await store.set(opKey(id), { seq, hash: e.hash ?? null, at: e.at ?? null });
        return { seq, hash: e.hash ?? null, at: e.at ?? null, duplicate: true };
      }
    }
  }
  if (!op) {
    const head = await store.get(HEAD);
    op = { fromSeq: head ? head.seq + 1 : 0 };
    await store.set(opKey(id), op, { keyPolicy: 'FAIL_IF_EXISTS' });
  }
  const written = await write({ ...entry, data: { ...(entry.data ?? {}), opId: id } });
  await store.set(opKey(id), { seq: written.seq, hash: written.hash ?? null, at: written.at ?? null });
  return written;
}
