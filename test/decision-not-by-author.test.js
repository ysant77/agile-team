// Decider rule (owner decision 19 Nov, item 3; split changed after the lead's review the same day).
// - Claimant check, always: a decision from the claimant of the latest claim on the work item is
//   not recorded; a claim whose claimant is not known also stops the decision.
// - PR-author check, when GITHUB_ACCOUNTS links the decider: the author of a PR in the case may
//   not decide. With no link (variable missing, or the decider not in it) the decision is
//   recorded with authorCheck "not checked", and the reply, the audit event, get-verdicts and the
//   monitor say so. Never silent.
// - A decider that Jira does not name: not recorded.
// A refused decision writes no audit event and does not change the case; the reply says why.

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

const rule = (x) => deciderRule({ by: 'lead-1', kase: kase(AUTHORS), latestClaim: { by: 'dev-7' }, accounts: ACCOUNTS, ...x });

test('deciderRule: linked and not a PR author: allowed, author check passed', () => {
  assert.deepEqual(rule({}), { refused: null, authorCheck: 'passed' });
  assert.deepEqual(rule({ latestClaim: null }), { refused: null, authorCheck: 'passed' });
});

test('deciderRule: linked and the author of a PR in the case: refused (login compared without case)', () => {
  assert.match(rule({ by: 'dev-7', latestClaim: null }).refused, /you are the author of PR7/);
  assert.match(rule({ by: 'dev-8', latestClaim: null }).refused, /you are the author of PR8/);
});

test('deciderRule: linked but a PR author is not known: refused, since the check is configured', () => {
  assert.match(rule({ kase: kase(undefined) }).refused, /author of PR7 is not known/);
  assert.match(rule({ kase: kase({ PR7: AUTHORS.PR7, PR8: null }) }).refused, /author of PR8 is not known/);
  assert.match(rule({ kase: kase({ PR7: AUTHORS.PR7, PR8: { login: '', id: 1 } }) }).refused, /author of PR8 is not known/);
});

test('deciderRule: no account link: allowed, author check "not checked"', () => {
  assert.deepEqual(rule({ accounts: {} }), { refused: null, authorCheck: 'not checked' });
  // The decider is not in the list, even though others are.
  assert.deepEqual(rule({ by: 'other-9' }), { refused: null, authorCheck: 'not checked' });
  // A case with no PR authors stored is still decided when no link exists.
  assert.deepEqual(rule({ accounts: {}, kase: kase(undefined) }), { refused: null, authorCheck: 'not checked' });
});

test('deciderRule: the claimant check is always on, with or without a link', () => {
  for (const accounts of [ACCOUNTS, {}]) {
    assert.match(rule({ accounts, latestClaim: { by: 'lead-1' } }).refused, /you made the latest claim/);
    assert.match(rule({ accounts, latestClaim: { by: null } }).refused, /claimant of the latest claim is not known/);
  }
});

test('deciderRule: a decider that Jira does not name is refused', () => {
  for (const accounts of [ACCOUNTS, {}]) assert.match(rule({ accounts, by: null }).refused, /Jira did not say who wrote the decision/);
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

test('with no account link the decision is recorded, marked "not checked" in the record, audit and reply', async (t) => {
  const store = setup(t, { accounts: null });
  const posted = mockJira(t, decide('dev-7'));
  await onComment({ issue: { key: 'BANK-32' }, comment: { id: '9001' } });
  const decisions = store.get('case:BANK-32').decisions;
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].authorCheck, 'not checked');
  const events = auditEvents(store);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.authorCheck, 'not checked');
  assert.match(posted[0], /Human decision on BANK-32: PR7/);
  assert.match(posted[0], /PR author not compared: no account link is configured/);
});

test('with no account link the claimant is still refused', async (t) => {
  const store = setup(t, { accounts: null, latest: { by: 'lead-1', commentId: '8000' } });
  const posted = mockJira(t, decide('lead-1'));
  await onComment({ issue: { key: 'BANK-32' }, comment: { id: '9001' } });
  assert.equal(store.get('case:BANK-32').decisions, undefined);
  assert.equal(auditEvents(store).length, 0);
  assert.match(posted[0], /Decision not recorded: you made the latest claim/);
});

test('get-verdicts and the monitor show the author check of a decision', async () => {
  const { summarise } = await import('../src/verdicts-action.js');
  const { buildMonitor } = await import('../src/monitor.js');
  const kaseWith = (authorCheck) => ({ prNumbers: [7, 8], arbitration: {}, opinions: [], decisions: [{ side: 'PR7', at: 'x', authorCheck }] });
  const open = summarise('BANK-32', { verdicts: [], kase: kaseWith('not checked'), head: null }, 5).arbitration.humanDecision;
  assert.equal(open.authorCheck, 'not checked');
  assert.match(open.note, /PR author not compared: no account link is configured/);
  const checked = summarise('BANK-32', { verdicts: [], kase: kaseWith('passed'), head: null }, 5).arbitration.humanDecision;
  assert.equal(checked.authorCheck, 'passed');
  assert.equal(checked.note, null);
  // An old decision (before the rule) has no field: shown as not checked.
  assert.equal(summarise('BANK-32', { verdicts: [], kase: kaseWith(undefined), head: null }, 5).arbitration.humanDecision.authorCheck, 'not checked');
  const m = buildMonitor([{ seq: 0, prevHash: '0'.repeat(64), event: 'decision', actor: 'lead-1', data: { issueKey: 'BANK-32', side: 'PR7', authorCheck: 'not checked' }, at: 'x', hash: 'h' }]);
  assert.equal(m.decisions[0].authorCheck, 'not checked');
});

test('a linked decider who wrote no PR and made no claim is recorded, author check passed', async (t) => {
  const store = setup(t, { latest: { by: 'dev-7', commentId: '8000' } });
  const posted = mockJira(t, decide('lead-1'));
  await onComment({ issue: { key: 'BANK-32' }, comment: { id: '9001' } });
  assert.equal(store.get('case:BANK-32').decisions.length, 1);
  assert.equal(store.get('case:BANK-32').decisions[0].by, 'lead-1');
  assert.equal(store.get('case:BANK-32').decisions[0].authorCheck, 'passed');
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
