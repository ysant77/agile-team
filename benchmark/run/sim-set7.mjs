// Scorer change 22 (set 7 preparation, 24 Nov): GitHub facts for the cases that set 6 could not
// build (SET7-PREPARATION.md). Pure functions, so they are unit tested apart from score.mjs.

import { createHash } from 'node:crypto';

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
