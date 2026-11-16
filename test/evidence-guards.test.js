// Holes found in the review of unit 1 (16 Nov). Each test failed before its fix.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { collectGithub } from '../src/github-evidence.js';
import { ciGreen, prLinked, reportTrusted } from '../src/verifier/checks.js';
import { verify } from '../src/verifier/verdict.js';

const REPO = 'ysant77/yms-bank-demo';
const BOT = 'github-actions[bot]';
const CI = '.github/workflows/ci.yml';
const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

// A fake GitHub: routes are [pattern, body or (url) => body]. Unknown paths answer 404.
function fakeFetch(routes) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const hit = routes.find(([p]) => p.test(url));
    if (!hit) return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
    const body = typeof hit[1] === 'function' ? hit[1](url) : hit[1];
    return { ok: true, status: 200, json: async () => body, headers: { get: () => '4999' } };
  };
  return { fetchFn, calls };
}

const pull = (number, title, extra = {}) => ({
  number, title, state: 'open', merged_at: null, html_url: `https://github.com/${REPO}/pull/${number}`,
  head: { ref: `branch-${number}`, sha: `${HEAD.slice(0, 38)}${String(number).padStart(2, '0')}`, repo: { full_name: REPO } }, ...extra,
});
const page = (url) => Number(new URL(url).searchParams.get('page') ?? 1);

