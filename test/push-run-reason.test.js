// Owner decision 24 Nov: when the report for a merge commit is not there, the reason tells a push
// run that is still running (wait, then claim again) from a report that is missing. The check
// result stays unknown in both cases; only the reason text changes.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectGithub } from '../src/github-evidence.js';
import { mergedClean } from '../src/verifier/checks.js';

const REPO = 'ysant77/yms-bank-demo';
const HEAD = 'a'.repeat(40);
const MERGE = 'c'.repeat(40);
const MAIN = 'e'.repeat(40); // the older commit that main.json is for
const CI = '.github/workflows/ci.yml';
const run = (extra = {}) => ({ id: 31, attempt: 1, path: CI, headSha: MERGE, event: 'push', headBranch: 'main', status: 'completed', conclusion: 'success', ...extra });
const ctxOf = (mergeRuns) => ({
  pr: { number: 5, headSha: HEAD }, mergeSha: MERGE, mergeReport: { head_sha: MAIN, workflow_files: { [CI]: 'x' } },
  reportAuthor: 'github-actions[bot]', baseWorkflowFiles: { [CI]: 'x' }, mergeRequiredTests: [], config: { requiredWorkflowPaths: [CI] },
  ...(mergeRuns === undefined ? {} : { mergeRuns }),
});

test('a push run on the merge commit that is still running: unknown, and the reason says to wait', () => {
  for (const status of ['queued', 'in_progress', 'waiting', 'pending']) {
    const r = mergedClean(ctxOf([run({ status, conclusion: null })]));
    assert.equal(r.status, 'unknown');
    assert.match(r.reason, /push run on the merge commit c{7} is still running/, status);
    assert.match(r.reason, /wait for it to end, then claim again/);
  }
});

test('no push run running on the merge commit: unknown, and the reason says the report is missing', () => {
  for (const runs of [[], [run()], [run({ path: '.github/workflows/other.yml', status: 'in_progress', conclusion: null })]]) {
    const r = mergedClean(ctxOf(runs));
    assert.equal(r.status, 'unknown');
    assert.match(r.reason, /report missing/);
    assert.match(r.reason, /main\.json is for e{7}, not the merge commit c{7}/);
    assert.doesNotMatch(r.reason, /still running/);
  }
});

test('the push runs on the merge commit were not read: unknown, and the reason says so', () => {
  for (const runs of [null, undefined, 'x', [null]]) {
    const r = mergedClean(ctxOf(runs));
    assert.equal(r.status, 'unknown');
    assert.match(r.reason, /push runs on the merge commit c{7} were not read/);
  }
});

test('a report for the merge commit is not affected', () => {
  const ctx = { ...ctxOf([run({ status: 'in_progress', conclusion: null })]), mergeReport: { head_sha: MERGE, workflow_files: { [CI]: 'x' }, migrations: [], tests: [] } };
  assert.doesNotMatch(mergedClean(ctx).reason, /still running|not the merge commit|were not read/);
});

// The collector reads the push runs on the merge commit only when main.json is for another commit.
function fetchOf(mainSha, mergeRuns, seen) {
  const mainRaw = JSON.stringify({ schema: 'aat-ci-report/2', head_sha: mainSha });
  return async (url) => {
    seen.push(url.replace('https://api.github.com', ''));
    const u = new URL(url);
    const page = Number(u.searchParams.get('page') ?? 1);
    const sha = u.searchParams.get('head_sha');
    const body = /\/pulls\?/.test(url) ? (page === 1 ? [{ number: 5, title: 'BANK-1 fix', state: 'closed', merged_at: '2026-11-24T08:00:00Z', merge_commit_sha: MERGE,
      head: { ref: 'b', sha: HEAD, repo: { full_name: REPO } }, base: { ref: 'main' } }] : [])
      : /\/actions\/runs\?head_sha=/.test(url) && sha === MERGE ? (mergeRuns === 404 ? null : { workflow_runs: mergeRuns })
      : /\/actions\/runs\?head_sha=/.test(url) ? { workflow_runs: [] }
      : /\/issues\/5\/comments/.test(url) ? []
      : /\/pulls\/5\/files/.test(url) ? [{ filename: 'src/x.py', status: 'modified' }]
      : /contents\/main\.json/.test(url) ? { content: Buffer.from(mainRaw + '\n').toString('base64') }
      : null;
    return body === null ? { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } } : { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
  };
}
const ghRun = (status) => ({ id: 31, run_attempt: 1, path: CI, head_sha: MERGE, event: 'push', head_branch: 'main', head_repository: { full_name: REPO }, status, conclusion: status === 'completed' ? 'success' : null });

test('collectGithub reads the push runs on the merge commit when main.json is for another commit', async () => {
  const seen = [];
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn: fetchOf(MAIN, [ghRun('in_progress')], seen), provenance: { workflowPaths: [CI] } });
  assert.equal(gh.mergeSha, MERGE);
  assert.deepEqual(gh.mergeRuns.map((r) => [r.id, r.path, r.status, r.headSha]), [[31, CI, 'in_progress', MERGE]]);
  assert.match(mergedClean({ ...gh, reportAuthor: 'github-actions[bot]', mergeRequiredTests: [], config: { requiredWorkflowPaths: [CI] } }).reason, /still running/);
});

test('collectGithub does not read them when main.json is for the merge commit; a read error gives null', async () => {
  const seen = [];
  const gh = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn: fetchOf(MERGE, [ghRun('completed')], seen), provenance: { workflowPaths: [CI] } });
  assert.equal(gh.mergeRuns, null);
  assert.equal(seen.filter((p) => p.includes(`head_sha=${MERGE}&event=push`)).length, 1, 'only the read for the main.json commit');
  const failed = await collectGithub({ repo: REPO, key: 'BANK-1', fetchFn: fetchOf(MAIN, 404, []), provenance: { workflowPaths: [CI] } });
  assert.equal(failed.mergeRuns, null);
});
