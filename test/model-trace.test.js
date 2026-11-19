// Trace of a model reply on the deployed path. Each guarded record keeps a hash and the length of
// the raw reply, and the error class when the schema refuses it. A bounded copy of the raw reply
// is kept in app storage under its hash, also for a refused attempt that the agent retries, so a
// failure after deployment can be traced. Limit: Forge does not tell the app which model Rovo
// used, so the model field is the fixed word "rovo".

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import api from '@forge/api';
import { kvs } from '@forge/kvs';
import { sha256 } from '../src/audit.js';
import { applyGuards } from '../src/opinion.js';
import { recordReview } from '../src/review-actions.js';
import { applyReviewGuards, buildReviewPacket } from '../src/review.js';
import { RAW_EXCERPT_MAX, RAW_KEEP, rawIndexKey, rawKey, rawTrace, schemaErrorClass } from '../src/trace.js';

const s56 = JSON.parse(readFileSync(new URL('../fixtures/S56.json', import.meta.url), 'utf8'));
const step = s56.steps.find((s) => s.kind === 'review');
const packet = buildReviewPacket(step.packet);
const good = step.review;

test('the raw trace has the hash and length of the whole reply and a bounded excerpt', () => {
  const long = `{"findings":[${'x'.repeat(10000)}`;
  const t = rawTrace(long);
  assert.equal(t.hash, sha256(long));
  assert.equal(t.length, long.length);
  assert.equal(t.excerpt.length, RAW_EXCERPT_MAX);
  assert.equal(t.excerpt, long.slice(0, RAW_EXCERPT_MAX));
  assert.equal(t.truncated, true);
  const obj = rawTrace({ findings: [] });
  assert.equal(obj.excerpt, '{"findings":[]}');
  assert.equal(obj.type, 'object');
  assert.equal(rawTrace(undefined).excerpt, '');
});

test('schema errors have a fixed error class', () => {
  assert.equal(schemaErrorClass(['not valid JSON']), 'parse');
  assert.equal(schemaErrorClass(['not a JSON object']), 'not-object');
  assert.equal(schemaErrorClass(['field "approve" is not allowed: a review never decides']), 'forbidden-field');
  assert.equal(schemaErrorClass(['more than 8 findings']), 'limit');
  assert.equal(schemaErrorClass(['a review needs a finding or a proposed check']), 'empty');
  assert.equal(schemaErrorClass(['finding 1: line must be a whole number']), 'field-shape');
  assert.equal(schemaErrorClass([]), null);
});

test('a guarded review record keeps the raw hash and length, and the error class on a schema failure', () => {
  const bad = applyReviewGuards('{"findings": [', packet, { model: 'rovo' });
  assert.equal(bad.guard, 'schema');
  assert.deepEqual(bad.raw, { hash: sha256('{"findings": ['), length: 14 });
  assert.equal(bad.errorClass, 'parse');
  const ok = applyReviewGuards(good, packet, { model: 'rovo' });
  assert.equal(ok.outcome, 'review');
  assert.equal(ok.raw.hash, rawTrace(good).hash);
  assert.equal(ok.errorClass, null);
  assert.equal('excerpt' in ok.raw, false, 'the copy is kept in app storage, not on the issue');
});

test('a guarded opinion record keeps the raw hash and the error class', () => {
  const sides = { sides: [{ id: 'A', gatesPassed: true }], ids: [] };
  const bad = applyGuards('decision: A', sides, { model: 'rovo' });
  assert.equal(bad.guard, 'schema');
  assert.equal(bad.errorClass, 'parse');
  assert.equal(bad.raw.hash, sha256('decision: A'));
});

