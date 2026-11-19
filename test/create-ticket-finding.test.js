// f3: a ticket drafted from a discovery finding names the finding and carries the label
// "unconfirmed" until a CI report shows the proposed reproducer fails on base. A finding id that
// does not exist, or a finding that found no defect, is refused before any Jira write. The Forge
// read actions use no GitHub token and the configured investigated branch.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import api from '@forge/api';
import { kvs } from '@forge/kvs';
import { createTicket } from '../src/index.js';
import { listRepoFilesAction, readRepoFileAction, startInvestigationAction } from '../src/discovery-actions.js';

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
      if (path === '/rest/api/3/issue' && opts?.method === 'POST') { posts.push(JSON.parse(opts.body).fields); return { ok: true, status: 201, json: async () => ({ key: `BANK-${300 + posts.length}` }) }; }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    },
  }));
  return posts;
}

const FINDING_ID = 'F-0123456789ab-89abcdef';
const finding = (kind = 'defect') => ({
  findingId: FINDING_ID, kind, status: 'unconfirmed', hypothesis: 'withdraw checks the balance before the write transaction.',
  reproducer: kind === 'defect' ? { testName: 'test_two_processes_withdraw_at_once', file: 'tests/test_ledger.py', asserts: 'one withdrawal succeeds' } : null,
});
const draft = (extra = {}) => ({
  request: 'A customer withdrew twice and the balance went below zero', projectKey: 'BANK', summary: 'Two withdrawals at once overdraw an account',
  description: 'Two withdrawals at the same time both pass the balance check.', storyPoints: 3, issueType: 'Bug', ...extra,
});

test('a ticket from a finding names the finding and carries the label "unconfirmed"', async (t) => {
  const store = mockKvs(t);
  store.set(`finding:${FINDING_ID}`, finding());
  const posts = mockUser(t);
  const r = await createTicket(draft({ findingId: FINDING_ID }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(posts[0].labels, ['unconfirmed']);
  assert.match(JSON.stringify(posts[0].description), new RegExp(`Finding ${FINDING_ID} \\(unconfirmed\\)`));
  assert.match(JSON.stringify(posts[0].description), /test_two_processes_withdraw_at_once/);
  const audit = [...store.entries()].filter(([k]) => k.startsWith('audit:0')).map(([, v]) => v).find((e) => e.event === 'ticket.created');
  assert.equal(audit.data.findingId, FINDING_ID);
});

test('a finding id that does not exist, or a no-defect finding, is refused before any Jira write', async (t) => {
  const store = mockKvs(t);
  const posts = mockUser(t);
  for (const id of ['F-0123456789ab-00000000', 'not-an-id']) {
    const r = await createTicket(draft({ findingId: id }));
    assert.equal(r.ok, false, id);
    assert.match(r.error, /no finding/);
  }
  store.set(`finding:${FINDING_ID}`, finding('no_defect'));
  const r = await createTicket(draft({ findingId: FINDING_ID }));
  assert.equal(r.ok, false);
  assert.match(r.error, /found no defect/);
  assert.equal(posts.length, 0);
});

test('a ticket without a finding is unchanged: no label', async (t) => {
  mockKvs(t);
  const posts = mockUser(t);
  const r = await createTicket(draft());
  assert.equal(r.ok, true, r.error);
  assert.equal(posts[0].labels, undefined);
});

test('the Forge read actions use no token and the configured branch', async (t) => {
  mockKvs(t);
  mockUser(t);
  const seen = [];
  t.mock.method(api, 'fetch', async (url, opts) => {
    seen.push({ url, auth: opts?.headers?.Authorization ?? null });
    if (url.endsWith('/commits/investigate%2Fsymptoms')) return { ok: true, status: 200, json: async () => ({ sha: 'c'.repeat(40) }), headers: { get: () => null } };
    return { ok: true, status: 200, json: async () => ({ tree: [{ path: 'src/a.py', type: 'blob', size: 1 }, { path: 'seeds/k1_race.patch', type: 'blob', size: 1 }] }), headers: { get: () => null } };
  });
  const env = { ...process.env };
  t.after(() => { process.env = env; });
  process.env.GITHUB_TOKEN = 'secret-token';
  delete process.env.DISCOVERY_REPO;
  assert.equal((await startInvestigationAction({ symptom: 'x' })).ok, false, 'no repository configured');
  process.env.DISCOVERY_REPO = 'ysant77/yms-bank-demo-cases';
  process.env.DISCOVERY_REF = 'investigate/symptoms';
  const started = await startInvestigationAction({ symptom: 'The balance went below zero.' });
  assert.equal(started.ok, true, started.error);
  const list = await listRepoFilesAction({ investigationId: started.investigationId });
  assert.deepEqual(list.files.map((f) => f.path), ['src/a.py']);
  assert.ok(seen.length === 2 && seen.every((s) => s.auth === null && s.url.startsWith('https://api.github.com/repos/ysant77/yms-bank-demo-cases/')));
  const refused = await readRepoFileAction({ investigationId: started.investigationId, path: 'seeds/k1_race.patch' });
  assert.equal(refused.ok, false);
  assert.equal(seen.length, 2);
});
