// Rules for the actions that change state (execution plan 19 Nov, findings E2 to E4; table in
// docs/ACTIONS.md): input checks before any write, one effect and one audit event for a repeated
// call or a duplicate event, and no action on a work item the person cannot see.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import api from '@forge/api';
import { kvs } from '@forge/kvs';
import { createTicket, onComment } from '../src/index.js';
import { openCase, recordOpinion } from '../src/case-actions.js';
import { getPrDiff, recordReview } from '../src/review-actions.js';

const pathOf = (r) => r?.value_ ?? String(r);

// A KVS double that honours FAIL_IF_EXISTS, like Forge KVS.
function mockKvs(t) {
  const store = new Map();
  t.mock.method(kvs, 'get', async (k) => structuredClone(store.get(k)));
  t.mock.method(kvs, 'set', async (k, v, opts) => {
    if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && store.has(k)) throw new Error('key exists');
    store.set(k, structuredClone(v));
  });
  t.mock.method(kvs, 'delete', async (k) => { store.delete(k); });
  return store;
}
const auditEvents = (store) => [...store.entries()].filter(([k]) => k.startsWith('audit:0')).map(([, v]) => v);

// Jira as the user: who is asking, which work items they can see, and the create calls.
// Work item numbers continue across mocks, as on one site.
let next = 100;
function mockUser(t, { canSee = () => true, accountId = 'pm-user' } = {}) {
  const calls = [];
  t.mock.method(api, 'asUser', () => ({
    requestJira: async (route, opts) => {
      const path = pathOf(route);
      const method = opts?.method ?? 'GET';
      calls.push({ path, method });
      if (path.startsWith('/rest/api/3/myself')) return { ok: true, status: 200, json: async () => ({ accountId }) };
      if (method === 'GET' && /^\/rest\/api\/3\/issue\/[A-Z0-9-]+\?fields=id/.test(path)) {
        const key = path.split('/')[5].split('?')[0];
        return canSee(key) ? { ok: true, status: 200, json: async () => ({ id: '1' }) } : { ok: false, status: 404, json: async () => ({}) };
      }
      if (path.startsWith('/rest/agile/1.0/board')) return { ok: false, status: 404, json: async () => ({}) };
      if (path === '/rest/api/3/field') return { ok: true, status: 200, json: async () => [] };
      if (path === '/rest/api/3/issue' && method === 'POST') { next += 1; return { ok: true, status: 201, json: async () => ({ key: `BANK-${next}` }) }; }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    },
  }));
  return calls;
}
// Jira as the app: every call is recorded; any call is a failure for an action that must stop.
function mockApp(t, handler = () => ({ ok: true, status: 200, json: async () => ({}) })) {
  const calls = [];
  t.mock.method(api, 'asApp', () => ({
    requestJira: async (route, opts) => { calls.push({ path: pathOf(route), method: opts?.method ?? 'GET' }); return handler(pathOf(route), opts); },
  }));
  return calls;
}

const ticketPayload = (extra = {}) => ({
  request: 'Statements miss the last day of the month', projectKey: 'BANK', summary: 'Include the last day in statements',
  description: 'A customer sees the deposits of the last day.', storyPoints: 2, issueType: 'Bug', ...extra,
});

test('create-ticket: a malformed project key or issue type is refused before any Jira call', async (t) => {
  mockKvs(t);
  for (const bad of [{ projectKey: 'bank; DROP' }, { projectKey: '' }, { projectKey: 'B' }, { issueType: 'Epic' }, { issueType: 'Sub-task' }]) {
    const calls = mockUser(t);
    const r = await createTicket(ticketPayload(bad));
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(!calls.some((c) => c.method === 'POST'), JSON.stringify(bad));
  }
});

test('create-ticket: the same call twice creates one work item and one audit event', async (t) => {
  const store = mockKvs(t);
  const calls = mockUser(t);
  const first = await createTicket(ticketPayload());
  const second = await createTicket(ticketPayload());
  assert.equal(first.ok, true, first.error);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.key, first.key);
  assert.equal(calls.filter((c) => c.method === 'POST' && c.path === '/rest/api/3/issue').length, 1);
  const created = auditEvents(store).filter((e) => e.event === 'ticket.created');
  assert.equal(created.length, 1);
  assert.equal(created[0].actor, 'pm-user');
  assert.equal(created[0].data.key, first.key);
});

