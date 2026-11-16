// Admission for "claim:" comments (review F9, 16 Nov). Any commenter can claim, so code
// deduplicates by comment id and caps claims per work item, per author and per site. GitHub allows
// 60 calls an hour without a token and 5,000 with one; one claim makes about 6 calls plus pages.
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
  return { ok: true };
}
