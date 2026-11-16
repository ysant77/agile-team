// Second independent review of unit 1 (16 Nov), items 1 to 8. Each test failed before its fix.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { admitClaim } from '../src/claim-intake.js';
import { collectGithub } from '../src/github-evidence.js';
import { verifyClaim, VERIFY_CONFIG } from '../src/verify-claim.js';
import { namesKey } from '../src/verifier/report.js';
import { bugTestExists, ciGreen, DEFAULT_TRUST_PATHS, pipelineChange, prLinked, reportTrusted } from '../src/verifier/checks.js';

const REPO = 'ysant77/yms-bank-demo';
const CI = '.github/workflows/ci.yml';
const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function fakeFetch(routes) {
  const fetchFn = async (url) => {
    const hit = routes.find(([p]) => p.test(url));
    if (!hit) return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
    const body = typeof hit[1] === 'function' ? hit[1](url) : hit[1];
    return { ok: true, status: 200, json: async () => body, headers: { get: () => '4999' } };
  };
  return { fetchFn };
}
const page = (url) => Number(new URL(url).searchParams.get('page') ?? 1);
const pull = (number, title, full = REPO) => ({
  number, title, state: 'open', merged_at: null, html_url: `https://github.com/${REPO}/pull/${number}`,
  head: { ref: `branch-${number}`, sha: HEAD, repo: { full_name: full } },
});
const full = (n, make) => Array.from({ length: n }, (_, i) => make(i));
const ctx = (over = {}) => ({ ticket: { key: 'BANK-1', type: 'Bug' }, config: VERIFY_CONFIG, ...over });

test('R1: a full last page of PR files makes the file list unknown, not complete', async () => {
  const { fetchFn } = fakeFetch([
    [/\/pulls\?/, (u) => (page(u) === 1 ? [pull(3, 'BANK-1 fix')] : [])],
    [/\/pulls\/3\/files/, () => full(100, (i) => ({ filename: `src/f${i}.py` }))],
  ]);
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
  assert.equal(gh.prFiles, null);
  assert.match(pipelineChange(ctx({ prFiles: gh.prFiles })), /not available/);
});

test('R1: a full last page of PRs with no match is unknown, never "no PR"', async () => {
  const { fetchFn } = fakeFetch([[/\/pulls\?/, () => full(100, (i) => pull(1000 + i, `OTHER-${i} work`))]]);
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
  assert.equal(gh.pr, null);
  assert.equal(gh.truncated.pulls, true);
  assert.equal(prLinked(ctx(gh)).status, 'unknown');
});

test('R1: a full last page of comments or runs is unknown', async () => {
  const { fetchFn } = fakeFetch([
    [/\/pulls\?/, (u) => (page(u) === 1 ? [pull(3, 'BANK-1 fix')] : [])],
    [/\/issues\/3\/comments/, () => full(100, (i) => ({ user: { login: 'raj' }, body: `c${i}` }))],
    [/\/actions\/runs\?/, () => ({ workflow_runs: full(100, () => ({ name: 'CI', path: CI, head_sha: HEAD, status: 'completed', conclusion: 'success' })) })],
    [/\/pulls\/3\/files/, (u) => (page(u) === 1 ? [{ filename: 'src/a.py' }] : [])],
  ]);
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
  assert.equal(gh.truncated.comments, true);
  assert.equal(gh.truncated.runs, true);
  const c = ctx({ ...gh, report: { head_sha: HEAD }, reportAuthor: 'github-actions[bot]', baseWorkflowFiles: {} });
  assert.match(reportTrusted(c).reason, /comment list .*not complete/);
  assert.equal(ciGreen(c).status, 'unknown');
  assert.match(ciGreen(c).reason, /run list .*not complete/);
});

test('R2: a 404 on the PR file list stops the read; it is not "no change"', async () => {
  const { fetchFn } = fakeFetch([[/\/pulls\?/, (u) => (page(u) === 1 ? [pull(3, 'BANK-1 fix')] : [])]]);
  await assert.rejects(collectGithub({ repo: REPO, key: 'BANK-1', fetchFn }), /pulls\/3\/files: HTTP 404/);
});

test('R3: a change to a composite action or to any conftest.py makes CI evidence unknown', () => {
  for (const paths of [DEFAULT_TRUST_PATHS, VERIFY_CONFIG.reportTrustPaths]) {
    const c = (f) => ctx({ prFiles: [f], config: { reportTrustPaths: paths } });
    assert.ok(pipelineChange(c('.github/actions/report/action.yml')));
    assert.ok(pipelineChange(c('conftest.py')));
    assert.ok(pipelineChange(c('tests/unit/conftest.py')));
    assert.equal(pipelineChange(c('src/bank/conftest_helpers.py')), null);
  }
});

test('R4: the repository name is compared without case', async () => {
  const { fetchFn } = fakeFetch([
    [/\/pulls\?/, (u) => (page(u) === 1 ? [pull(3, 'BANK-1 fix', 'YSant77/YMS-Bank-Demo')] : [])],
    [/\/pulls\/3\/files/, (u) => (page(u) === 1 ? [{ filename: 'src/a.py' }] : [])],
  ]);
  const gh = await collectGithub({ repo: 'ysant77/yms-bank-demo', key: 'BANK-1', fetchFn });
  assert.equal(gh.pr?.number, 3);
});