test('create-ticket: another user or another draft is not a duplicate', async (t) => {
  mockKvs(t);
  mockUser(t, { accountId: 'a' });
  const one = await createTicket(ticketPayload());
  mockUser(t, { accountId: 'b' });
  const two = await createTicket(ticketPayload());
  const three = await createTicket(ticketPayload({ summary: 'Include the last two days in statements' }));
  assert.notEqual(one.key, two.key);
  assert.notEqual(two.key, three.key);
});

test('create-ticket: a failed create can be tried again', async (t) => {
  mockKvs(t);
  let fail = true;
  t.mock.method(api, 'asUser', () => ({
    requestJira: async (route, opts) => {
      const path = pathOf(route);
      if (path.startsWith('/rest/api/3/myself')) return { ok: true, status: 200, json: async () => ({ accountId: 'pm-user' }) };
      if (path === '/rest/api/3/field') return { ok: true, status: 200, json: async () => [] };
      if (path === '/rest/api/3/issue' && opts?.method === 'POST') {
        if (fail) { fail = false; return { ok: false, status: 400, text: async () => 'bad', json: async () => ({}) }; }
        return { ok: true, status: 201, json: async () => ({ key: 'BANK-7' }) };
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    },
  }));
  mockApp(t, () => ({ ok: false, status: 404, json: async () => ({}) }));
  assert.equal((await createTicket(ticketPayload())).ok, false);
  const again = await createTicket(ticketPayload());
  assert.equal(again.ok, true, again.error);
  assert.equal(again.key, 'BANK-7');
});

// A duplicate comment event (at-least-once delivery) records one decision and one audit event.
test('a decision comment delivered twice is recorded once', async (t) => {
  const store = mockKvs(t);
  store.set('case:BANK-32', { prNumbers: [7, 8], packet: { sides: [] }, arbitration: { winner: null }, opinions: [] });
  const appCalls = mockApp(t, (path) => {
    if (path.includes('/comment/9001')) {
      return { ok: true, status: 200, json: async () => ({ author: { accountId: 'lead-1', accountType: 'atlassian' }, body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'decision: PR7 because the lock table is easier to read' }] }] } }) };
    }
    return { ok: true, status: 201, json: async () => ({}) };
  });
  const event = { issue: { key: 'BANK-32' }, comment: { id: '9001' } };
  await onComment(event);
  await onComment(event);
  assert.equal(store.get('case:BANK-32').decisions.length, 1);
  assert.equal(auditEvents(store).filter((e) => e.event === 'decision').length, 1);
  assert.equal(appCalls.filter((c) => c.method === 'POST' && c.path.endsWith('/comment')).length, 1);
});

// Actions that read or write as the app first check that the person can see the work item.
for (const [name, call] of [
  ['open-case', () => openCase({ issueKey: 'SEC-1', prNumbers: '7,8', question: 'winner' })],
  ['record-opinion', () => recordOpinion({ issueKey: 'SEC-1', opinion: '{}' })],
  ['get-pr-diff', () => getPrDiff({ issueKey: 'SEC-1', prNumber: 7 })],
  ['record-review', () => recordReview({ issueKey: 'SEC-1', prNumber: 7, review: '{}' })],
]) {
  test(`${name}: a person who cannot see the work item gets an error, and the app reads and writes nothing`, async (t) => {
    process.env.GITHUB_REPO = 'ysant77/yms-bank-demo';
    const store = mockKvs(t);
    store.set('case:SEC-1', { prNumbers: [7, 8], opinionAllowed: true, packet: { sides: [] }, arbitration: { rule: 'x' }, opinions: [] });
    store.set('review:SEC-1:7', { packet: { pr: { headSha: 'a'.repeat(40) }, hunks: [] }, retries: 0 });
    const before = JSON.stringify([...store.entries()]);
    mockUser(t, { canSee: (key) => key !== 'SEC-1' });
    const appCalls = mockApp(t);
    const r = await call();
    assert.equal(r.ok, false);
    assert.match(r.error, /cannot see SEC-1/);
    assert.equal(appCalls.length, 0);
    assert.equal(JSON.stringify([...store.entries()]), before);
  });
}
