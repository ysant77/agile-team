import api, { route } from '@forge/api';
import Resolver from '@forge/resolver';
import { appendAudit, readAudit } from './audit-store.js';
import { monitorForViewer } from './monitor.js';
import { kvs } from '@forge/kvs';
import { adoptFromReviews } from './review.js';
import { approveTest, recordAcsAction } from './approval-actions.js';
import { collectJira } from './jira-evidence.js';
import { latestView } from './verdict-view.js';

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

resolver.define('getPanel', async ({ context }) => {
  const key = context.extension.issue.key;
  const [spec, verdicts, approval, reviews] = await Promise.all([
    getProperty(key, 'aat.ticket'),
    getProperty(key, 'aat.verdicts'),
    getProperty(key, 'aat.approval'),
    getProperty(key, 'aat.reviews'),
  ]);
  // The verdict view explains the newest verdict; code set it, and the view never changes it.
  return { key, spec, verdicts: verdicts ?? [], view: latestView(verdicts), approval, reviews: reviews ?? [] };
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

// A person signs off the merged change of a high-stake ticket (DESIGN 6a, benchmark B27). As the
// user: only someone who can edit the issue can sign off. The sign-off names the commit.
resolver.define('signOff', async ({ payload, context }) => {
  const key = context.extension.issue.key;
  const sha = String(payload?.sha ?? '').trim();
  const reason = String(payload?.reason ?? '').trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) return { ok: false, error: 'The sign-off must name the full merged commit id.' };
  if (reason.length < 5) return { ok: false, error: 'A reason of at least 5 characters is required.' };
  // The audit event comes first: the property names its seq, and the verifier counts a sign-off
  // only when the event matches (PR 8 review, item 10). An event with no property counts for nothing.
  const audit = await appendAudit({ actor: context.accountId, event: 'change.signed_off', data: { key, sha, reason } });
  const signoff = { by: context.accountId, sha, reason, at: new Date().toISOString(), auditSeq: audit.seq };
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${key}/properties/aat.signoff`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signoff),
  });
  if (!response.ok) return { ok: false, error: `Jira refused the sign-off (HTTP ${response.status}).` };
  return { ok: true, signoff, auditSeq: audit.seq };
});

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

// Monitor page: the whole audit chain (small in the demo), checked and replayed.
const MONITOR_MAX = 2000;
resolver.define('getMonitor', async () => {
  const head = await kvs.get('audit-head');
  const count = head ? Math.min(head.seq + 1, MONITOR_MAX) : 0;
  const events = [];
  for (let from = 0; from < count; from += 50) events.push(...(await readAudit(from, Math.min(50, count - from))));
  // As the user: a work item the viewer cannot browse returns 404 and is left out.
  const canSee = async (key) => (await api.asUser().requestJira(route`/rest/api/3/issue/${key}?fields=id`)).ok;
  const monitor = await monitorForViewer(events, canSee);
  return { ...monitor, truncated: head ? head.seq + 1 > MONITOR_MAX : false, readAt: new Date().toISOString() };
});

export const handler = resolver.getDefinitions();