test('R5: a test or a title names the key only at a boundary on both sides', () => {
  const report = (id) => ({ schema: 'aat-ci-report/1', head_sha: HEAD, workflow_files: {}, tests: [{ id: `t.py::${id}`, outcome: 'passed' }] });
  const c = (id) => ({ ...ctx(), pr: { headSha: HEAD }, report: report(id), reportAuthor: 'github-actions[bot]', baseWorkflowFiles: {}, prFiles: [],
    reportComment: { updatedAt: '2026-11-16T01:05:00Z' },
    workflowRuns: [{ path: CI, headSha: HEAD, status: 'completed', conclusion: 'success', createdAt: '2026-11-16T01:00:00Z', updatedAt: '2026-11-16T01:06:00Z' }] });
  assert.equal(bugTestExists(c('test_BANK1_x')).status, 'pass');
  assert.equal(bugTestExists(c('test_ABANK1_x')).status, 'fail');
  assert.equal(namesKey('BANK-1abc tidy', 'BANK-1'), false);
  assert.equal(namesKey('BANK-1: fix', 'BANK-1'), true);
  assert.equal(namesKey('fix/BANK-1-statement', 'BANK-1'), true);
});

function lockingStore() {
  const data = new Map();
  return {
    data,
    get: async (k) => structuredClone(data.get(k)),
    set: async (k, v, opts) => {
      await Promise.resolve();
      if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && data.has(k)) throw new Error('key exists');
      data.set(k, structuredClone(v));
    },
    delete: async (k) => { data.delete(k); },
  };
}

test('R7: a failed save after the comment does not post a second verdict', async () => {
  const comments = [];
  const store = lockingStore();
  let failNext = false;
  const set = store.set;
  store.set = async (k, v, o) => { if (failNext && v?.done) { failNext = false; throw new Error('KVS 500'); } return set(k, v, o); };
  const d = {
    store,
    env: () => ({ repo: null }),
    collectJira: async () => ({ key: 'BANK-1', type: 'Story', acceptanceCriteria: [] }),
    addVerdictProperty: async () => true,
    appendAudit: async () => ({ seq: 1, hash: 'abcdef0123456789' }),
    addComment: async (k, t) => { comments.push(t); },
    findComment: async (k, marker) => comments.some((t) => t.includes(marker)),
  };
  failNext = true;
  const claim = { id: 'BANK-1:7', type: 'fixed' };
  await assert.rejects(verifyClaim({ issueKey: 'BANK-1', claim }, d), /KVS 500/);
  await verifyClaim({ issueKey: 'BANK-1', claim }, d);
  assert.equal(comments.length, 1);
  assert.match(comments[0], /\[verdict BANK-1:7\]/);
});

test('R7: two deliveries of the same claim at the same time post one verdict', async () => {
  const comments = [];
  const store = lockingStore();
  const d = {
    store,
    env: () => ({ repo: null }),
    collectJira: async () => ({ key: 'BANK-1', type: 'Story', acceptanceCriteria: [] }),
    addVerdictProperty: async () => true,
    appendAudit: async () => ({ seq: 1, hash: 'abcdef0123456789' }),
    addComment: async (k, t) => { await new Promise((r) => setTimeout(r, 5)); comments.push(t); },
    findComment: async (k, marker) => comments.some((t) => t.includes(marker)),
  };
  const claim = { id: 'BANK-1:8', type: 'fixed' };
  const results = await Promise.allSettled([verifyClaim({ issueKey: 'BANK-1', claim }, d), verifyClaim({ issueKey: 'BANK-1', claim }, d)]);
  // The second delivery may throw so the queue retries it later; it never posts.
  assert.ok(results.some((r) => r.status === 'fulfilled'));
  await verifyClaim({ issueKey: 'BANK-1', claim }, d);
  assert.equal(comments.length, 1);
});

test('R8: concurrent admissions never pass the cap', async () => {
  const store = lockingStore();
  const now = Date.parse('2026-11-16T10:00:00Z');
  const runs = await Promise.all(full(10, (i) => admitClaim({ issueKey: 'BANK-1', commentId: String(i), authorId: `u${i}`, now }, store)));
  assert.equal(runs.filter((r) => r.ok).length, 5);
});

test('R8: one author cannot use the whole site cap', async () => {
  const store = lockingStore();
  const now = Date.parse('2026-11-16T10:00:00Z');
  const limits = { perIssuePerHour: 5, perSitePerHour: 30, perAuthorPerHour: 3 };
  const out = [];
  for (let i = 0; i < 6; i += 1) out.push(await admitClaim({ issueKey: `BANK-${i}`, commentId: String(i), authorId: 'mallory', now }, store, limits));
  assert.equal(out.filter((r) => r.ok).length, 3);
  assert.match(out[3].reason, /author/);
  assert.equal((await admitClaim({ issueKey: 'BANK-9', commentId: '99', authorId: 'alice', now }, store, limits)).ok, true);
});
