import api, { route } from '@forge/api';

// Ticket data for the verifier, read as the app.
export async function collectJira(issueKey) {
  const response = await api
    .asApp()
    .requestJira(
      route`/rest/api/3/issue/${issueKey}?fields=issuetype,status,subtasks,issuelinks,labels&properties=aat.ticket`,
    );
  if (!response.ok) throw new Error(`Jira issue ${issueKey}: HTTP ${response.status}`);
  const issue = await response.json();
  const spec = issue.properties?.['aat.ticket'] ?? {};
  const links = (issue.fields?.issuelinks ?? []).flatMap((l) => {
    if (l.inwardIssue) {
      return [{ type: l.type?.inward, key: l.inwardIssue.key, statusCategory: l.inwardIssue.fields?.status?.statusCategory?.key }];
    }
    if (l.outwardIssue) {
      return [{ type: l.type?.outward, key: l.outwardIssue.key, statusCategory: l.outwardIssue.fields?.status?.statusCategory?.key }];
    }
    return [];
  });
  return {
    key: issue.key,
    type: issue.fields?.issuetype?.name,
    labels: issue.fields?.labels ?? [],
    status: issue.fields?.status?.name,
    subtasks: (issue.fields?.subtasks ?? []).map((s) => ({
      key: s.key,
      statusCategory: s.fields?.status?.statusCategory?.key,
    })),
    links,
    acceptanceCriteria: spec.acceptanceCriteria ?? [],
    preRegistered: spec.preRegistered,
    domain: spec.domain,
    approvedTestRemovals: spec.approvedTestRemovals ?? [],
  };
}

export async function addVerdictProperty(issueKey, verdict) {
  const path = route`/rest/api/3/issue/${issueKey}/properties/aat.verdicts`;
  const current = await api.asApp().requestJira(path);
  const list = current.ok ? ((await current.json()).value ?? []) : [];
  const next = [...list, verdict].slice(-50);
  const put = await api.asApp().requestJira(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
  });
  return put.ok;
}
