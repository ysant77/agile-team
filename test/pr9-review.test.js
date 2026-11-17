// Review of PR 9 (commit 06bfe5a), items 1, 2, 4 and 5. Item 3 is in checks-bad-input.test.js.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectGithub } from '../src/github-evidence.js';
import * as checks from '../src/verifier/checks.js';

const H = 'a'.repeat(40);
const CI = '.github/workflows/ci.yml';

// ---- Item 1: a success after a run without a result ----
// A success after a cancelled, stale or skipped run of the same workflow file on the same head
// passes only when the run without a result is known to have no failed attempt and no failed
// step. Otherwise the author may have cancelled a failing run.

const run = (over) => ({ id: 1, path: CI, headSha: H, status: 'completed', attempt: 1, createdAt: '2026-11-17T01:00:00Z', ...over });
const ciCtx = (runs) => ({ pr: { headSha: H }, prFiles: ['src/a.py'], workflowRuns: runs, config: { requiredWorkflowPaths: [CI] } });
const success = run({ id: 2, conclusion: 'success', createdAt: '2026-11-17T01:10:00Z' });

test('item 1: a cancelled run whose step results were not read gives unknown, even with a later success', () => {
  for (const conclusion of ['cancelled', 'stale', 'skipped']) {
    for (const stepFailures of [undefined, null, 'none', [null]]) {
      const r = checks.ciGreen(ciCtx([run({ conclusion, stepFailures }), success]));
      assert.equal(r.status, 'unknown', `${conclusion} ${JSON.stringify(stepFailures)}: ${r.reason}`);
    }
  }
});

test('item 1: a cancelled run with a failed step gives unknown, even with a later success', () => {
  const failed = run({ conclusion: 'cancelled', stepFailures: [{ attempt: 1, job: 'test', step: 'Run pytest' }] });
  const r = checks.ciGreen(ciCtx([failed, success]));
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /Run pytest/);
});

test('item 1: a cancelled run with an earlier failed attempt gives unknown, even with a later success', () => {
  const cancelled = run({ conclusion: 'cancelled', attempt: 2, stepFailures: [], earlierUnread: 0,
    earlierConclusions: [{ attempt: 1, conclusion: 'failure' }], earlierFailures: [{ attempt: 1, job: 'test', step: 'Run uv sync' }] });
  const r = checks.ciGreen(ciCtx([cancelled, success]));
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /attempt 1/);
});

test('item 1: a cancelled run with no failed step and no failed attempt, then a later success, passes', () => {
  const clean = run({ conclusion: 'cancelled', stepFailures: [] });
  assert.equal(checks.ciGreen(ciCtx([clean, success])).status, 'pass');
  const rerun = run({ conclusion: 'cancelled', attempt: 2, stepFailures: [], earlierUnread: 0,
    earlierConclusions: [{ attempt: 1, conclusion: 'success' }], earlierFailures: [] });
  assert.equal(checks.ciGreen(ciCtx([rerun, success])).status, 'pass');
  // The success must still come after the run without a result.
  assert.equal(checks.ciGreen(ciCtx([{ ...clean, createdAt: '2026-11-17T02:00:00Z' }, success])).status, 'unknown');
});

test('item 1: the reader records the failed steps of a run without a result', async () => {
  const fetchFn = async (url) => {
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    const body = /\/pulls\?/.test(url) ? (page === 1 ? [{ number: 21, title: 'BANK-21 fix', state: 'open', head: { ref: 'b', sha: H, repo: { full_name: 'o/r' } } }] : [])
      : /\/actions\/runs\?/.test(url) ? { workflow_runs: page === 1 ? [
        { id: 7, run_attempt: 1, path: CI, head_sha: H, status: 'completed', conclusion: 'cancelled', created_at: '2026-11-17T01:00:00Z' },
        { id: 8, run_attempt: 1, path: CI, head_sha: H, status: 'completed', conclusion: 'success', created_at: '2026-11-17T01:10:00Z' },
      ] : [] }
      : /\/runs\/7\/attempts\/1\/jobs/.test(url) ? { jobs: [{ name: 'test', steps: [{ name: 'Run pytest', conclusion: 'failure' }, { name: 'Upload', conclusion: 'cancelled' }] }] }
      : /\/pulls\/21\/files/.test(url) ? [{ filename: 'src/x.py' }]
      : null;
    return body === null ? { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } } : { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
  };
  const gh = await collectGithub({ repo: 'o/r', key: 'BANK-21', fetchFn });
  const byId = Object.fromEntries(gh.workflowRuns.map((r) => [r.id, r]));
  assert.deepEqual(byId[7].stepFailures, [{ attempt: 1, job: 'test', step: 'Run pytest' }]);
  assert.equal(byId[8].stepFailures, undefined);
  assert.equal(checks.ciGreen({ pr: gh.pr, workflowRuns: gh.workflowRuns, prFiles: gh.prFiles, config: { requiredWorkflowPaths: [CI] } }).status, 'unknown');
});
