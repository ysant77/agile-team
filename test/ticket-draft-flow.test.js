// The narrow ticket confirmation end to end, with the Forge modules mocked: createTicket stores a
// draft with a number and posts nothing; Create of the stored draft posts exactly its fields, once,
// and the ticket.created event names the draft hash. A draft with no number is created at once.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import api from '@forge/api';
import { kvs } from '@forge/kvs';
import { canonical, sha256 } from '../src/audit.js';
import { appendAudit } from '../src/audit-store.js';
import { createFromDraft, createTicket } from '../src/index.js';
import { confirmDraft, listDrafts } from '../src/ticket-draft.js';

const pathOf = (r) => r?.value_ ?? String(r);
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
function mockUser(t, accountId = 'pm-1') {
  const posts = [];
  t.mock.method(api, 'asUser', () => ({
    requestJira: async (route, opts) => {
      const path = pathOf(route);
      if (path.startsWith('/rest/api/3/myself')) return { ok: true, status: 200, json: async () => ({ accountId }) };
      if (path === '/rest/api/3/field') return { ok: true, status: 200, json: async () => [] };
      if (path === '/rest/api/3/issue' && opts?.method === 'POST') { posts.push(JSON.parse(opts.body).fields); return { ok: true, status: 201, json: async () => ({ key: `BANK-${500 + posts.length}` }) }; }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    },
  }));
  return posts;
}
const numeric = { request: 'Refuse a transfer above 10000 EUR', projectKey: 'BANK', summary: 'Refuse a transfer above 10000 EUR',
  description: 'A transfer above the limit is refused.', storyPoints: 3, issueType: 'Story', acceptanceCriteria: 'an amount above 10000 EUR gives 422' };
const deps = { store: kvs, appendAudit, now: () => Date.now(), create: (draft, by) => createFromDraft(by, draft, undefined, { draftHash: sha256(canonical(draft)) }) };

test('a draft with a number is stored, not created; Create posts exactly the stored draft once', async (t) => {
  const store = mockKvs(t);
  const posts = mockUser(t);
  const r = await createTicket(numeric);
  assert.deepEqual([r.ok, r.pending, r.created], [true, true, false], r.error);
  assert.match(r.note, /a number/);
  assert.equal(posts.length, 0);
  const [d] = await listDrafts('pm-1', deps);
  assert.equal(d.draftId, r.draftId);
  assert.equal(d.request, numeric.request);
  const c = await confirmDraft({ draftId: r.draftId, accountId: 'pm-1' }, deps);
  assert.equal(c.ok, true, c.error);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].summary, numeric.summary);
  const events = [...store.entries()].filter(([k]) => k.startsWith('audit:0')).map(([, v]) => v);
  const created = events.find((e) => e.event === 'ticket.created');
  assert.equal(created.data.draftHash, sha256(canonical(d.draft)));
  assert.ok(events.some((e) => e.event === 'ticket.drafted'));
  assert.equal((await confirmDraft({ draftId: r.draftId, accountId: 'pm-1' }, deps)).duplicate, true);
  assert.equal(posts.length, 1);
});

test('a draft with no number, currency or money label is created at once, as before', async (t) => {
  mockKvs(t);
  const posts = mockUser(t);
  const r = await createTicket({ ...numeric, request: 'Show the customer name on the statement', summary: 'Show the customer name on the statement',
    description: 'The header shows the name.', acceptanceCriteria: 'the statement header has the customer name' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.pending, undefined);
  assert.equal(posts.length, 1);
});
