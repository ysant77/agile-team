import api, { route } from '@forge/api';
import Resolver from '@forge/resolver';
import { appendAudit, readAudit } from './audit-store.js';
import { buildMonitor } from './monitor.js';
import { kvs } from '@forge/kvs';
import { adoptFromReviews } from './review.js';

const resolver = new Resolver();

async function getProperty(key, name) {
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${key}/properties/${name}`);
  return response.ok ? (await response.json()).value : null;
}

resolver.define('getPanel', async ({ context }) => {
  const key = context.extension.issue.key;
  const [spec, verdicts, approval, reviews] = await Promise.all([
    getProperty(key, 'aat.ticket'),
    getProperty(key, 'aat.verdicts'),
    getProperty(key, 'aat.approval'),
    getProperty(key, 'aat.reviews'),
  ]);
  return { key, spec, verdicts: verdicts ?? [], approval, reviews: reviews ?? [] };
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
  return { ok: true, auditSeq: audit.seq };
});

// Monitor page: the whole audit chain (small in the demo), checked and replayed.
const MONITOR_MAX = 2000;
resolver.define('getMonitor', async () => {
  const head = await kvs.get('audit-head');
  const count = head ? Math.min(head.seq + 1, MONITOR_MAX) : 0;
  const events = [];
  for (let from = 0; from < count; from += 50) events.push(...(await readAudit(from, Math.min(50, count - from))));
  const monitor = buildMonitor(events);
  return { ...monitor, truncated: head ? head.seq + 1 > MONITOR_MAX : false, readAt: new Date().toISOString() };
});

export const handler = resolver.getDefinitions();
