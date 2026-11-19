// Decider rule (owner decision 19 Nov, item 3): a decision on an arbitration case is not recorded
// from the author of a PR in the case or from the claimant of the latest claim on the work item.
// The reply says why. A refused decision writes no audit event and does not change the case.
// Fail safe: when the app cannot show that the decider is neither of them (an unknown decider,
// claimant or PR author, or a decider whose GitHub account is not linked), it does not record.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import api from '@forge/api';
import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { onComment } from '../src/index.js';
import { deciderRule, parseGithubAccounts } from '../src/decision.js';

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
const auditEvents = (store) => [...store.entries()].filter(([k]) => k.startsWith('audit:0')).map(([, v]) => v);
const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const textOf = (body) => JSON.stringify(body);

// Jira as the app: comment reads by id, and every posted reply.
function mockJira(t, comments) {
  const posted = [];
  t.mock.method(api, 'asApp', () => ({
    requestJira: async (route, opts) => {
      const path = pathOf(route);
      const id = /\/comment\/(\d+)/.exec(path)?.[1];
      if (id && comments[id]) return { ok: true, status: 200, json: async () => comments[id] };
      if (opts?.method === 'POST' && path.endsWith('/comment')) posted.push(textOf(JSON.parse(opts.body).body));
      return { ok: true, status: 201, json: async () => ({}) };
    },
  }));
  return posted;
}

const kase = (authors) => ({
  prNumbers: [7, 8], packet: { sides: [] }, arbitration: { winner: null }, opinions: [],
  ...(authors === undefined ? {} : { prAuthors: authors }),
});
const AUTHORS = { PR7: { login: 'dev-seven', id: 7007 }, PR8: { login: 'Dev-Eight', id: 8008 } };
const ACCOUNTS = { 'lead-1': 'team-lead', 'dev-7': 'dev-seven', 'dev-8': 'dev-eight' };

test('the GitHub account list is read from "accountId=login" pairs; bad entries are left out', () => {
  assert.deepEqual(parseGithubAccounts('712020:abc=Team-Lead, dev-7=dev-seven,,bad,=x,y='), { '712020:abc': 'team-lead', 'dev-7': 'dev-seven' });
  assert.deepEqual(parseGithubAccounts(undefined), {});
  assert.deepEqual(parseGithubAccounts(''), {});
});

test('deciderRule: a person who is neither a PR author nor the latest claimant may decide', () => {
  assert.equal(deciderRule({ by: 'lead-1', kase: kase(AUTHORS), latestClaim: { by: 'dev-7' }, accounts: ACCOUNTS }), null);
  assert.equal(deciderRule({ by: 'lead-1', kase: kase(AUTHORS), latestClaim: null, accounts: ACCOUNTS }), null);
});

test('deciderRule: the author of a PR in the case is refused (login compared without case)', () => {
  assert.match(deciderRule({ by: 'dev-7', kase: kase(AUTHORS), latestClaim: null, accounts: ACCOUNTS }), /you are the author of PR7/);
  assert.match(deciderRule({ by: 'dev-8', kase: kase(AUTHORS), latestClaim: null, accounts: ACCOUNTS }), /you are the author of PR8/);
});

test('deciderRule: the claimant of the latest claim is refused', () => {
  assert.match(deciderRule({ by: 'lead-1', kase: kase(AUTHORS), latestClaim: { by: 'lead-1' }, accounts: ACCOUNTS }), /you made the latest claim/);
});

test('deciderRule: fail safe when a person or an author is not known', () => {
  const ok = { by: 'lead-1', kase: kase(AUTHORS), latestClaim: { by: 'dev-7' }, accounts: ACCOUNTS };
  assert.match(deciderRule({ ...ok, by: null }), /Jira did not say who wrote the decision/);
  assert.match(deciderRule({ ...ok, latestClaim: { by: null } }), /claimant of the latest claim is not known/);
  assert.match(deciderRule({ ...ok, kase: kase(undefined) }), /author of PR7 is not known/);
  assert.match(deciderRule({ ...ok, kase: kase({ PR7: AUTHORS.PR7, PR8: null }) }), /author of PR8 is not known/);
  assert.match(deciderRule({ ...ok, kase: kase({ PR7: AUTHORS.PR7, PR8: { login: '', id: 1 } }) }), /author of PR8 is not known/);
  assert.match(deciderRule({ ...ok, accounts: {} }), /GitHub account is not linked/);
});

