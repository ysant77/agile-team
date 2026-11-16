import api, { route } from '@forge/api';

const asApp = (path, options) => api.asApp().requestJira(path, options);

// A field value as the verifier compares it: an option's value or name, or the plain value.
function plainValue(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'object') return v.value ?? v.name ?? v.key ?? JSON.stringify(v);
  return v;
}

// Ticket data for the verifier, read as the app. requestJira is injected in tests.
export async function collectJira(issueKey, requestJira = asApp) {
  const response = await requestJira(
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
  // field_equals compares Jira fields by id; read only the fields the ACs name.
  const names = [...new Set((spec.acceptanceCriteria ?? [])
    .filter((a) => a.check?.type === 'field_equals' && a.check.args?.[0])
    .map((a) => String(a.check.args[0])))];
  let fields = {};
  if (names.length) {
    const read = await requestJira(route`/rest/api/3/issue/${issueKey}?fields=${names.join(',')}`);
    if (!read.ok) throw new Error(`Jira fields of ${issueKey}: HTTP ${read.status}`);
    const got = (await read.json()).fields ?? {};
    fields = Object.fromEntries(names.filter((n) => n in got).map((n) => [n, plainValue(got[n])]));
  }
  return {
    key: issue.key,
    type: issue.fields?.issuetype?.name,
    labels: issue.fields?.labels ?? [],
    fields,
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
