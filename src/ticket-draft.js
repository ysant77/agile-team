// Narrow ticket confirmation (owner decision 24 Nov; docs/DESIGN-TICKET-CONFIRMATION.md, middle
// way). Rovo does not tell the code that a person confirmed a CREATE action. So a draft that states
// a number, a currency or a money label is stored, not created; the person who drafted it creates
// exactly the stored draft from the panel. Other drafts are created at once, as before. Pure logic
// with injected dependencies: { store, appendAudit, create(draft, by), now() }.

import { randomUUID } from 'node:crypto';
import { canonical, sha256 } from './audit.js';

export const DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_PER_PERSON = 20;
const draftKey = (id) => `ticket-draft:${id}`;
const byKey = (accountId) => `ticket-drafts-by:${accountId}`;
const CURRENCY = /\b(EUR|USD|GBP|SGD|JPY|KRW|BHD|KWD|CHF|INR|CNY|AUD|CAD)\b|[€$£¥₹]/;
const MONEY_LABELS = ['money_semantics'];

// Why this draft needs a person's confirmation in the app; empty when it does not. Only the text
// that a person or the agent wrote is read (summary, description, AC lines), not the story points
// and not the finding note that the app adds.
export function needsConfirmation(draft) {
  const text = [draft?.summary, draft?.description, ...(Array.isArray(draft?.acceptanceCriteria) ? draft.acceptanceCriteria.map((a) => a?.text) : [])]
    .map((t) => String(t ?? '')).join('\n');
  const why = [];
  if (/[0-9]/.test(text)) why.push('a number');
  if (CURRENCY.test(text)) why.push('a currency');
  for (const label of MONEY_LABELS) if ((draft?.labels ?? []).includes(label)) why.push(`the label ${label}`);
  return why;
}

const hashOf = (draft) => sha256(canonical(draft));

export async function storeDraft({ by, draft, request, findingId = null }, deps) {
  const draftId = randomUUID();
  const hash = hashOf(draft);
  const at = deps.now();
  const record = { draftId, by, draft, hash, request: String(request ?? ''), findingId, state: 'pending', at, expiresAt: at + DRAFT_TTL_MS };
  await deps.store.set(draftKey(draftId), record);
  const ids = (await deps.store.get(byKey(by))) ?? [];
  await deps.store.set(byKey(by), [...(Array.isArray(ids) ? ids : []), draftId].slice(-MAX_PER_PERSON));
  const audit = await deps.appendAudit({ actor: by, event: 'ticket.drafted', data: { draftId, hash, projectKey: draft.projectKey, why: needsConfirmation(draft) } });
  return { ok: true, pending: true, draftId, hash, auditSeq: audit.seq };
}

// The person's pending drafts that have not expired, newest last.
export async function listDrafts(accountId, deps) {
  if (!accountId) return [];
  const ids = (await deps.store.get(byKey(accountId))) ?? [];
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const r = await deps.store.get(draftKey(id));
    if (r && r.by === accountId && r.state === 'pending' && deps.now() <= r.expiresAt) {
      out.push({ draftId: r.draftId, draft: r.draft, request: r.request, expiresAt: r.expiresAt, why: needsConfirmation(r.draft) });
    }
  }
  return out;
}

// Common checks of Create and Reject. Returns { record } or { error }.
async function openDraft(draftId, accountId, deps) {
  if (!accountId) return { error: 'the person is not known' };
  const record = typeof draftId === 'string' && draftId ? await deps.store.get(draftKey(draftId)) : null;
  if (!record) return { error: 'there is no draft with this id' };
  if (record.by !== accountId) return { error: 'only the person who drafted it can create or reject this draft' };
  return { record };
}

export async function confirmDraft({ draftId, accountId }, deps) {
  const { record, error } = await openDraft(draftId, accountId, deps);
  if (error) return { ok: false, error };
  if (record.state === 'created') return { ok: true, key: record.key, duplicate: true, note: `This draft was already created as ${record.key}.` };
  if (record.state === 'rejected') return { ok: false, error: 'this draft was rejected; ask the agent for a new draft' };
  if (record.state === 'creating') return { ok: false, error: 'this draft is being created now; check Jira before you try again' };
  if (deps.now() > record.expiresAt) return { ok: false, error: 'this draft has expired; ask the agent for a new draft' };
  if (hashOf(record.draft) !== record.hash) return { ok: false, error: 'the stored draft changed after it was drafted, so it is not created' };
  await deps.store.set(draftKey(draftId), { ...record, state: 'creating' });
  let result;
  try {
    result = await deps.create(record.draft, accountId);
  } catch (e) {
    await deps.store.set(draftKey(draftId), { ...record, state: 'pending' });
    throw e;
  }
  if (!result?.ok) {
    await deps.store.set(draftKey(draftId), { ...record, state: 'pending' });
    return result ?? { ok: false, error: 'the work item was not created' };
  }
  await deps.store.set(draftKey(draftId), { ...record, state: 'created', key: result.key });
  const audit = await deps.appendAudit({ actor: accountId, event: 'ticket.draft_confirmed', data: { draftId, hash: record.hash, key: result.key } });
  return { ...result, draftId, confirmAuditSeq: audit.seq };
}

export async function rejectDraft({ draftId, accountId }, deps) {
  const { record, error } = await openDraft(draftId, accountId, deps);
  if (error) return { ok: false, error };
  if (record.state !== 'pending') return { ok: false, error: `this draft is ${record.state}` };
  await deps.store.set(draftKey(draftId), { ...record, state: 'rejected' });
  const audit = await deps.appendAudit({ actor: accountId, event: 'ticket.draft_rejected', data: { draftId, hash: record.hash } });
  return { ok: true, auditSeq: audit.seq };
}
