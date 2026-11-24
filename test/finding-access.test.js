// Review of 24 Nov, finding access (P0): a stored discovery finding holds the symptom, the
// hypothesis, the cited code and the investigator. Before this change, the panel action and the
// create-ticket action read a finding by its id alone, for any caller. The rule now (owner's
// default of 24 Nov): the investigator reads the finding; another person reads it only after an
// explicit link to a work item, and only when Jira lets that person browse the work item. A
// record with no investigator is closed to everyone. Every refusal gives the same text as an id
// that does not exist, so a caller cannot learn that a finding exists.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import api from '@forge/api';
import { kvs } from '@forge/kvs';
import { FINDING_NOT_FOUND, getFindingAction } from '../src/finding-view.js';
import { createTicket } from '../src/index.js';

const ID = 'F-0123456789ab-89abcdef';
const record = (extra = {}) => ({
  findingId: ID, investigationId: 'INV-0123456789ab', symptom: 'A customer withdrew 80.00 twice from 100.00.',
  repo: 'o/demo', commit: 'c'.repeat(40), by: 'user-a', status: 'unconfirmed', kind: 'defect',
  hypothesis: 'The balance check and the debit are not one step.', citations: [{ file: 'docs/rules.md', line: 3 }],
  reproducer: { testName: 'test_two_withdrawals_never_overdraw', file: 'tests/test_ledger.py', asserts: 'the balance never goes below 0' },
  severity: null, priority: null, openQuestions: [], at: '2026-11-23T10:00:00.000Z', ...extra,
});

function storeOf(entries) {
  const m = new Map(entries);
  return { map: m, get: async (k) => structuredClone(m.get(k)), set: async (k, v) => { m.set(k, structuredClone(v)); }, delete: async (k) => { m.delete(k); } };
}
// canBrowse: the work items each person can browse in Jira (projects A and B).
const BROWSE = { 'user-a': ['PA-1', 'PB-1'], 'user-b': ['PA-1'], 'user-c': ['PB-1'] };
const deps = (store, accountId) => ({ store, accountId, canBrowse: async (key) => (BROWSE[accountId] ?? []).includes(key) });
const read = (store, accountId, id = ID) => getFindingAction({ findingId: id }, deps(store, accountId));
const NOT_FOUND = { ok: false, error: FINDING_NOT_FOUND };

test('the investigator reads the finding', async () => {
  const r = await read(storeOf([[`finding:${ID}`, record()]]), 'user-a');
  assert.equal(r.ok, true);
  assert.equal(r.view.findingId, ID);
});

test('another person of the same site, with no link, gets the not-found text', async () => {
  assert.deepEqual(await read(storeOf([[`finding:${ID}`, record()]]), 'user-b'), NOT_FOUND);
});

test('a caller that Jira does not name gets the not-found text', async () => {
  const store = storeOf([[`finding:${ID}`, record()]]);
  for (const who of [undefined, null, '']) assert.deepEqual(await read(store, who), NOT_FOUND);
});

test('an id that does not exist and a malformed id give the same text as a refusal', async () => {
  const store = storeOf([[`finding:${ID}`, record()]]);
  for (const id of ['F-0123456789ab-00000000', 'finding:x', '', null]) assert.deepEqual(await read(store, 'user-a', id), NOT_FOUND);
});

test('an old record with no investigator is closed to everyone', async () => {
  const store = storeOf([[`finding:${ID}`, record({ by: undefined })]]);
  for (const who of ['user-a', 'user-b']) assert.deepEqual(await read(store, who), NOT_FOUND);
});

test('after a link to a work item, a person who can browse that item reads the finding; others do not', async () => {
  const store = storeOf([[`finding:${ID}`, record()], [`finding-links:${ID}`, ['PA-1']]]);
  assert.equal((await read(store, 'user-b')).ok, true, 'user-b browses PA-1');
  assert.deepEqual(await read(store, 'user-c'), NOT_FOUND, 'user-c browses project B only');
});

test('a link to a work item of project B does not open the finding to a person of project A only', async () => {
  const store = storeOf([[`finding:${ID}`, record()], [`finding-links:${ID}`, ['PB-1']]]);
  assert.deepEqual(await read(store, 'user-b'), NOT_FOUND);
  assert.equal((await read(store, 'user-c')).ok, true);
});

test('a malformed link record opens nothing', async () => {
  for (const links of ['PA-1', { key: 'PA-1' }, [null, 7]]) {
    const store = storeOf([[`finding:${ID}`, record()], [`finding-links:${ID}`, links]]);
    assert.deepEqual(await read(store, 'user-b'), NOT_FOUND, JSON.stringify(links));
  }
});

// create-ticket: the caller is the person Jira names (/myself, as the user).
const pathOf = (r) => r?.value_ ?? String(r);
function mockKvs(t, entries = []) {
  const m = new Map(entries);
  t.mock.method(kvs, 'get', async (k) => structuredClone(m.get(k)));
  t.mock.method(kvs, 'set', async (k, v, opts) => {
    if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && m.has(k)) throw new Error('key exists');
    m.set(k, structuredClone(v));
  });
  t.mock.method(kvs, 'delete', async (k) => { m.delete(k); });
  return m;
}
function mockUser(t, accountId) {
  const posts = [];
  t.mock.method(api, 'asUser', () => ({
    requestJira: async (route, opts) => {
      const path = pathOf(route);
      if (path.startsWith('/rest/api/3/myself')) return { ok: true, status: 200, json: async () => ({ accountId }) };
      if (path === '/rest/api/3/field') return { ok: true, status: 200, json: async () => [] };
      if (path === '/rest/api/3/issue' && opts?.method === 'POST') { posts.push(JSON.parse(opts.body).fields); return { ok: true, status: 201, json: async () => ({ key: `PA-${10 + posts.length}` }) }; }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    },
  }));
  return posts;
}
const draft = { request: 'A customer withdrew twice and the balance went below zero', projectKey: 'PA', summary: 'Two withdrawals at once overdraw an account',
  description: 'Two withdrawals at the same time both pass the balance check.', storyPoints: 3, issueType: 'Bug', findingId: ID };

test('create-ticket: another person cannot make a ticket from the finding, and learns nothing of it', async (t) => {
  mockKvs(t, [[`finding:${ID}`, record()]]);
  const posts = mockUser(t, 'user-b');
  const r = await createTicket({ ...draft });
  assert.equal(r.ok, false);
  assert.match(r.error, /there is no finding/);
  assert.doesNotMatch(r.error, /withdraw|balance check/i);
  assert.equal(posts.length, 0);
});

test('create-ticket: an old record with no investigator gives no ticket', async (t) => {
  mockKvs(t, [[`finding:${ID}`, record({ by: undefined })]]);
  const posts = mockUser(t, 'user-a');
  assert.equal((await createTicket({ ...draft })).ok, false);
  assert.equal(posts.length, 0);
});

test('create-ticket: the investigator makes the ticket, and the ticket is the explicit link of the finding', async (t) => {
  const m = mockKvs(t, [[`finding:${ID}`, record()]]);
  mockUser(t, 'user-a');
  const r = await createTicket({ ...draft });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(m.get(`finding-links:${ID}`), [r.key]);
  // A person who can browse the new work item now reads the finding.
  const store = { get: async (k) => structuredClone(m.get(k)) };
  const view = await getFindingAction({ findingId: ID }, { store, accountId: 'user-b', canBrowse: async (key) => key === r.key });
  assert.equal(view.ok, true);
});
