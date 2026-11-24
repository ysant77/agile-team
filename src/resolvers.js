import api, { route } from '@forge/api';
import Resolver from '@forge/resolver';
import { appendAudit, auditLength, readAudit } from './audit-store.js';
import { monitorForViewer } from './monitor.js';
import { kvs } from '@forge/kvs';
import { adoptFromReviews } from './review.js';
import { approveTest, recordAcsAction } from './approval-actions.js';
import { saveAcsAction } from './ac-editor.js';
import { githubClient, githubFailure } from './github-evidence.js';
import { linkPrAction } from './pr-link.js';
import { collectJira } from './jira-evidence.js';
import { latestView, notCheckedLine } from './verdict-view.js';
import { latestNotChecked, notCheckedKey } from './verify-claim.js';
import { readLatestDone, signOffAction, signoffPanel } from './sign-off.js';
import { getFindingAction } from './finding-view.js';
import { confirmDraft, listDrafts, rejectDraft } from './ticket-draft.js';
import { createFromDraft } from './index.js';
import { canonical, sha256 } from './audit.js';

const resolver = new Resolver();

async function getProperty(key, name) {
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${key}/properties/${name}`);
  return response.ok ? (await response.json()).value : null;
}

// Whether the person can edit the work item (Jira checks it as the user).
async function canEdit(key) {
  const response = await api.asUser().requestJira(route`/rest/api/3/mypermissions?issueKey=${key}&permissions=EDIT_ISSUES`);
  if (!response.ok) return false;
  return (await response.json()).permissions?.EDIT_ISSUES?.havePermission === true;
}
// The ACs exactly as the verifier reads them (as the app, from aat.ticket).
const readAcs = async (key) => (await collectJira(key)).acceptanceCriteria;
const approvalDeps = { canEdit, readAcs, appendAudit, store: kvs };

// A person approves the removal or change of one test (finding E1, 19 Nov). Only this action, not
// the issue property, gives an approval that the verifier counts; the claimant's own approval
// does not count.
resolver.define('approveTest', async ({ payload, context }) => approveTest({ key: context.extension.issue.key, accountId: context.accountId, payload }, approvalDeps));

// A person records the current ACs. A later change to the ACs makes the verdict cannot_verify
// until a person records them again.
resolver.define('recordAcs', async ({ context }) => recordAcsAction({ key: context.extension.issue.key, accountId: context.accountId }, approvalDeps));

// Fresh-site path (option 1a): a person types the ACs in the panel; the app writes the ticket
// spec as the user and records the ACs (src/ac-editor.js).
async function writeSpec(key, spec) {
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${key}/properties/aat.ticket`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });
  return { ok: response.ok, status: response.status };
}
resolver.define('saveAcs', async ({ payload, context }) => saveAcsAction(
  { key: context.extension.issue.key, accountId: context.accountId, payload },
  { ...approvalDeps, readSpec: (key) => getProperty(key, 'aat.ticket'), writeSpec },
));

// Fresh-site path (option 1b): a person links a PR to the work item. The link is audited and kept
// in the app's store (src/pr-link.js); a claim counts it only when the claimant did not make it.
async function readPr(prNumber) {
  const repo = process.env.GITHUB_REPO;
  const { get } = githubClient({ token: process.env.GITHUB_TOKEN, fetchFn: api.fetch });
  const body = await get(`/repos/${repo}/pulls/${prNumber}`);
  return body ? { number: body.number, headRepo: body.head?.repo?.full_name ?? null } : null;
}
resolver.define('linkPr', async ({ payload, context }) => {
  try {
    return await linkPrAction({ key: context.extension.issue.key, accountId: context.accountId, payload },
      { canEdit, appendAudit, store: kvs, repo: process.env.GITHUB_REPO, readPr });
  } catch (error) {
    if (error?.name === 'GitHubError') return githubFailure(error);
    throw error;
  }
});

resolver.define('getPanel', async ({ context }) => {
  const key = context.extension.issue.key;
  const [spec, verdicts, approval, reviews, signoff] = await Promise.all([
    getProperty(key, 'aat.ticket'),
    getProperty(key, 'aat.verdicts'),
    getProperty(key, 'aat.approval'),
    getProperty(key, 'aat.reviews'),
    getProperty(key, 'aat.signoff'),
  ]);
  // The verdict view explains the newest verdict; code set it, and the view never changes it.
  const prLinks = (await kvs.get(`pr-links:${key}`)) ?? [];
  // A claim that GitHub could not answer is not a verdict; the panel says so while no verdict is newer.
  const notChecked = notCheckedLine(latestNotChecked(await kvs.get(notCheckedKey(key)), verdicts));
  return { key, spec, verdicts: verdicts ?? [], view: latestView(verdicts), approval, reviews: reviews ?? [], signoff: signoffPanel(verdicts, signoff),
    prLink: Array.isArray(prLinks) && prLinks.length ? { ...prLinks.at(-1), count: prLinks.length } : null, notChecked };
});