function stubForge(t) {
  const store = new Map();
  const puts = [];
  t.mock.method(kvs, 'get', async (k) => structuredClone(store.get(k)));
  t.mock.method(kvs, 'set', async (k, v) => { store.set(k, structuredClone(v)); });
  t.mock.method(kvs, 'delete', async (k) => { store.delete(k); });
  // The person can see the work item (browse check of the action, docs/ACTIONS.md).
  t.mock.method(api, 'asUser', () => ({ requestJira: async () => ({ ok: true, status: 200, json: async () => ({ id: '1' }) }) }));
  const pathOf = (r) => r?.value_ ?? String(r);
  t.mock.method(api, 'asApp', () => ({
    requestJira: async (path, opts) => {
      if (opts?.method === 'PUT') puts.push({ path: pathOf(path), body: JSON.parse(opts.body) });
      if (pathOf(path).includes('aat.reviews') && !opts?.method) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 201, json: async () => ({ id: '1' }) };
    },
  }));
  return { store, puts };
}

test('record-review keeps a bounded copy of a refused attempt and of the accepted reply', async (t) => {
  const { store, puts } = stubForge(t);
  store.set('review:BANK-4:61', { packet, retries: 0 });
  const broken = `{"findings": [ ${'y'.repeat(5000)}`;
  const first = await recordReview({ issueKey: 'BANK-4', prNumber: 61, review: broken });
  assert.equal(first.ok, false);
  const kept = store.get(rawKey(sha256(broken)));
  assert.equal(kept.excerpt.length, RAW_EXCERPT_MAX);
  assert.equal(kept.length, broken.length);
  assert.equal(kept.errorClass, 'parse');
  assert.equal(kept.issueKey, 'BANK-4');
  const attempts = store.get('review:BANK-4:61').attempts;
  assert.deepEqual(attempts.map((a) => [a.guard, a.errorClass, a.rawHash]), [['schema', 'parse', sha256(broken)]]);

  const second = await recordReview({ issueKey: 'BANK-4', prNumber: 61, review: good });
  assert.equal(second.ok, true, JSON.stringify(second));
  const saved = puts.find((p) => p.path.endsWith('/aat.reviews')).body.at(-1);
  assert.equal(saved.raw.hash, rawTrace(good).hash);
  assert.equal(saved.model, 'rovo');
  assert.ok(store.get(rawKey(saved.raw.hash)), 'the accepted reply is kept too');
});

test('the kept attempts are bounded', async (t) => {
  const { store } = stubForge(t);
  store.set('review:BANK-4:61', { packet, retries: 0, attempts: Array.from({ length: 5 }, (_, i) => ({ guard: 'schema', rawHash: String(i) })) });
  await recordReview({ issueKey: 'BANK-4', prNumber: 61, review: 'nope' });
  assert.equal(store.get('review:BANK-4:61').attempts.length, 5);
  assert.equal(store.get('review:BANK-4:61').attempts.at(-1).rawHash, sha256('nope'));
});

test('record-review indexes each copy per work item and PR, pins the saved one, and keeps at most five others', async (t) => {
  const { store } = stubForge(t);
  store.set('review:BANK-4:61', { packet, retries: 0 });
  const ok = await recordReview({ issueKey: 'BANK-4', prNumber: 61, review: good });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const savedHash = rawTrace(good).hash;
  for (let i = 0; i < 7; i += 1) {
    store.set('review:BANK-4:61', { ...store.get('review:BANK-4:61'), retries: 0 });
    await recordReview({ issueKey: 'BANK-4', prNumber: 61, review: `bad ${i}` });
  }
  const index = store.get(rawIndexKey('code-reviewer:BANK-4:61'));
  assert.deepEqual(index.filter((e) => e.pin).map((e) => e.hash), [savedHash]);
  assert.equal(index.filter((e) => !e.pin).length, RAW_KEEP);
  assert.ok(store.get(rawKey(savedHash)), 'the saved record keeps its copy');
  assert.equal(store.get(rawKey(sha256('bad 0'))), undefined, 'the oldest refused copy is deleted');
  assert.ok(store.get(rawKey(sha256('bad 6'))));
});
