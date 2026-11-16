// Append-only audit chain. Each event's hash covers the previous hash and its own content.

import { createHash } from 'node:crypto';

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export const GENESIS = '0'.repeat(64);

export function nextEvent(prev, { actor, event, data, at }) {
  const seq = prev ? prev.seq + 1 : 0;
  const prevHash = prev ? prev.hash : GENESIS;
  const body = { seq, prevHash, actor, event, data, at };
  return { ...body, hash: sha256(canonical(body)) };
}

export function verifyChain(events) {
  let prev = null;
  for (const e of events) {
    const { hash, ...body } = e;
    if (e.seq !== (prev ? prev.seq + 1 : 0)) return { ok: false, at: e.seq, reason: 'sequence gap' };
    if (e.prevHash !== (prev ? prev.hash : GENESIS)) return { ok: false, at: e.seq, reason: 'broken link' };
    if (sha256(canonical(body)) !== hash) return { ok: false, at: e.seq, reason: 'hash mismatch' };
    prev = e;
  }
  return { ok: true, length: events.length, head: prev?.hash ?? GENESIS };
}
