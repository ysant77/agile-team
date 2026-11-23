// GitHub errors (lead review of 23 Nov, Codegeist finding 3): one classifier for a GitHub answer,
// a plain reason for each class, a bounded retry for server errors and short secondary limits,
// and a transient failure that is not stored as a final verdict and does not use a claim slot.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import api from '@forge/api';
import { kvs } from '@forge/kvs';
import { admitClaim, LIMITS, releaseClaim } from '../src/claim-intake.js';
import { classifyGithubResponse, collectGithub, collectPrStats, GitHubError } from '../src/github-evidence.js';
import { decide, verifyClaim } from '../src/verify-claim.js';

const NOW = Date.parse('2026-11-23T08:00:00Z');
const RESET = 1795000000; // seconds since 1970
const resetText = `${new Date(RESET * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const resp = (status, headers = {}, body = {}) => ({
  ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body),
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
});
const noSleep = async () => {};

// The seven answers of the review's repro script.
const SEVEN = {
  rate: resp(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(RESET) }),
  secondary403: resp(403, { 'retry-after': '60', 'x-ratelimit-remaining': '4990' }),
  secondary429: resp(429, { 'retry-after': '60' }),
  permission: resp(403, { 'x-ratelimit-remaining': '4990' }),
  badToken: resp(401),
  hidden: resp(404),
  server: resp(502),
};
const KINDS = {
  rate: 'rate_limited', secondary403: 'secondary_limit', secondary429: 'secondary_limit', permission: 'forbidden',
  badToken: 'auth', hidden: 'not_found', server: 'server',
};

test('the classifier gives each of the seven answers its class', () => {
  for (const [name, r] of Object.entries(SEVEN)) {
    const c = classifyGithubResponse(r, { now: NOW });
    assert.equal(c.kind, KINDS[name], name);
    assert.equal(c.status, r.status, name);
    assert.equal(c.transient, ['rate_limited', 'secondary_limit', 'server'].includes(c.kind), name);
  }
});

test('a secondary limit is read from the message when GitHub sends no retry-after', () => {
  const c = classifyGithubResponse(resp(403, { 'x-ratelimit-remaining': '4990' }), {
    now: NOW, message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.',
  });
  assert.equal(c.kind, 'secondary_limit');
  // GitHub says to wait at least one minute when it gives no time.
  assert.equal(c.retryAt, new Date(NOW + 60_000).toISOString());
});

test('the rate-limit answers name the time to try again', () => {
  assert.match(classifyGithubResponse(SEVEN.rate, { now: NOW }).reason, new RegExp(`try again after ${resetText}`));
  assert.equal(classifyGithubResponse(SEVEN.rate, { now: NOW }).retryAt, new Date(RESET * 1000).toISOString());
  assert.match(classifyGithubResponse(SEVEN.secondary403, { now: NOW }).reason, /try again after 2026-11-23 08:01 UTC/);
  assert.match(classifyGithubResponse(SEVEN.secondary429, { now: NOW }).reason, /HTTP 429.*try again after 2026-11-23 08:01 UTC/);
});

const TICKET = {
  key: 'T-1', type: 'Story', labels: [], subtasks: [], links: [],
  acceptanceCriteria: [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_x'] } }],
};

function claimDeps(fetchFn, over = {}) {
  const posted = { comments: [], properties: [], audits: [] };
  const data = new Map();
  const store = {
    data,
    get: async (k) => structuredClone(data.get(k)),
    set: async (k, v, opts) => {
      if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && data.has(k)) throw new Error('exists');
      data.set(k, structuredClone(v));
    },
    delete: async (k) => { data.delete(k); },
  };
  const d = {
    store,
    env: () => ({ repo: 'o/r', token: 't' }),
    collectJira: async () => TICKET,
    collectGithub: (args) => collectGithub({ ...args, sleep: noSleep, now: () => NOW }),
    collectPrStats,
    collectReviews: async () => [],
    readApprovals: async () => [],
    fetchFn,
    addVerdictProperty: async (k, r) => { posted.properties.push(r); return true; },
    appendAudit: async (e) => { posted.audits.push(e); return { seq: posted.audits.length, hash: 'abcdef0123456789' }; },
    addComment: async (k, t) => { posted.comments.push(t); },
    findComment: async (k, marker) => posted.comments.some((t) => t.includes(marker)),
    ...over,
  };
  return { d, posted, store };
}

test('seven stub answers give seven distinct reasons to the person who claimed', async (t) => {
  t.mock.method(console, 'log', () => {});
  const reasons = new Set();
  for (const [name, r] of Object.entries(SEVEN)) {
    const { d, posted } = claimDeps(async () => r);
    const out = await verifyClaim({ issueKey: 'T-1', claim: { id: `T-1:${name}`, type: 'done', by: 'a' } }, d);
    assert.equal(posted.comments.length, 1, name);
    reasons.add(out.reason);
  }
  assert.equal(reasons.size, 7);
});

test('a transient error is not stored as a verdict, and the person sees when to try again', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { d, posted } = claimDeps(async () => SEVEN.rate);
  const out = await verifyClaim({ issueKey: 'T-1', claim: { id: 'T-1:1', type: 'done', by: 'a' } }, d);
  assert.equal(out.result, 'not_checked');
  assert.equal(posted.properties.length, 0, 'no verdict property');
  assert.equal(posted.audits.length, 0, 'no audit entry');
  assert.equal(posted.comments.length, 1);
  assert.match(posted.comments[0], /was not checked/);
  assert.match(posted.comments[0], new RegExp(`try again after ${resetText}`));
  assert.match(posted.comments[0], /does not count toward the hourly claim limit/);
  // A second delivery of the same job posts nothing more.
  await verifyClaim({ issueKey: 'T-1', claim: { id: 'T-1:1', type: 'done', by: 'a' } }, d);
  assert.equal(posted.comments.length, 1);
});

test('a final error (401, 403 with calls left, 404) gives a stored Cannot verify with its own reason', async (t) => {
  t.mock.method(console, 'log', () => {});
  for (const name of ['badToken', 'permission', 'hidden']) {
    const { d, posted } = claimDeps(async () => SEVEN[name]);
    const out = await verifyClaim({ issueKey: 'T-1', claim: { id: `T-1:${name}`, type: 'done', by: 'a' } }, d);
    assert.equal(out.result, 'cannot_verify', name);
    assert.match(out.reason, /^code host not reachable: /, name);
    assert.equal(posted.audits.length >= 1, true, name);
  }
});

test('a transient error gives the claim slot back', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { d, store } = claimDeps(async () => SEVEN.server);
  const now = NOW;
  for (let i = 0; i < LIMITS.perIssuePerHour; i += 1) {
    assert.equal((await admitClaim({ issueKey: 'T-1', commentId: `c${i}`, authorId: 'a', now }, store)).ok, true);
  }
  assert.equal((await admitClaim({ issueKey: 'T-1', commentId: 'c-full', authorId: 'a', now }, store)).ok, false);
  const out = await verifyClaim({ issueKey: 'T-1', claim: { id: 'T-1:c0', type: 'done', by: 'a' } }, d);
  assert.equal(out.result, 'not_checked');
  assert.equal((await admitClaim({ issueKey: 'T-1', commentId: 'c-next', authorId: 'a', now }, store)).ok, true);
});

test('releaseClaim gives back only the slots of that claim', async () => {
  const data = new Map();
  const store = {
    get: async (k) => data.get(k),
    set: async (k, v, o) => { if (o?.keyPolicy === 'FAIL_IF_EXISTS' && data.has(k)) throw new Error('exists'); data.set(k, v); },
    delete: async (k) => { data.delete(k); },
  };
  await admitClaim({ issueKey: 'T-1', commentId: 'a', authorId: 'x', now: NOW }, store);
  await admitClaim({ issueKey: 'T-1', commentId: 'b', authorId: 'x', now: NOW }, store);
  const before = [...data.keys()].filter((k) => k.startsWith('claim-slot:')).length;
  await releaseClaim('T-1:a', store);
  const after = [...data.keys()].filter((k) => k.startsWith('claim-slot:'));
  assert.equal(after.length, before - 3);
  assert.equal(after.every((k) => data.get(k) === 'T-1:b'), true);
  await releaseClaim('T-1:unknown', store); // nothing stored: no error
});

// A merged PR with a CI report; every other read is empty.
const SHA = 'a'.repeat(40);
const PULL = { number: 3, title: 'T-1 fix', state: 'closed', merged_at: '2026-11-23T07:00:00Z', merge_commit_sha: 'b'.repeat(40),
  head: { ref: 'T-1-fix', sha: SHA, repo: { full_name: 'o/r' } }, base: { ref: 'main' }, html_url: 'https://x/3', user: { login: 'u', id: 1 } };
function repoFetch(log, first = null) {
  let failed = false;
  return async (url) => {
    log.push(url);
    if (first && !failed) { failed = true; return first; }
    if (/\/pulls\?/.test(url)) return resp(200, {}, [PULL]);
    if (/\/pulls\/3\/files/.test(url)) return resp(200, {}, [{ filename: 'src/a.py', status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b' }]);
    if (/actions\/runs\?head_sha/.test(url)) return resp(200, {}, { workflow_runs: [] });
    if (/check-runs/.test(url)) return resp(200, {}, { check_runs: [] });
    if (/comments/.test(url)) return resp(200, {}, []);
    return resp(404);
  };
}

test('a 502 and then a 200 give one verdict', async (t) => {
  t.mock.method(console, 'log', () => {});
  const log = [];
  const { d, posted } = claimDeps(repoFetch(log, SEVEN.server));
  const out = await verifyClaim({ issueKey: 'T-1', claim: { id: 'T-1:r', type: 'done', by: 'a' } }, d);
  assert.notEqual(out.result, 'not_checked');
  assert.doesNotMatch(out.reason, /code host not reachable/);
  assert.equal(posted.comments.length, 1);
  assert.equal(posted.audits.filter((e) => e.event === 'verdict').length, 1);
  assert.equal(log.filter((u) => /\/pulls\?/.test(u)).length, 2, 'the pull list was asked twice');
});

test('server errors are retried a bounded number of times', async () => {
  let calls = 0;
  const waits = [];
  await assert.rejects(
    collectGithub({ repo: 'o/r', key: 'T-1', fetchFn: async () => { calls += 1; return SEVEN.server; }, sleep: async (ms) => { waits.push(ms); }, now: () => NOW }),
    (e) => e instanceof GitHubError && e.kind === 'server' && /after 3 tries/.test(e.message),
  );
  assert.equal(calls, 3);
  assert.equal(waits.length, 2);
});

test('a short secondary limit is waited out once; a long one and the primary limit are not', async () => {
  let calls = 0;
  const short = resp(403, { 'retry-after': '2', 'x-ratelimit-remaining': '4990' });
  const log = [];
  const ok = repoFetch(log);
  const waits = [];
  const gh = await collectGithub({ repo: 'o/r', key: 'T-1', fetchFn: async (u) => { calls += 1; return calls === 1 ? short : ok(u); }, sleep: async (ms) => { waits.push(ms); }, now: () => NOW });
  assert.equal(gh.pr.number, 3);
  assert.deepEqual(waits, [2000]);
  for (const r of [SEVEN.secondary403, SEVEN.rate]) {
    let n = 0;
    await assert.rejects(collectGithub({ repo: 'o/r', key: 'T-1', fetchFn: async () => { n += 1; return r; }, sleep: noSleep, now: () => NOW }), GitHubError);
    assert.equal(n, 1);
  }
});

test('a network error is retried and then reported as transient', async () => {
  let calls = 0;
  await assert.rejects(
    collectGithub({ repo: 'o/r', key: 'T-1', fetchFn: async () => { calls += 1; throw new Error('socket hang up'); }, sleep: noSleep, now: () => NOW }),
    (e) => e instanceof GitHubError && e.kind === 'network' && e.transient,
  );
  assert.equal(calls, 3);
});

test('one claim reads the PR files once and never reads the PR twice', async (t) => {
  t.mock.method(console, 'log', () => {});
  const log = [];
  const { d } = claimDeps(repoFetch(log));
  const { verdict } = await decide({ issueKey: 'T-1', claim: { id: 'T-1:f', type: 'done', by: 'a' } }, d);
  assert.ok(verdict);
  assert.equal(log.filter((u) => /\/pulls\/3\/files/.test(u)).length, 1);
  assert.equal(log.filter((u) => /\/pulls\/3(\?|$)/.test(u)).length, 0);
});

test('collectGithub gives the Python patches, so no second read is needed', async () => {
  const gh = await collectGithub({ repo: 'o/r', key: 'T-1', fetchFn: repoFetch([]), sleep: noSleep, now: () => NOW });
  assert.deepEqual(gh.prPatches, { 'src/a.py': '@@ -1 +1 @@\n-a\n+b' });
});

test('the token is sent on the claim, discovery and commit paths', async (t) => {
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    seen.push({ url: String(url), auth: init?.headers?.Authorization ?? null });
    return new Response(JSON.stringify([{ sha: SHA, commit: { message: 'm', author: { date: 'd' } }, html_url: 'h' }]), { status: 200 });
  });
  const before = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token-value';
  try {
    const { readLatestCommit } = await import('../src/github.js');
    await readLatestCommit('o/r');
    const { forgeDeps } = await import('../src/discovery-actions.js');
    await forgeDeps().get('/repos/o/r/contents/x');
  } finally {
    if (before === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = before;
  }
  assert.equal(seen.length, 2);
  assert.equal(seen.every((s) => s.auth === 'Bearer test-token-value'), true);
});

// The review and case actions read GitHub through @forge/api, which calls the global fetch
// outside Forge. A GitHub error must give an answer to the agent, not an exception.
function actionMocks(t) {
  const store = new Map();
  t.mock.method(kvs, 'get', async (k) => structuredClone(store.get(k)));
  t.mock.method(kvs, 'set', async (k, v) => { store.set(k, structuredClone(v)); });
  t.mock.method(api, 'asUser', () => ({ requestJira: async () => ({ ok: true, status: 200, json: async () => ({ id: '1' }) }) }));
  t.mock.method(api, 'asApp', () => ({
    requestJira: async () => ({ ok: true, status: 200, json: async () => ({ key: 'BANK-4', fields: { summary: 's', issuetype: { name: 'Story' }, labels: [], subtasks: [], issuelinks: [] } }) }),
  }));
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
  t.mock.method(console, 'log', () => {});
}

test('the review action answers with the GitHub reason instead of throwing', async (t) => {
  actionMocks(t);
  const before = process.env.GITHUB_REPO;
  process.env.GITHUB_REPO = 'o/r';
  try {
    const { getPrDiff } = await import('../src/review-actions.js');
    const out = await getPrDiff({ issueKey: 'BANK-4', prNumber: 3 });
    assert.equal(out.ok, false);
    assert.match(out.error, /GitHub could not be read: .*HTTP 401/);
  } finally {
    if (before === undefined) delete process.env.GITHUB_REPO; else process.env.GITHUB_REPO = before;
  }
});

test('the case action answers with the GitHub reason instead of throwing', async (t) => {
  actionMocks(t);
  const before = process.env.GITHUB_REPO;
  process.env.GITHUB_REPO = 'o/r';
  try {
    const { openCase } = await import('../src/case-actions.js');
    const out = await openCase({ issueKey: 'BANK-4', prNumbers: '3,4' });
    assert.equal(out.ok, false);
    assert.match(out.error, /GitHub could not be read: .*HTTP 401/);
  } finally {
    if (before === undefined) delete process.env.GITHUB_REPO; else process.env.GITHUB_REPO = before;
  }
});