resolver.define('approve', async ({ payload, context }) => {
  const key = context.extension.issue.key;
  const reason = String(payload?.reason ?? '').trim();
  if (reason.length < 5) return { ok: false, error: 'A reason of at least 5 characters is required.' };
  const approval = { by: context.accountId, reason, at: new Date().toISOString() };
  // As the user: only someone who can edit the issue can approve it.
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${key}/properties/aat.approval`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(approval),
  });
  if (!response.ok) return { ok: false, error: `Jira refused the approval (HTTP ${response.status}).` };
  const audit = await appendAudit({ actor: context.accountId, event: 'requirement.approved', data: { key, reason } });
  return { ok: true, approval, auditSeq: audit.seq };
});

// A person signs off the merged change of a high-stake ticket (DESIGN 6a, benchmark B27), from the
// panel button (src/sign-off.js). The merged commit and the claimant come from the latest done
// verdict; the claimant is refused. As the user: only someone who can edit the issue can sign off.
async function writeSignoff(key, signoff) {
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${key}/properties/aat.signoff`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signoff),
  });
  return { ok: response.ok, status: response.status };
}
resolver.define('signOff', async ({ payload, context }) => signOffAction(
  { key: context.extension.issue.key, accountId: context.accountId, payload },
  { canEdit, readLatestDone: (key) => readLatestDone(key, { store: kvs, readAudit }), appendAudit, writeSignoff },
));

// A human adopts a proposed check from a review (DESIGN 14a). The AC then names the test; CI and
// the verifier decide the result. As the user: only someone who can edit the issue can adopt.
resolver.define('adoptCheck', async ({ payload, context }) => {
  const key = context.extension.issue.key;
  const [spec, reviews] = await Promise.all([getProperty(key, 'aat.ticket'), getProperty(key, 'aat.reviews')]);
  const result = adoptFromReviews({ key, ...(spec ?? {}) }, reviews, {
    prNumber: Number(payload?.prNumber), testName: String(payload?.testName ?? ''), reason: payload?.reason,
  });
  if (!result.ok) return result;
  const { key: _, ...next } = result.spec;
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${key}/properties/aat.ticket`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
  });
  if (!response.ok) return { ok: false, error: `Jira refused the change (HTTP ${response.status}).` };
  const audit = await appendAudit({ actor: context.accountId, event: 'check.adopted', data: {
    key, ac: result.proposal.ac, testName: result.proposal.testName, prNumber: Number(payload?.prNumber), reason: String(payload.reason).trim() } });
  // The adoption changes the ACs on purpose, so the person's action also records the new ACs.
  const recorded = await recordAcsAction({ key, accountId: context.accountId }, approvalDeps);
  return { ok: true, auditSeq: audit.seq, acsAuditSeq: recorded.ok ? recorded.auditSeq : null };
});

// As the user: a work item the person cannot browse returns 404.
const canBrowse = async (key) => (await api.asUser().requestJira(route`/rest/api/3/issue/${key}?fields=id`)).ok;

// The panel shows a stored discovery finding by its id (src/finding-view.js). It only reads the
// app's store. Review of 24 Nov: only the investigator, or a person who can browse a work item
// that the finding is linked to, gets the view.
resolver.define('getFinding', async ({ payload, context }) => getFindingAction(payload, { store: kvs, accountId: context?.accountId, canBrowse }));

// Narrow ticket confirmation (src/ticket-draft.js): the person's stored drafts, and Create or
// Reject of one. The person is context.accountId, never an input. Create makes exactly the stored
// draft, as the user, and its ticket.created event names the draft hash.
const draftDeps = {
  store: kvs, appendAudit, now: () => Date.now(),
  create: (draft, by) => createFromDraft(by, draft, undefined, { draftHash: sha256(canonical(draft)) }),
};
resolver.define('getTicketDrafts', async ({ context }) => ({ drafts: await listDrafts(context?.accountId, draftDeps) }));
resolver.define('confirmTicketDraft', async ({ payload, context }) => confirmDraft({ draftId: payload?.draftId, accountId: context?.accountId }, draftDeps));
resolver.define('rejectTicketDraft', async ({ payload, context }) => rejectDraft({ draftId: payload?.draftId, accountId: context?.accountId }, draftDeps));

// Monitor page: the whole audit chain (small in the demo), checked and replayed.
const MONITOR_MAX = 2000;
resolver.define('getMonitor', async () => {
  // Every event, also one written after the head pointer's last update (review of 24 Nov).
  const total = await auditLength(kvs);
  const count = Math.min(total, MONITOR_MAX);
  const events = [];
  for (let from = 0; from < count; from += 50) events.push(...(await readAudit(from, Math.min(50, count - from))));
  // As the user: a work item the viewer cannot browse is left out.
  const monitor = await monitorForViewer(events, canBrowse);
  return { ...monitor, truncated: total > MONITOR_MAX, readAt: new Date().toISOString() };
});

export const handler = resolver.getDefinitions();
