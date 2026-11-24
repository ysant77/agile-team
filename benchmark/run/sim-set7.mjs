// Scorer change 22 (set 7 preparation, 24 Nov): GitHub facts for the cases that set 6 could not
// build (SET7-PREPARATION.md). Pure functions, so they are unit tested apart from score.mjs.

import { createHash } from 'node:crypto';
import { pushRun } from './sim-provenance.mjs';

// (c) A GitHub answer of 403 with the rate-limit headers, for every call that matches the case's
// pattern. spec: { remaining, resetAt?, retryAfterS?, message? }.
export function rateLimitedReply(spec) {
  const headers = {
    'x-ratelimit-remaining': String(spec.remaining ?? 0),
    'x-ratelimit-reset': String(Math.floor(Date.parse(spec.resetAt ?? '2026-11-16T11:00:00Z') / 1000)),
    ...(spec.retryAfterS !== undefined ? { 'retry-after': String(spec.retryAfterS) } : {}),
  };
  const message = spec.message ?? (spec.retryAfterS !== undefined ? 'You have exceeded a secondary rate limit' : 'API rate limit exceeded');
  return { ok: false, status: 403, json: async () => ({ message }), headers: { get: (h) => headers[String(h).toLowerCase()] ?? null } };
}

// (d) A merge commit that is not the head: a fixed commit id made from the head, so a run is
// repeatable. The case gives the merge result's evidence branch when main.json must be its report.
export function otherMergeSha(head) {
  return createHash('sha256').update(`merge-commit-of:${head}`).digest('hex').slice(0, 40);
}

// The push runs on main for one commit (the route /actions/runs?head_sha=<sha>&event=push of
// score.mjs). The run of the served main.json commit: its conclusion is failure for a genuine main
// report that failed (SCORER-CHANGES 21 d), else the case's merge-result conclusion (23 a), else
// success. (e) A push run in progress on the merge commit, at the case's attempt (23 b).
export function pushRunsFor(d, sha, main, { genuineFailed = false, repo }) {
  const conclusion = genuineFailed ? 'failure' : (d.pushConclusion ?? 'success');
  const runs = main && d.pushRunId && main.head_sha === sha ? [pushRun({ id: d.pushRunId, sha, repo, conclusion })] : [];
  if (d.pushRunInProgress && d.mergeSha === sha && !runs.length) {
    runs.push(pushRun({ id: d.pushRunId + 1, sha, repo, status: 'in_progress', attempt: d.pushRunAttempt ?? 1 }));
  }
  return runs;
}
