// Scorer change 23 (set 7, 24 Nov, written after the case file was read and before any build or
// run): three manifest fields that sets 1 to 6 do not have.
// (a) github.mergeCommit.pushConclusion: the conclusion of the push run on the merge result;
// (b) github.pushRunInProgress.attempt: the current attempt of the push run in progress;
// (c) jira.prLink as a list: more than one PR link, oldest first.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simJira } from '../benchmark/run/sim-jira.mjs';
import { pushRun } from '../benchmark/run/sim-provenance.mjs';
import { pushRunsFor } from '../benchmark/run/sim-set7.mjs';
import { latestPrLink } from '../src/pr-link.js';

const KEY = 'BENCH-714';
const REPO = 'ysant77/yms-bank-demo';
const M = 'c'.repeat(40);
const runsOf = async (d, sha) => pushRunsFor(d, sha, d.main, { repo: REPO });

test('(a) the push run on the merge result has the conclusion of the case; the default stays success', async () => {
  const base = { main: { head_sha: M }, pushRunId: 7001, runs: [] };
  assert.equal((await runsOf({ ...base, pushConclusion: 'failure' }, M))[0].conclusion, 'failure');
  assert.equal((await runsOf(base, M))[0].conclusion, 'success');
});

test('(b) a push run in progress has the attempt of the case; the default is attempt 1', async () => {
  const base = { main: { head_sha: 'e'.repeat(40) }, pushRunId: 7001, runs: [], pushRunInProgress: true, mergeSha: M };
  const [second] = await runsOf({ ...base, pushRunAttempt: 2 }, M);
  assert.deepEqual([second.status, second.conclusion, second.run_attempt], ['in_progress', null, 2]);
  assert.equal((await runsOf(base, M))[0].run_attempt, 1);
  assert.equal(pushRun({ id: 1, sha: M, repo: REPO }).run_attempt, 1);
});

test('(c) two links: both are stored with their audit events; the latest counts', async () => {
  const j = simJira({ claimant: 'acct-claimant', prLink: [
    { by: 'acct-product-owner', at: 'T-2d', prNumber: 1013, reason: 'the rate table is the work of this ticket' },
    { by: 'acct-product-owner', at: 'T-3h', prNumber: 'case', reason: 'this PR is the quote and its rounding' },
  ] }, KEY, { prNumber: 1014, repo: REPO });
  const stored = await j.store.get(`pr-links:${KEY}`);
  assert.deepEqual(stored.map((l) => l.prNumber), [1013, 1014]);
  const link = await latestPrLink(KEY, { store: j.store, readAudit: j.readAudit }, 'acct-claimant');
  assert.equal(link.prNumber, 1014);
  assert.equal(link.counted, true);
  assert.match(link.reason, /2 links; the latest/);
  // One link (an object) is as before.
  const one = simJira({ prLink: { by: 'acct-product-owner', prNumber: 'case', reason: 'the PR of the case' } }, KEY, { prNumber: 1014, repo: REPO });
  assert.equal((await one.store.get(`pr-links:${KEY}`)).length, 1);
});
