// Sign-off of the merged change of a high-stake work item (DESIGN 6a, benchmark B27), from the
// panel button. Pure logic with injected dependencies; src/resolvers.js wires it to Forge. The
// merged commit and the claimant come from the latest "done" verdict that code wrote, never from
// the person. Order: check the input and the person's edit permission, write the audit event, then
// the issue property aat.signoff. The verifier counts the sign-off only when the property matches
// that event and the signer is not the claimant (src/verifier/checks.js, checkHumanSignoff).

export const SIGNOFF_EVENT = 'change.signed_off';
export const SIGNOFF_CLAIMANT_REFUSAL = 'You made the latest "done" claim on this work item, so you cannot sign it off. Another person must sign off.';
const MIN_REASON = 5;
const MAX_REASON = 500;
const SHA = /^[0-9a-f]{40}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const latestDone = (verdicts) => (Array.isArray(verdicts) ? verdicts : []).filter((r) => isObj(r) && r.type === 'done').at(-1) ?? null;

// deps: { canEdit(key), readVerdicts(key), appendAudit(event), writeSignoff(key, signoff) -> { ok, status } }.
export async function signOffAction({ key, accountId, payload }, deps) {
  const reason = String(payload?.reason ?? '').trim();
  if (reason.length < MIN_REASON) return { ok: false, error: `A reason of at least ${MIN_REASON} characters is required.` };
  if (reason.length > MAX_REASON) return { ok: false, error: `The reason is longer than ${MAX_REASON} characters.` };
  if (!accountId) return { ok: false, error: 'The person is not known.' };
  if (!(await deps.canEdit(key))) return { ok: false, error: 'Sign-off refused: only a person who can edit this work item can sign it off.' };
  const record = latestDone(await deps.readVerdicts(key));
  if (!record) return { ok: false, error: 'There is no "done" claim on this work item yet. Claim done first; the verdict then names the merged commit.' };
  const sha = record.mergeSha;
  if (typeof sha !== 'string' || !SHA.test(sha)) return { ok: false, error: 'The latest "done" claim has no merged commit. Merge the pull request and claim done again.' };
  if (record.claimant === accountId) return { ok: false, error: SIGNOFF_CLAIMANT_REFUSAL };
  // The audit event comes first: the property names its seq. An event with no property counts for nothing.
  const audit = await deps.appendAudit({ actor: accountId, event: SIGNOFF_EVENT, data: { key, sha, reason } });
  const signoff = { by: accountId, sha, reason, at: audit.at ?? new Date().toISOString(), auditSeq: audit.seq };
  const put = await deps.writeSignoff(key, signoff);
  if (!put?.ok) return { ok: false, error: `Jira refused the sign-off (HTTP ${put?.status ?? 'unknown'}).` };
  return { ok: true, signoff, auditSeq: audit.seq };
}

// What the panel shows: null when the latest done verdict has no sign-off check and no sign-off
// is stored. `signed.current` is true when the sign-off is for the merged commit of that verdict.
export function signoffPanel(verdicts, signoff) {
  const record = latestDone(verdicts);
  const needed = Boolean(record && Array.isArray(record.checks) && record.checks.some((c) => isObj(c) && c.name === 'human_signoff'));
  const valid = isObj(signoff) && typeof signoff.by === 'string' && signoff.by && typeof signoff.sha === 'string' && SHA.test(signoff.sha)
    && Number.isInteger(signoff.auditSeq) && typeof signoff.at === 'string';
  if (!needed && !valid) return null;
  const mergeSha = record && typeof record.mergeSha === 'string' && SHA.test(record.mergeSha) ? record.mergeSha : null;
  return {
    needed,
    mergeSha,
    claimant: typeof record?.claimant === 'string' ? record.claimant : null,
    signed: valid
      ? { by: signoff.by, sha7: signoff.sha.slice(0, 7), date: signoff.at.slice(0, 16).replace('T', ' '), auditSeq: signoff.auditSeq, current: signoff.sha === mergeSha }
      : null,
  };
}
