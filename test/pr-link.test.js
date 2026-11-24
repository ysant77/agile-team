// Fresh-site path, option 1b (docs/DESIGN-FRESH-SITE.md): a person links a PR to the work item
// from the panel. The link is an audited entry in the app's store. A PR that does not name the
// key counts for a claim only with an audited link whose author is not the claimant.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextEvent } from '../src/audit.js';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { latestPrLink, linkPrAction, PR_LINK_EVENT } from '../src/pr-link.js';
import { decide } from '../src/verify-claim.js';

const REPO = 'ysant77/yms-bank-demo-cases';
const KEY = 'KAN-1';

function appStore() {
  const data = new Map();
  const events = [];
  let prev = null;
  return {
    data,
    events,
    store: { get: async (k) => structuredClone(data.get(k)), set: async (k, v) => { data.set(k, structuredClone(v)); } },
    appendAudit: async (e) => { const ev = nextEvent(prev, { ...e, at: `2026-11-23T10:0${events.length}:00.000Z` }); prev = ev; events.push(ev); return ev; },
    readAudit: async (seq, n) => events.slice(seq, seq + n),
  };
}
const pr = (number, extra = {}) => ({ number, headRepo: REPO, title: 'A filter for the statement', ...extra });
const linkDeps = (a, { canEdit = true, prs = { 7: pr(7) } } = {}) => ({
  canEdit: async () => canEdit, appendAudit: a.appendAudit, store: a.store, repo: REPO,
  readPr: async (n) => prs[n] ?? null,
});
const link = (a, accountId, pull, opts) => linkPrAction({ key: KEY, accountId, payload: { pr: pull, reason: 'the change for this work item' } }, linkDeps(a, opts));

test('a person links a PR of the configured repository; the link is audited and kept in the app store', async () => {
  const a = appStore();
  const r = await link(a, 'reviewer', '7');
  assert.equal(r.ok, true, r.error);
  assert.equal(a.events[0].event, PR_LINK_EVENT);
  assert.deepEqual(a.events[0].data, { key: KEY, repo: REPO, prNumber: 7, reason: 'the change for this work item' });
  const latest = await latestPrLink(KEY, a, 'claimer');
  assert.equal(latest.prNumber, 7);
  assert.equal(latest.counted, true);
});

test('a link to a PR of another repository, a fork PR, an unknown PR or a bad number is refused', async () => {
  const a = appStore();
  assert.match((await link(a, 'reviewer', 'https://github.com/someone/other/pull/7')).error, /another repository/);
  assert.equal((await link(a, 'reviewer', `https://github.com/${REPO}/pull/7`)).ok, true);
  assert.match((await link(a, 'reviewer', '8', { prs: { 8: pr(8, { headRepo: 'someone/fork' }) } })).error, /fork/);
  assert.match((await link(a, 'reviewer', '9')).error, /not found/);
  assert.match((await link(a, 'reviewer', 'x')).error, /pull request number/);
  assert.match((await link(a, 'reviewer', '7', { canEdit: false })).error, /edit this work item/);
});

test('a link made by the claimant does not count, and the reason says so', async () => {
  const a = appStore();
  await link(a, 'claimer', '7');
  const latest = await latestPrLink(KEY, a, 'claimer');
  assert.equal(latest.counted, false);
  assert.match(latest.reason, /made by the claimant/);
});

test('with two links the latest audited one is used, and the reason says how many there are', async () => {
  const a = appStore();
  await link(a, 'reviewer', '7', { prs: { 7: pr(7), 8: pr(8) } });
  await link(a, 'reviewer', '8', { prs: { 7: pr(7), 8: pr(8) } });
  const latest = await latestPrLink(KEY, a, 'claimer');
  assert.equal(latest.prNumber, 8);
  assert.match(latest.reason, /2 links; the latest \(audit seq 1\) is used/);
});

test('a link in the store with no matching audit event does not count', async () => {
  const a = appStore();
  await link(a, 'reviewer', '7');
  const entries = a.data.get(`pr-links:${KEY}`);
  entries[0].prNumber = 9; // edited after the audit event
  a.data.set(`pr-links:${KEY}`, entries);
  const latest = await latestPrLink(KEY, a, 'claimer');
  assert.equal(latest.counted, false);
  assert.match(latest.reason, /no matching audit event/);
});

