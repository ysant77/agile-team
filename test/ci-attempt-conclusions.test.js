// GitHub lists only the latest attempt of a run id. An earlier attempt that was cancelled (or ended
// with any result other than success or failure) and then re-run is not in the list. The reader
// records the conclusion of every earlier attempt it reads (GET .../runs/{id}/attempts/{n}), and
// ci_green and ci_attempts give unknown when one of them is not success or failure.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectGithub } from '../src/github-evidence.js';
import * as checks from '../src/verifier/checks.js';

const H = 'd'.repeat(40);
const CI = '.github/workflows/ci.yml';
const config = { requiredWorkflowPaths: [CI] };

// A fake GitHub with one PR and one run of the pinned workflow at attempt `attempt`.
// `attempts` maps an attempt number to its conclusion; a missing number gives 404.
function fakeFetch(attempt, attempts, steps = {}) {
  return async (url) => {
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    const jobs = /\/attempts\/(\d+)\/jobs/.exec(url);
    const run = /\/actions\/runs\/\d+\/attempts\/(\d+)(\?|$)/.exec(url);
    const body = /\/pulls\?/.test(url) ? (page === 1 ? [{ number: 21, title: 'BANK-21 fix', state: 'open', head: { ref: 'b', sha: H, repo: { full_name: 'ysant77/yms-bank-demo' } } }] : [])
      : /\/actions\/runs\?/.test(url) ? (page === 1 ? { workflow_runs: [{ id: 9, run_attempt: attempt, name: 'CI', path: CI, head_sha: H, status: 'completed', conclusion: 'success', created_at: '2026-11-17T01:00:00Z' }] } : { workflow_runs: [] })
      : jobs ? { jobs: [{ name: 'test', steps: [{ name: 'Run pytest', conclusion: steps[jobs[1]] ?? 'success' }] }] }
      : run ? (run[1] in attempts ? { id: 9, run_attempt: Number(run[1]), status: 'completed', conclusion: attempts[run[1]] } : null)
      : /\/pulls\/21\/files/.test(url) ? ['src/x.py'].map((filename) => ({ filename }))
      : null;
    return body === null ? { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } } : { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
  };
}

async function read(attempt, attempts, steps) {
  const gh = await collectGithub({ repo: 'ysant77/yms-bank-demo', key: 'BANK-21', fetchFn: fakeFetch(attempt, attempts, steps) });
  const ctx = { pr: gh.pr, workflowRuns: gh.workflowRuns, prFiles: gh.prFiles, truncated: gh.truncated, config };
  return { gh, ctx };
}

test('the reader records the conclusion of every earlier attempt it reads', async () => {
  const { gh } = await read(3, { 1: 'cancelled', 2: 'failure' }, { 2: 'failure' });
  assert.deepEqual(gh.workflowRuns[0].earlierConclusions, [{ attempt: 1, conclusion: 'cancelled' }, { attempt: 2, conclusion: 'failure' }]);
});

test('a cancelled attempt followed by a re-run of the same run id makes ci_green and ci_attempts unknown', async () => {
  const { ctx } = await read(2, { 1: 'cancelled' });
  const green = checks.ciGreen(ctx);
  assert.equal(green.status, 'unknown', green.reason);
  assert.match(green.reason, /attempt 1 .*cancelled/);
  const attempts = checks.ciAttempts(ctx);
  assert.equal(attempts.status, 'unknown', attempts.reason);
  assert.match(attempts.reason, /attempt 1 .*cancelled/);
});

test('an earlier attempt that succeeded, or failed only in a setup step, keeps both checks passing', async () => {
  for (const [conclusion, step] of [['success', 'success'], ['failure', undefined]]) {
    const { ctx } = await read(2, { 1: conclusion });
    if (step === undefined) ctx.workflowRuns[0].earlierFailures = [{ attempt: 1, job: 'test', step: 'Run uv sync' }];
    assert.equal(checks.ciGreen(ctx).status, 'pass', conclusion);
    assert.equal(checks.ciAttempts(ctx).status, 'pass', conclusion);
  }
});

test('an earlier attempt whose run record cannot be read gives unknown', async () => {
  const { gh, ctx } = await read(2, {});
  assert.equal(gh.workflowRuns[0].earlierConclusions, null);
  assert.equal(checks.ciGreen(ctx).status, 'unknown');
  assert.equal(checks.ciAttempts(ctx).status, 'unknown');
});

test('every earlier conclusion other than success or failure gives unknown', () => {
  for (const conclusion of ['cancelled', 'timed_out', 'startup_failure', 'stale', 'skipped', 'neutral', 'action_required', null, '', 7]) {
    const run = { id: 9, path: CI, headSha: H, status: 'completed', conclusion: 'success', attempt: 2, createdAt: '2026-11-17T01:00:00Z',
      earlierFailures: [], earlierUnread: 0, earlierConclusions: [{ attempt: 1, conclusion }] };
    const ctx = { pr: { headSha: H }, workflowRuns: [run], prFiles: ['src/x.py'], config };
    assert.equal(checks.ciGreen(ctx).status, 'unknown', `ci_green ${JSON.stringify(conclusion)}`);
    assert.equal(checks.ciAttempts(ctx).status, 'unknown', `ci_attempts ${JSON.stringify(conclusion)}`);
  }
});

test('a re-run with a missing or short conclusion list gives unknown', () => {
  for (const list of [undefined, [], [{ attempt: 1, conclusion: 'success' }], 'success']) {
    const run = { id: 9, path: CI, headSha: H, status: 'completed', conclusion: 'success', attempt: 3, createdAt: '2026-11-17T01:00:00Z',
      earlierFailures: [], earlierUnread: 0, earlierConclusions: list };
    const ctx = { pr: { headSha: H }, workflowRuns: [run], prFiles: ['src/x.py'], config };
    assert.equal(checks.ciGreen(ctx).status, 'unknown', `ci_green ${JSON.stringify(list)}`);
    assert.equal(checks.ciAttempts(ctx).status, 'unknown', `ci_attempts ${JSON.stringify(list)}`);
  }
});
