// Final review of PR 9 (head 61adc2d), items 3 to 6. Items 1 and 2 are in checks-bad-input.test.js.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectGithub } from '../src/github-evidence.js';
import * as checks from '../src/verifier/checks.js';
import { withReader } from './helpers/reader.js';

const H = 'a'.repeat(40);
const CI = '.github/workflows/ci.yml';
const run = (over) => ({ id: 1, path: CI, headSha: H, status: 'completed', attempt: 1, createdAt: '2026-11-17T01:00:00Z', ...over });
const ciCtx = (runs) => withReader({ pr: { headSha: H }, prFiles: ['src/a.py'], workflowRuns: runs, config: { requiredWorkflowPaths: [CI] } });
const success = run({ id: 2, conclusion: 'success', createdAt: '2026-11-17T01:10:00Z' });

// ---- Item 3: job conclusions, and attempts past the read limit ----

test('item 3: a cancelled run whose job failed with no failed step gives unknown, even with a later success', () => {
  const cancelled = run({ conclusion: 'cancelled', stepFailures: [], jobConclusions: [{ attempt: 1, job: 'test', conclusion: 'failure' }] });
  const r = checks.ciGreen(ciCtx([cancelled, success]));
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /job "test"/);
});

test('item 3: a cancelled run whose job conclusions were not read gives unknown', () => {
  for (const jobConclusions of [undefined, null, 'none', [null]]) {
    const r = checks.ciGreen(ciCtx([run({ conclusion: 'cancelled', stepFailures: [], jobConclusions }), success]));
    assert.equal(r.status, 'unknown', `${JSON.stringify(jobConclusions)}: ${r.reason}`);
  }
});

test('item 3: a cancelled run whose jobs were cancelled or skipped, then a later success, passes', () => {
  const clean = run({ conclusion: 'cancelled', stepFailures: [],
    jobConclusions: [{ attempt: 1, job: 'test', conclusion: 'cancelled' }, { attempt: 1, job: 'lint', conclusion: 'skipped' }] });
  assert.equal(checks.ciGreen(ciCtx([clean, success])).status, 'pass');
});

test('item 3: the reader records the job conclusions of a run without a result', async () => {
  const fetchFn = async (url) => {
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    const body = /\/pulls\?/.test(url) ? (page === 1 ? [{ number: 21, title: 'BANK-21 fix', state: 'open', head: { ref: 'b', sha: H, repo: { full_name: 'o/r' } } }] : [])
      : /\/actions\/runs\?/.test(url) ? { workflow_runs: page === 1 ? [
        { id: 7, run_attempt: 1, path: CI, head_sha: H, status: 'completed', conclusion: 'cancelled', created_at: '2026-11-17T01:00:00Z' },
        { id: 8, run_attempt: 1, path: CI, head_sha: H, status: 'completed', conclusion: 'success', created_at: '2026-11-17T01:10:00Z' },
      ] : [] }
      : /\/runs\/7\/attempts\/1\/jobs/.test(url) ? { jobs: [{ name: 'test', conclusion: 'failure', steps: [{ name: 'Run pytest', conclusion: 'cancelled' }] }] }
      : /\/pulls\/21\/files/.test(url) ? [{ filename: 'src/x.py' }]
      : null;
    return body === null ? { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } } : { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
  };
  const gh = await collectGithub({ repo: 'o/r', key: 'BANK-21', fetchFn });
  const byId = Object.fromEntries(gh.workflowRuns.map((r) => [r.id, r]));
  assert.deepEqual(byId[7].stepFailures, []);
  assert.deepEqual(byId[7].jobConclusions, [{ attempt: 1, job: 'test', conclusion: 'failure' }]);
  const r = checks.ciGreen({ pr: gh.pr, workflowRuns: gh.workflowRuns, prFiles: gh.prFiles, truncated: gh.truncated, config: { requiredWorkflowPaths: [CI] } });
  assert.equal(r.status, 'unknown', r.reason);
});

test('item 3: an earlier attempt that concluded failure with no failed step recorded gives unknown in ci_attempts', () => {
  const rerun = run({ conclusion: 'success', attempt: 2, earlierUnread: 0, earlierConclusions: [{ attempt: 1, conclusion: 'failure' }], earlierFailures: [] });
  const r = checks.ciAttempts(ciCtx([rerun]));
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /attempt 1/);
});

test('item 3: ci_green alone gives unknown when earlier attempts past the read limit were not read', () => {
  const earlierConclusions = [1, 2, 3, 4, 5].map((attempt) => ({ attempt, conclusion: 'success' }));
  const rerun = run({ conclusion: 'success', attempt: 8, earlierUnread: 2, earlierConclusions, earlierFailures: [] });
  const r = checks.ciGreen(ciCtx([rerun]));
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /not read/);
});