// The claim: PR 7 does not name the key. Only a counted link makes it the claim's PR.
const SHA = 'a'.repeat(40);
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, headers: { get: () => '4999' } });
function repoFetch(log) {
  const pull = { number: 7, title: 'A filter for the statement', state: 'closed', merged_at: '2026-11-23T07:00:00Z', merge_commit_sha: 'b'.repeat(40),
    head: { ref: 'feat/filter', sha: SHA, repo: { full_name: REPO } }, base: { ref: 'main' }, html_url: 'https://x/7', user: { login: 'u', id: 1 } };
  return async (url) => {
    log.push(url);
    if (/\/pulls\?/.test(url)) return resp(200, [pull]);
    if (/\/pulls\/7\/files/.test(url)) return resp(200, [{ filename: 'src/a.py', status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b' }]);
    if (/actions\/runs\?head_sha/.test(url)) return resp(200, { workflow_runs: [] });
    if (/check-runs/.test(url)) return resp(200, { check_runs: [] });
    if (/comments/.test(url)) return resp(200, []);
    return resp(404, {});
  };
}
async function claim(a) {
  const log = [];
  const d = {
    collectJira: async () => ({ key: KEY, type: 'Story', labels: [], subtasks: [], links: [], acceptanceCriteria: [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_x'] } }] }),
    env: () => ({ repo: REPO, token: 't' }),
    collectGithub: (args) => collectGithub({ ...args, sleep: async () => {}, now: () => Date.parse('2026-11-23T10:00:00Z') }),
    collectPrStats, collectReviews: async () => [], fetchFn: repoFetch(log),
    store: a.store, readAudit: a.readAudit, readApprovals: async () => null,
  };
  const { verdict } = await decide({ issueKey: KEY, claim: { id: 'c', type: 'done', by: 'claimer' } }, d);
  return verdict;
}

test('a claim reads the PR of a counted link, though its title does not name the key', async (t) => {
  t.mock.method(console, 'log', () => {});
  const a = appStore();
  await link(a, 'reviewer', '7');
  const v = await claim(a);
  const onMain = v.checks.find((k) => k.name === 'on_main');
  assert.equal(onMain.status, 'pass', onMain.reason);
  const note = v.checks.find((k) => k.name === 'pr_link');
  assert.equal(note.status, 'pass');
  assert.match(note.reason, /PR #7 linked by reviewer \(audit seq 0\)/);
});

test('a claim with only the claimant\'s link does not use it: no PR names the key', async (t) => {
  t.mock.method(console, 'log', () => {});
  const a = appStore();
  await link(a, 'claimer', '7');
  const v = await claim(a);
  assert.equal(v.checks.find((k) => k.name === 'on_main').status, 'fail');
  assert.match(v.checks.find((k) => k.name === 'pr_link').reason, /made by the claimant/);
});

test('a claim with no link is as before, with no pr_link check', async (t) => {
  t.mock.method(console, 'log', () => {});
  const v = await claim(appStore());
  assert.equal(v.checks.some((k) => k.name === 'pr_link'), false);
});

test('pr_linked accepts a PR that does not name the key only when it is the counted linked PR', async () => {
  const c = await import('../src/verifier/checks.js');
  const base = { ticket: { key: KEY }, pr: { number: 7, title: 'A filter', branch: 'feat/filter', state: 'closed', merged: true }, prCandidates: [7], truncated: { pulls: false } };
  assert.equal(c.prLinked(base).status, 'fail');
  assert.equal(c.prLinked({ ...base, linkedPr: 7 }).status, 'pass');
  assert.equal(c.prLinked({ ...base, linkedPr: 8 }).status, 'fail');
});

test('a link with no repository, or for another repository than the configured one, does not count', async (t) => {
  t.mock.method(console, 'log', () => {});
  const a = appStore();
  // An entry and its audit event with no repo field: both written so that the hashes match.
  const ev = await a.appendAudit({ actor: 'reviewer', event: PR_LINK_EVENT, data: { key: KEY, prNumber: 7, reason: 'the change for this work item' } });
  await a.store.set(`pr-links:${KEY}`, [{ key: KEY, prNumber: 7, reason: 'the change for this work item', by: 'reviewer', at: ev.at, auditSeq: ev.seq }]);
  const latest = await latestPrLink(KEY, a, 'claimer');
  assert.equal(latest.counted, false);
  assert.match(latest.reason, /names no repository/);
  const v = await claim(a);
  assert.equal(v.checks.find((k) => k.name === 'on_main').status, 'fail');
});

// Owner decision 24 Nov: a "done" claim with no pull request stays Contradicted. A claim whose only
// PR link was made by the claimant is Cannot verify: a PR exists, but no second person linked it.
test('a done claim with no PR and no link stays contradicted', async (t) => {
  t.mock.method(console, 'log', () => {});
  const v = await claim(appStore());
  assert.equal(v.result, 'contradicted', v.reason);
});

test('a done claim whose only PR link was made by the claimant is cannot_verify, and the reason says why', async (t) => {
  t.mock.method(console, 'log', () => {});
  const a = appStore();
  await link(a, 'claimer', '7');
  const v = await claim(a);
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /PR #7 is linked only by the claimant/);
  assert.match(v.reason, /another person/);
  // The checks are kept as they are: on_main still fails, so the panel shows what is missing.
  assert.equal(v.checks.find((k) => k.name === 'on_main').status, 'fail');
});

test('a link with no matching audit event does not make a claim cannot_verify', async (t) => {
  t.mock.method(console, 'log', () => {});
  const a = appStore();
  await link(a, 'claimer', '7');
  const entries = a.data.get(`pr-links:${KEY}`);
  entries[0].prNumber = 9; // edited after the audit event
  a.data.set(`pr-links:${KEY}`, entries);
  const v = await claim(a);
  assert.equal(v.result, 'contradicted', v.reason);
});

test('the self-link rule changes only a verdict whose failed checks are all about the PR', async () => {
  const { selfLinkOnly } = await import('../src/verify-claim.js');
  const link7 = { prNumber: 7, counted: false, byClaimant: true };
  const v = (checks) => ({ result: 'contradicted', reason: 'r', checks });
  const prFail = { name: 'on_main', status: 'fail', reason: 'no PR' };
  assert.equal(selfLinkOnly(v([prFail]), link7, null).result, 'cannot_verify');
  // Another check fails as well: the claim is wrong for that reason too.
  assert.equal(selfLinkOnly(v([prFail, { name: 'subtasks_done', status: 'fail', reason: 'x' }]), link7, null).result, 'contradicted');
  // A PR was found by the key: the normal checks decide.
  assert.equal(selfLinkOnly(v([prFail]), link7, { number: 3 }).result, 'contradicted');
  // A link by another person, or no link: no change.
  assert.equal(selfLinkOnly(v([prFail]), { ...link7, byClaimant: false }, null).result, 'contradicted');
  assert.equal(selfLinkOnly(v([prFail]), null, null).result, 'contradicted');
  // Only a contradicted verdict changes.
  assert.equal(selfLinkOnly({ ...v([prFail]), result: 'supported' }, link7, null).result, 'supported');
});
