// Admission for "claim:" comments (review F9, 16 Nov). Any commenter can claim, so code
// deduplicates by comment id and caps claims per work item, per author and per site.
//
// GitHub budget (lead review of 23 Nov, finding 4). One claim on a merged PR makes about 10 GitHub
// calls (the pull list, runs, comments, files, check runs, main.json, provenance runs and
// artifacts, deploy runs); an open PR adds the base branch; re-runs, long lists and server
// retries add more. Without a token GitHub allows 60 calls an hour for each outgoing address, and
// the platform's addresses are shared with other apps: about 5 claims an hour at best, far under
// the site cap below (30 claims, about 300 calls). With a token the limit is 5,000 calls an hour
// for the token, so the site cap is the limit. A claim that GitHub cannot answer for a transient
// reason gives its slots back (releaseClaim).
//
// Atomic (second review, item 8): KVS has no counter increment. A cap of N is N slot keys, and a
// claim takes a slot by writing it with FAIL_IF_EXISTS, so two writers can never take the same
// slot. A claim that takes its issue slot but finds the author or site cap full gives the slots
// back.

export const LIMITS = { perIssuePerHour: 5, perAuthorPerHour: 10, perSitePerHour: 30 };

const hourOf = (now) => new Date(now).toISOString().slice(0, 13);

async function create(store, key, value) {
  try {
    await store.set(key, value, { keyPolicy: 'FAIL_IF_EXISTS' });
    return true;
  } catch (error) {
    if (await store.get(key)) return false; // taken by another writer
    throw error; // a storage error, not a conflict
  }
}

// Takes the first free slot of `scope`, or returns null when all `cap` slots are taken.
async function takeSlot(store, scope, cap, owner) {
  for (let i = 0; i < cap; i += 1) {
    const key = `claim-slot:${scope}:${i}`;
    if (await create(store, key, owner)) return key;
  }
  return null;
}

// Returns { ok: true } or { ok: false, reason }. Counts only admitted claims.
export async function admitClaim({ issueKey, commentId, authorId = 'unknown', now = Date.now() }, store, limits = LIMITS) {
  const lim = { ...LIMITS, ...limits };
  const seen = `claim-seen:${issueKey}:${commentId}`;
  if (!(await create(store, seen, true))) return { ok: false, reason: `comment ${commentId} was already queued` };
  const hour = hourOf(now);
  const owner = `${issueKey}:${commentId}`;
  const scopes = [
    [`${issueKey}:${hour}`, lim.perIssuePerHour, `${issueKey} reached ${lim.perIssuePerHour} claims this hour`],
    [`author:${authorId}:${hour}`, lim.perAuthorPerHour, `this author reached ${lim.perAuthorPerHour} claims this hour`],
    [`site:${hour}`, lim.perSitePerHour, `the site reached ${lim.perSitePerHour} claims this hour`],
  ];
  const taken = [];
  for (const [scope, cap, reason] of scopes) {
    const slot = await takeSlot(store, scope, cap, owner);
    if (!slot) {
      for (const key of taken) await store.delete?.(key);
      await store.delete?.(seen);
      return { ok: false, reason };
    }
    taken.push(slot);
  }
  // The slots of this claim, so releaseClaim can give them back. A failed write only means the
  // slots cannot be given back early; they still end with the hour.
  try {
    await store.set(slotsKey(`${issueKey}:${commentId}`), taken);
  } catch {
    // not fatal
  }
  return { ok: true };
}

const slotsKey = (claimId) => `claim-slots:${claimId}`;

// Gives back the slots of one admitted claim (claim id "<issueKey>:<commentId>"). The "seen" key
// stays: the same comment is never queued twice. A later comment is a new claim.
export async function releaseClaim(claimId, store) {
  const taken = await store.get(slotsKey(claimId));
  if (!Array.isArray(taken)) return;
  for (const key of taken) {
    if ((await store.get(key)) === claimId) await store.delete?.(key);
  }
  await store.delete?.(slotsKey(claimId));
}
