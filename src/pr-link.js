// Fresh-site path, option 1b (docs/DESIGN-FRESH-SITE.md): a person links a PR to the work item
// from the panel. A judge's project key is not in the demo PR titles, so a claim could not find
// the PR by the key. The link is an audit event (pr.linked) and an entry in the app's store, never
// an issue property. A claim counts the latest link whose audit event matches, and only when a
// person other than the claimant made it. Pure logic with injected dependencies.

import { canonical, sha256 } from './audit.js';

export const PR_LINK_EVENT = 'pr.linked';
const linksKey = (key) => `pr-links:${key}`;
const MIN_REASON = 5;
const MAX_REASON = 500;
const MAX_LINKS = 20;

// "7", "#7" or a GitHub pull request URL. Returns { prNumber, repo|null } or { error }.
export function parsePrRef(value) {
  const text = String(value ?? '').trim();
  const url = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/([1-9][0-9]{0,6})\/?$/.exec(text);
  if (url) return { prNumber: Number(url[2]), repo: url[1] };
  const num = /^#?([1-9][0-9]{0,6})$/.exec(text);
  if (num) return { prNumber: Number(num[1]), repo: null };
  return { error: 'give a pull request number (for example 7) or its GitHub URL' };
}

const sameRepo = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

// deps: { canEdit(key), appendAudit(event), store, repo, readPr(number) -> { number, headRepo } | null }.
export async function linkPrAction({ key, accountId, payload }, deps) {
  if (!accountId) return { ok: false, error: 'the person is not known' };
  const ref = parsePrRef(payload?.pr);
  if (ref.error) return { ok: false, error: ref.error };
  const reason = String(payload?.reason ?? '').trim();
  if (reason.length < MIN_REASON) return { ok: false, error: `a reason of at least ${MIN_REASON} characters is required` };
  if (reason.length > MAX_REASON) return { ok: false, error: `the reason is longer than ${MAX_REASON} characters` };
  if (!deps.repo) return { ok: false, error: 'no repository configured' };
  if (ref.repo && !sameRepo(ref.repo, deps.repo)) return { ok: false, error: `that PR is in another repository; the app reads ${deps.repo} only` };
  if (!(await deps.canEdit(key))) return { ok: false, error: 'only a person who can edit this work item can link a PR' };
  const pr = await deps.readPr(ref.prNumber);
  if (!pr) return { ok: false, error: `pull request ${ref.prNumber} not found in ${deps.repo}` };
  if (!sameRepo(pr.headRepo, deps.repo)) return { ok: false, error: `pull request ${ref.prNumber} comes from a fork; its CI report is not posted, so it cannot be linked` };
  const data = { key, repo: deps.repo, prNumber: ref.prNumber, reason };
  const audit = await deps.appendAudit({ actor: accountId, event: PR_LINK_EVENT, data });
  const entries = (await deps.store.get(linksKey(key))) ?? [];
  const next = [...(Array.isArray(entries) ? entries : []), { ...data, by: accountId, at: audit.at ?? null, auditSeq: audit.seq }].slice(-MAX_LINKS);
  await deps.store.set(linksKey(key), next);
  return { ok: true, prNumber: ref.prNumber, auditSeq: audit.seq };
}

// The latest link of a work item, checked against its audit event, for a claim by `claimant`.
// Returns null when there is no link, else { prNumber, by, auditSeq, counted, reason }.
export async function latestPrLink(key, { store, readAudit }, claimant) {
  const entries = await store.get(linksKey(key));
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const e = entries.at(-1);
  const many = entries.length > 1 ? `${entries.length} links; the latest (audit seq ${e?.auditSeq}) is used` : null;
  const out = (counted, why) => ({ prNumber: e?.prNumber ?? null, by: e?.by ?? null, auditSeq: e?.auditSeq ?? null, repo: e?.repo ?? null, counted,
    reason: [why, many].filter(Boolean).join('; ') });
  let event = null;
  if (Number.isInteger(e?.auditSeq) && e.auditSeq >= 0 && readAudit) {
    try {
      [event] = await readAudit(e.auditSeq, 1);
    } catch {
      event = null;
    }
  }
  const matches = event && typeof event === 'object' && event.seq === e.auditSeq && event.event === PR_LINK_EVENT && event.actor === e.by
    && event.data?.key === key && event.data?.prNumber === e.prNumber && event.data?.repo === e.repo
    && (() => { const { hash, ...body } = event; return sha256(canonical(body)) === hash; })();
  if (!matches) return out(false, `the link to PR #${e?.prNumber} has no matching audit event, so it does not count`);
  if (typeof claimant !== 'string' || !claimant) return out(false, `PR #${e.prNumber} is linked, but the claimant is not known, so the link cannot be shown to come from another person`);
  if (e.by === claimant) return out(false, `the link to PR #${e.prNumber} was made by the claimant, so it does not count; another person links the PR`);
  return out(true, `PR #${e.prNumber} linked by ${e.by} (audit seq ${e.auditSeq})`);
}
