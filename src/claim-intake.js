// Admission for "claim:" comments (review F9, 16 Nov). Any commenter can claim, so code
// deduplicates by comment id and caps claims per work item and per site. GitHub allows 60 calls an
// hour without a token and 5,000 with one; one claim makes about 6 calls plus file pages.

export const LIMITS = { perIssuePerHour: 5, perSitePerHour: 30 };

const hourOf = (now) => new Date(now).toISOString().slice(0, 13);

async function bump(store, key) {
  const n = ((await store.get(key)) ?? 0) + 1;
  await store.set(key, n);
  return n;
}

// Returns { ok: true } or { ok: false, reason }. Counts only admitted claims.
export async function admitClaim({ issueKey, commentId, now = Date.now() }, store, limits = LIMITS) {
  const seen = `claim-seen:${issueKey}:${commentId}`;
  if (await store.get(seen)) return { ok: false, reason: `comment ${commentId} was already queued` };
  const hour = hourOf(now);
  const issueKey_ = `claim-rate:${issueKey}:${hour}`;
  const siteKey = `claim-rate:site:${hour}`;
  if (((await store.get(issueKey_)) ?? 0) >= limits.perIssuePerHour) {
    return { ok: false, reason: `${issueKey} reached ${limits.perIssuePerHour} claims this hour` };
  }
  if (((await store.get(siteKey)) ?? 0) >= limits.perSitePerHour) {
    return { ok: false, reason: `the site reached ${limits.perSitePerHour} claims this hour` };
  }
  await store.set(seen, true);
  await bump(store, issueKey_);
  await bump(store, siteKey);
  return { ok: true };
}