// The comment trigger, end to end with KVS and Jira doubles.
function setup(t, { authors = AUTHORS, accounts = 'lead-1=team-lead,dev-7=dev-seven,dev-8=dev-eight', latest } = {}) {
  const store = mockKvs(t);
  store.set('case:BANK-32', kase(authors));
  if (latest !== undefined) store.set('latest-claim:BANK-32', latest);
  const old = process.env.GITHUB_ACCOUNTS;
  if (accounts === null) delete process.env.GITHUB_ACCOUNTS; else process.env.GITHUB_ACCOUNTS = accounts;
  t.after(() => { if (old === undefined) delete process.env.GITHUB_ACCOUNTS; else process.env.GITHUB_ACCOUNTS = old; });
  return store;
}
const decide = (by, id = '9001') => ({ [id]: { author: { accountId: by, accountType: 'atlassian' }, body: adf('decision: PR7 because the lock table is easier to read') } });

test('a decision from a PR author is not recorded; the reply says why; no audit event', async (t) => {
  const store = setup(t);
  const posted = mockJira(t, decide('dev-7'));
  await onComment({ issue: { key: 'BANK-32' }, comment: { id: '9001' } });
  assert.equal(store.get('case:BANK-32').decisions, undefined);
  assert.equal(auditEvents(store).length, 0);
  assert.equal(posted.length, 1);
  assert.match(posted[0], /Decision not recorded: you are the author of PR7/);
});

test('a decision from the latest claimant is not recorded', async (t) => {
  const store = setup(t, { latest: { by: 'lead-1', commentId: '8000' } });
  const posted = mockJira(t, decide('lead-1'));
  await onComment({ issue: { key: 'BANK-32' }, comment: { id: '9001' } });
  assert.equal(store.get('case:BANK-32').decisions, undefined);
  assert.equal(auditEvents(store).length, 0);
  assert.match(posted[0], /Decision not recorded: you made the latest claim/);
});

test('a decision when the decider\'s GitHub account is not linked is not recorded (fail safe)', async (t) => {
  const store = setup(t, { accounts: null });
  const posted = mockJira(t, decide('lead-1'));
  await onComment({ issue: { key: 'BANK-32' }, comment: { id: '9001' } });
  assert.equal(store.get('case:BANK-32').decisions, undefined);
  assert.match(posted[0], /GitHub account is not linked/);
});

test('a decision from another person is recorded with one audit event, as before', async (t) => {
  const store = setup(t, { latest: { by: 'dev-7', commentId: '8000' } });
  const posted = mockJira(t, decide('lead-1'));
  await onComment({ issue: { key: 'BANK-32' }, comment: { id: '9001' } });
  assert.equal(store.get('case:BANK-32').decisions.length, 1);
  assert.equal(store.get('case:BANK-32').decisions[0].by, 'lead-1');
  const events = auditEvents(store);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'decision');
  assert.match(posted[0], /Human decision on BANK-32: PR7/);
});

test('a claim comment records its author as the latest claimant of the work item', async (t) => {
  const store = mockKvs(t);
  t.mock.method(Queue.prototype, 'push', async () => ({}));
  mockJira(t, { 5001: { author: { accountId: 'dev-7', accountType: 'atlassian' }, body: adf('claim: done') } });
  await onComment({ issue: { key: 'BANK-32' }, comment: { id: '5001' } });
  assert.deepEqual({ ...store.get('latest-claim:BANK-32'), at: 'x' }, { by: 'dev-7', commentId: '5001', at: 'x' });
});

// The PR author comes from the pull request list the collector already reads (no extra call).
test('collectGithub gives the PR author as login and id', async () => {
  const { readFileSync } = await import('node:fs');
  const { collectGithub } = await import('../src/github-evidence.js');
  const { fetchFrom } = await import('./helpers/recorded-github.js');
  const c = JSON.parse(readFileSync(new URL('../fixtures/judge/U01.json', import.meta.url), 'utf8'));
  const run = (github) => collectGithub({ repo: 'ysant77/yms-bank-demo', key: c.ticket.key, token: 'local', fetchFn: fetchFrom(github) });
  // The recorded fixture has no user field: the author is null (not known), never a guess.
  assert.equal((await run(c.github)).pr.author, null);
  const withUser = structuredClone(c.github);
  withUser.pulls[0].user = { login: 'dev-seven', id: 7007, type: 'User' };
  assert.deepEqual((await run(withUser)).pr.author, { login: 'dev-seven', id: 7007 });
});
