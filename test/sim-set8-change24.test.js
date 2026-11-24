// Scorer change 24 (set 8, 24 Nov; written after the set 8 case file was read and before any build
// or run): five manifest fields that sets 1 to 7 do not have.
// (a) github.rateLimited.status / limit / used: a 429 answer with the headers of the primary limit;
// (b) github.reportCommentNote: a line added to the bot comment after the run;
// (c) github.mainPushRunAttempt: the completed push run at its current attempt;
// (d) github.otherPushRuns: runs of other workflows on the merge commit;
// (e) jira.signoff.noAuditEvent: a sign-off issue property with no audit event.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simJira } from '../benchmark/run/sim-jira.mjs';
import { mainArtifacts } from '../benchmark/run/sim-provenance.mjs';
import { pushRunsFor, rateLimitedReply } from '../benchmark/run/sim-set7.mjs';
import { classifyGithubResponse } from '../src/github-evidence.js';

const REPO = 'ysant77/yms-bank-demo';
const M = 'c'.repeat(40);

test('(a) a 429 with 0 calls left is the primary rate limit; the default status stays 403', () => {
  const r = rateLimitedReply({ status: 429, remaining: 0, limit: 60, used: 60, resetAt: '2026-11-24T10:25:00Z', message: 'API rate limit exceeded' });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('x-ratelimit-limit'), '60');
  assert.equal(r.headers.get('x-ratelimit-used'), '60');
  assert.equal(r.headers.get('retry-after'), null);
  const c = classifyGithubResponse(r, { now: Date.parse('2026-11-24T10:00:00Z') });
  assert.deepEqual([c.kind, c.transient], ['rate_limited', true]);
  assert.equal(rateLimitedReply({ remaining: 0 }).status, 403);
});

test('(c) the completed push run and its marker carry the attempt of the case; the default is 1', () => {
  const base = { pushRunId: 7001, runs: [] };
  assert.equal(pushRunsFor({ ...base, mainPushRunAttempt: 2 }, M, { head_sha: M }, { repo: REPO })[0].run_attempt, 2);
  assert.equal(pushRunsFor(base, M, { head_sha: M }, { repo: REPO })[0].run_attempt, 1);
  assert.match(mainArtifacts('x', 2).artifacts[1].name, /-attempt-2$/);
  assert.match(mainArtifacts('x').artifacts[1].name, /-attempt-1$/);
});

test('(d) a run of another workflow on the merge commit is listed beside the CI run in progress', () => {
  const d = { pushRunId: 7001, runs: [], pushRunInProgress: true, mergeSha: M,
    otherPushRuns: [{ name: 'pages build and deployment', path: 'dynamic/pages/pages-build-deployment', status: 'completed', conclusion: 'success' }] };
  const runs = pushRunsFor(d, M, { head_sha: 'e'.repeat(40) }, { repo: REPO });
  assert.deepEqual(runs.map((r) => [r.path, r.status, r.conclusion]), [
    ['.github/workflows/ci.yml', 'in_progress', null],
    ['dynamic/pages/pages-build-deployment', 'completed', 'success'],
  ]);
  // Not on another commit.
  assert.equal(pushRunsFor(d, 'd'.repeat(40), { head_sha: 'e'.repeat(40) }, { repo: REPO }).length, 0);
});

test('(e) a sign-off property with no audit event has no audit sequence, and the chain has no sign-off', async () => {
  const j = simJira({ claimant: 'acct-claimant', signoff: { by: 'acct-finance-owner', at: 'T-90m', sha: 'merge', reason: 'approved', noAuditEvent: true } }, 'BENCH-819', { mergeSha: M });
  assert.equal(j.signoff.auditSeq, null);
  assert.equal(j.signoff.sha, M);
  assert.deepEqual(await j.readAudit(0, 10), []);
  // The default still writes the event.
  const k = simJira({ signoff: { by: 'acct-product-owner', sha: 'merge', reason: 'agreed' } }, 'BENCH-812', { mergeSha: M });
  assert.equal(Number.isInteger(k.signoff.auditSeq), true);
});