const goodCtx = (over = {}) => ({
  ticket: { key: 'BANK-1', type: 'Story', acceptanceCriteria: [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_BANK1_x'] } }] },
  pr: { number: 3, title: 'BANK-1 fix', state: 'open', headSha: HEAD },
  report: { schema: 'aat-ci-report/1', head_sha: HEAD, workflow_files: { [CI]: 'h1' }, tests: [{ id: 't.py::test_BANK1_x', outcome: 'passed' }] },
  reportAuthor: BOT,
  reportComment: { createdAt: '2026-11-16T01:05:00Z', updatedAt: '2026-11-16T01:09:00Z' },
  baseWorkflowFiles: { [CI]: 'h1' },
  prFiles: ['src/bank/accounts.py', 'tests/test_accounts.py'],
  workflowRuns: [{ name: 'CI', path: CI, headSha: HEAD, status: 'completed', conclusion: 'success', createdAt: '2026-11-16T01:00:00Z', updatedAt: '2026-11-16T01:09:30Z' }],
  config: { requiredWorkflowPaths: [CI], reportTrustPaths: ['.github/workflows/', 'src/bank/testing/'] },
  ...over,
});

test('the good context is supported (control)', () => {
  assert.equal(verify({ id: 'c', type: 'ready' }, goodCtx()).result, 'supported');
});

test('B1: the test script runs on Node 24 (a glob, not a bare directory)', () => {
  const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts.test;
  assert.doesNotMatch(script, /--test\s+test\/?\s*$/);
  assert.match(script, /--test\s+["']?test\/\*\*\/\*\.test\.js/);
  assert.equal(readFileSync('.node-version', 'utf8').trim(), '24');
});

test('B2: the PR must name the key at a boundary, not as a prefix', async () => {
  const { fetchFn } = fakeFetch([[/\/pulls\?/, (u) => (page(u) === 1 ? [pull(20, 'BANK-10 recon'), pull(3, 'BANK-1 fix')] : [])]]);
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
  assert.equal(gh.pr.number, 3);
  assert.equal(prLinked(goodCtx({ pr: { number: 20, title: 'BANK-10 recon', state: 'open', headSha: HEAD } })).status, 'fail');
  assert.equal(prLinked(goodCtx({ pr: { number: 4, title: 'x', branch: 'fix/bank-1-lock', state: 'open', headSha: HEAD } })).status, 'pass');
});

test('B2: a PR from a fork is not linked', async () => {
  const fork = pull(9, 'BANK-1 fix', { head: { ref: 'x', sha: HEAD, repo: { full_name: 'someone/yms-bank-demo' } } });
  const { fetchFn } = fakeFetch([[/\/pulls\?/, (u) => (page(u) === 1 ? [fork] : [])]]);
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
  assert.equal(gh.pr, null);
});

test('B2: two open PRs that name the key make the claim unverifiable', async () => {
  const { fetchFn } = fakeFetch([[/\/pulls\?/, (u) => (page(u) === 1 ? [pull(5, 'BANK-1 lock'), pull(7, 'BANK-1 retry')] : [])]]);
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
  assert.deepEqual(gh.prCandidates, [5, 7]);
  const linked = prLinked(goodCtx({ prCandidates: [5, 7] }));
  assert.equal(linked.status, 'unknown');
  assert.equal(verify({ id: 'c', type: 'ready' }, goodCtx({ prCandidates: [5, 7] })).result, 'cannot_verify');
});

test('B3: a second workflow named CI cannot replace the pinned one', () => {
  const runs = [
    { name: 'CI', path: CI, headSha: HEAD, status: 'completed', conclusion: 'failure', createdAt: '2026-11-16T01:00:00Z' },
    { name: 'CI', path: '.github/workflows/ci2.yml', headSha: HEAD, status: 'completed', conclusion: 'success', createdAt: '2026-11-16T02:00:00Z' },
  ];
  assert.equal(ciGreen(goodCtx({ workflowRuns: runs })).status, 'fail');
  const onlyFake = [runs[1]];
  assert.equal(ciGreen(goodCtx({ workflowRuns: onlyFake })).status, 'unknown');
});

test('B3: every run of the pinned workflow on the head must succeed', () => {
  const runs = [
    { name: 'CI', path: CI, headSha: HEAD, status: 'completed', conclusion: 'failure', createdAt: '2026-11-16T01:00:00Z' },
    { name: 'CI', path: `${CI}@refs/pull/3/merge`, headSha: HEAD, status: 'completed', conclusion: 'success', createdAt: '2026-11-16T02:00:00Z' },
  ];
  assert.equal(ciGreen(goodCtx({ workflowRuns: runs })).status, 'fail');
});

test('B4a: a missing base workflow fingerprint is unknown, not a pass', () => {
  assert.equal(reportTrusted(goodCtx({ baseWorkflowFiles: null })).status, 'unknown');
  assert.equal(reportTrusted(goodCtx({ baseWorkflowFiles: undefined })).status, 'unknown');
});

test('B4b: a PR that changes a workflow or the report plugin cannot vouch for its own CI', () => {
  for (const file of [CI, '.github/workflows/new.yml', 'src/bank/testing/ci_report.py']) {
    const ctx = goodCtx({ prFiles: ['src/a.py', file] });
    assert.equal(reportTrusted(ctx).status, 'unknown', file);
    assert.equal(ciGreen(ctx).status, 'unknown', file);
    assert.equal(verify({ id: 'c', type: 'ready' }, ctx).result, 'cannot_verify', file);
  }
  assert.equal(reportTrusted(goodCtx({ prFiles: undefined })).status, 'unknown');
});

test('B4b: the verifier reads every page of the PR file list', async () => {
  const files = (n, start) => Array.from({ length: n }, (_, i) => ({ filename: `src/f${start + i}.py`, status: 'modified' }));
  const { fetchFn } = fakeFetch([
    [/\/pulls\?/, (u) => (page(u) === 1 ? [pull(3, 'BANK-1 fix')] : [])],
    [/\/pulls\/3\/files/, (u) => (page(u) === 1 ? files(100, 0) : page(u) === 2 ? [...files(10, 100), { filename: CI, status: 'modified' }] : [])],
  ]);
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
  assert.equal(gh.prFiles.length, 111);
  assert.ok(gh.prFiles.includes(CI));
});

test('B4c: a report comment edited after the pinned run ended is not trusted', async () => {
  assert.equal(reportTrusted(goodCtx({ reportComment: { createdAt: '2026-11-16T01:05:00Z', updatedAt: '2026-11-16T03:00:00Z' } })).status, 'unknown');
  assert.equal(reportTrusted(goodCtx({ reportComment: undefined })).status, 'unknown');
  const comment = (updated) => ({
    user: { login: BOT, id: 41898282, type: 'Bot' }, created_at: '2026-11-16T01:05:00Z', updated_at: updated,
    body: `<!-- aat-ci-report -->\n\`\`\`json\n${JSON.stringify({ schema: 'aat-ci-report/1', head_sha: HEAD, tests: [] })}\n\`\`\``,
  });
  const { fetchFn } = fakeFetch([
    [/\/pulls\?/, (u) => (page(u) === 1 ? [pull(3, 'BANK-1 fix', { head: { ref: 'b', sha: HEAD, repo: { full_name: REPO } } })] : [])],
    [/\/issues\/3\/comments/, (u) => (page(u) === 1 ? [comment('2026-11-16T03:00:00Z')] : [])],
  ]);
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
  assert.deepEqual(gh.reportComment, { createdAt: '2026-11-16T01:05:00Z', updatedAt: '2026-11-16T03:00:00Z' });
});

test('F1: a repository GitHub hides (404 on the PR list) is an error, not "no PR"', async () => {
  const { fetchFn } = fakeFetch([]);
  await assert.rejects(collectGithub({ repo: REPO, key: 'BANK-1', fetchFn }), /HTTP 404/);
});

test('F2: the PR list, the comments and the runs are read past the first page', async () => {
  const filler = (n, from) => Array.from({ length: n }, (_, i) => pull(100 + from + i, `OTHER-${from + i} work`));
  const report = (head) => `<!-- aat-ci-report -->\n\`\`\`json\n${JSON.stringify({ schema: 'aat-ci-report/1', head_sha: head, tests: [] })}\n\`\`\``;
  const target = pull(3, 'BANK-1 fix', { head: { ref: 'b', sha: HEAD, repo: { full_name: REPO } } });
  const other = (i) => ({ user: { login: 'raj' }, body: `comment ${i}`, created_at: 't', updated_at: 't' });
  const { fetchFn } = fakeFetch([
    [/\/pulls\?/, (u) => (page(u) === 1 ? filler(100, 0) : page(u) === 2 ? [target] : [])],
    [/\/issues\/3\/comments/, (u) => (page(u) === 1 ? Array.from({ length: 100 }, (_, i) => other(i))
      : page(u) === 2 ? [{ user: { login: BOT, id: 41898282, type: 'Bot' }, body: report(HEAD), created_at: 'a', updated_at: 'b' }] : [])],
    [/\/actions\/runs\?/, (u) => ({ workflow_runs: page(u) === 1
      ? Array.from({ length: 100 }, () => ({ name: 'CI', path: CI, head_sha: HEAD, status: 'completed', conclusion: 'success' }))
      : page(u) === 2 ? [{ name: 'CI', path: CI, head_sha: HEAD, status: 'completed', conclusion: 'failure' }] : [] })],
  ]);
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
  assert.equal(gh.pr.number, 3);
  assert.equal(gh.report.head_sha, HEAD);
  assert.equal(gh.workflowRuns.length, 101);
});

test('F3: only the comment author makes a report trusted, never a field inside the report', () => {
  const ctx = goodCtx({ reportAuthor: undefined, report: { ...goodCtx().report, author: BOT } });
  assert.equal(reportTrusted(ctx).status, 'unknown');
});

test('F4: "fixed" and "ready" accept an open PR, and the reason says it is not merged', () => {
  const v = verify({ id: 'c', type: 'ready' }, goodCtx());
  assert.equal(v.result, 'supported');
  assert.match(v.checks.find((c) => c.name === 'pr_linked').reason, /open, not merged/);
  const merged = prLinked(goodCtx({ pr: { ...goodCtx().pr, state: 'closed', merged: true } }));
  assert.doesNotMatch(merged.reason, /not merged/);
});

test('F10: a report comment from anyone but the CI bot is ignored', async () => {
  const body = `<!-- aat-ci-report -->\n\`\`\`json\n${JSON.stringify({ schema: 'aat-ci-report/1', head_sha: HEAD, tests: [] })}\n\`\`\``;
  const { fetchFn } = fakeFetch([
    [/\/pulls\?/, (u) => (page(u) === 1 ? [pull(3, 'BANK-1 fix')] : [])],
    [/\/issues\/3\/comments/, (u) => (page(u) === 1 ? [{ user: { login: 'raj' }, body, created_at: 'a', updated_at: 'a' }] : [])],
  ]);
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
  assert.equal(gh.report, null);
  assert.equal(gh.reportAuthor, null);
});

test('F10: an HTTP error other than 404 stops the evidence read', async () => {
  const fetchFn = async () => ({ ok: false, status: 502, json: async () => ({}), headers: { get: () => null } });
  await assert.rejects(collectGithub({ repo: REPO, key: 'BANK-1', fetchFn }), /HTTP 502/);
});

// B4(c) as decided on 16 Nov: a heuristic time window until the report moves to a check run.
const windowCtx = (updatedAt, runs) => goodCtx({
  reportComment: { createdAt: '2026-11-16T01:05:00Z', updatedAt },
  workflowRuns: runs ?? [{ name: 'CI', path: CI, headSha: HEAD, status: 'completed', conclusion: 'success',
    createdAt: '2026-11-16T01:00:00Z', runStartedAt: '2026-11-16T01:00:05Z', updatedAt: '2026-11-16T01:09:30Z' }],
});

test('B4c: an edit after the pinned run window is not trusted, and the reason names the heuristic', () => {
  const r = reportTrusted(windowCtx('2026-11-16T01:12:00Z'));
  assert.equal(r.status, 'unknown');
  assert.match(r.reason, /heuristic/);
});

test('B4c: an edit inside another workflow run, outside the pinned run, is not trusted', () => {
  const runs = [
    { name: 'CI', path: CI, headSha: HEAD, status: 'completed', conclusion: 'success', createdAt: '2026-11-16T01:00:00Z', runStartedAt: '2026-11-16T01:00:05Z', updatedAt: '2026-11-16T01:09:30Z' },
    { name: 'Lint', path: '.github/workflows/lint.yml', headSha: HEAD, status: 'completed', conclusion: 'success', createdAt: '2026-11-16T02:00:00Z', runStartedAt: '2026-11-16T02:00:05Z', updatedAt: '2026-11-16T02:05:00Z' },
  ];
  assert.equal(reportTrusted(windowCtx('2026-11-16T02:03:00Z', runs)).status, 'unknown');
  // An edit before the pinned run started is not from it either.
  assert.equal(reportTrusted(windowCtx('2026-11-16T00:59:00Z')).status, 'unknown');
});

test('B4c: without a pinned run on the head the comment has no source', () => {
  assert.equal(reportTrusted(windowCtx('2026-11-16T01:05:00Z', [])).status, 'unknown');
});

test('B4c: the window ends exactly 60 s after the run ended', () => {
  assert.equal(reportTrusted(windowCtx('2026-11-16T01:10:30.000Z')).status, 'pass');
  assert.equal(reportTrusted(windowCtx('2026-11-16T01:10:30.001Z')).status, 'unknown');
  assert.equal(reportTrusted(windowCtx('2026-11-16T01:00:05.000Z')).status, 'pass');
});

test('B4c: the bot is checked by user id and type, not by the login text', async () => {
  const body = `<!-- aat-ci-report -->\n\`\`\`json\n${JSON.stringify({ schema: 'aat-ci-report/1', head_sha: HEAD, tests: [] })}\n\`\`\``;
  const comments = (user) => [{ user, body, created_at: 'a', updated_at: 'a' }];
  for (const [user, trusted] of [
    [{ login: BOT, id: 41898282, type: 'Bot' }, true],
    [{ login: BOT, id: 12345, type: 'User' }, false],
    [{ login: BOT }, false],
  ]) {
    const { fetchFn } = fakeFetch([
      [/\/pulls\?/, (u) => (page(u) === 1 ? [pull(3, 'BANK-1 fix')] : [])],
      [/\/issues\/3\/comments/, (u) => (page(u) === 1 ? comments(user) : [])],
    ]);
    const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
    assert.equal(gh.report !== null, trusted, JSON.stringify(user));
  }
});
