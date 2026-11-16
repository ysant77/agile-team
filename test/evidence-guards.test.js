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
    user: { login: BOT }, created_at: '2026-11-16T01:05:00Z', updated_at: updated,
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
      : page(u) === 2 ? [{ user: { login: BOT }, body: report(HEAD), created_at: 'a', updated_at: 'b' }] : [])],
    [/\/actions\/runs\?/, (u) => ({ workflow_runs: page(u) === 1
      ? Array.from({ length: 100 }, () => ({ name: 'CI', path: CI, head_sha: HEAD, status: 'completed', conclusion: 'success' }))
      : page(u) === 2 ? [{ name: 'CI', path: CI, head_sha: HEAD, status: 'completed', conclusion: 'failure' }] : [] })],
  ]);
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn });
  assert.equal(gh.pr.number, 3);
  assert.equal(gh.report.head_sha, HEAD);
  assert.equal(gh.workflowRuns.length, 101);
});
