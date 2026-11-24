// Scorer change 22 (set 7 preparation, 24 Nov): the five facts that SET7-PREPARATION.md lists as
// not expressible. One unit test per part; each part acts only on a manifest field that sets 1 to
// 6 do not have.
// (a) jira.signoff: the aat.signoff property and its change.signed_off audit event;
// (b) jira.prLink: the pr-links:<key> store entry and its pr.linked audit event;
// (c) github.rateLimited: GitHub answers 403 with the rate-limit headers;
// (d) github.mergeCommit: the merge commit is not the commit that CI ran on;
// (e) github.pushRunInProgress: the push run on the merge commit has not finished.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simJira } from '../benchmark/run/sim-jira.mjs';
import { pushRun } from '../benchmark/run/sim-provenance.mjs';
import { otherMergeSha, rateLimitedReply } from '../benchmark/run/sim-set7.mjs';
import { checkHumanSignoff } from '../src/verifier/checks.js';
import { latestPrLink } from '../src/pr-link.js';
import { classifyGithubResponse } from '../src/github-evidence.js';

const KEY = 'BENCH-701';
const M = 'a'.repeat(40);

test('(a) a sign-off of the merge commit by another person passes the money rule; by the claimant it does not', async () => {
  const j = simJira({ claimant: 'acct-dev', signoff: { by: 'acct-po', at: 'T+1h', sha: 'merge', reason: 'the rounding rule is right' } }, KEY, { mergeSha: M });
  assert.equal(j.signoff.sha, M);
  const [event] = await j.readAudit(j.signoff.auditSeq, 1);
  const ctx = (claimant) => ({ ticket: { key: KEY, labels: ['money_semantics'], signoff: j.signoff }, pr: { mergeSha: M }, claimant, signoffEvent: event });
  assert.equal(checkHumanSignoff(ctx('acct-dev')).status, 'pass');
  assert.equal(checkHumanSignoff(ctx('acct-po')).status, 'unknown');
  const other = simJira({ signoff: { by: 'acct-po', sha: 'b'.repeat(40), reason: 'an earlier commit' } }, KEY, { mergeSha: M });
  assert.match(checkHumanSignoff({ ...ctx('acct-dev'), ticket: { key: KEY, labels: ['money_semantics'], signoff: other.signoff } }).reason, /not the merged commit/);
});

test('(a) a case with no sign-off gets no sign-off, as before', () => {
  assert.equal(simJira({ claimant: 'acct-dev' }, KEY, { mergeSha: M }).signoff, null);
  assert.equal(simJira(null, KEY), null);
});

test('(b) a PR link by another person counts; by the claimant it does not', async () => {
  const j = simJira({ claimant: 'acct-dev', prLink: { by: 'acct-lead', at: 'T+0', prNumber: 'case', reason: 'the PR of the case' } }, KEY, { prNumber: 1042, repo: 'ysant77/yms-bank-demo' });
  const link = await latestPrLink(KEY, { store: j.store, readAudit: j.readAudit }, 'acct-dev');
  assert.equal(link.counted, true, link.reason);
  assert.equal(link.prNumber, 1042);
  assert.equal(link.repo, 'ysant77/yms-bank-demo');
  assert.equal((await latestPrLink(KEY, { store: j.store, readAudit: j.readAudit }, 'acct-lead')).counted, false);
});

test('(b) the approvals and the link share one audit chain', async () => {
  const j = simJira({ claimant: 'acct-dev', acs: { by: 'acct-po', acceptanceCriteria: [] }, prLink: { by: 'acct-lead', prNumber: 7, reason: 'link' } }, KEY, { prNumber: 1042, repo: 'o/r' });
  const events = await j.readAudit(0, 10);
  assert.deepEqual(events.map((e) => e.event), ['acs.recorded', 'pr.linked']);
  assert.equal(events[1].prevHash, events[0].hash);
});

test('(c) a 403 with no calls left is a rate limit the app treats as transient; a retry-after 403 is a secondary limit', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');
  const primary = rateLimitedReply({ remaining: 0, resetAt: '2026-11-16T11:00:00Z' });
  assert.equal(primary.status, 403);
  assert.equal(primary.headers.get('x-ratelimit-remaining'), '0');
  const c = classifyGithubResponse(primary, { now, message: 'API rate limit exceeded' });
  assert.equal(c.kind, 'rate_limited');
  assert.equal(c.transient, true);
  const secondary = rateLimitedReply({ remaining: 12, retryAfterS: 60 });
  assert.equal(classifyGithubResponse(secondary, { now, message: 'You have exceeded a secondary rate limit' }).kind, 'secondary_limit');
});

test('(d) the merge commit is a fixed commit id other than the head', () => {
  const head = 'c'.repeat(40);
  assert.match(otherMergeSha(head), /^[0-9a-f]{40}$/);
  assert.notEqual(otherMergeSha(head), head);
  assert.equal(otherMergeSha(head), otherMergeSha(head));
});

test('(e) a push run in progress has no conclusion; the default push run is unchanged', () => {
  const r = pushRun({ id: 7, sha: M, repo: 'o/r', status: 'in_progress' });
  assert.equal(r.status, 'in_progress');
  assert.equal(r.conclusion, null);
  const d = pushRun({ id: 7, sha: M, repo: 'o/r' });
  assert.equal(d.status, 'completed');
  assert.equal(d.conclusion, 'success');
});
