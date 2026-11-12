import api, { route } from '@forge/api';
import Resolver from '@forge/resolver';
import { appendAudit } from './audit-store.js';

const resolver = new Resolver();

async function getProperty(key, name) {
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${key}/properties/${name}`);
  return response.ok ? (await response.json()).value : null;
}

resolver.define('getPanel', async ({ context }) => {
  const key = context.extension.issue.key;
  const [spec, verdicts, approval] = await Promise.all([
    getProperty(key, 'aat.ticket'),
    getProperty(key, 'aat.verdicts'),
    getProperty(key, 'aat.approval'),
  ]);
  return { key, spec, verdicts: verdicts ?? [], approval };
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

export const handler = resolver.getDefinitions();
