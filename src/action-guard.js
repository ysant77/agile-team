// Shared rules for actions that change state (docs/ACTIONS.md; execution plan 19 Nov, findings E2
// to E4). Jira checks each call made as the user, so these helpers ask Jira, never a prompt.

import api, { route } from '@forge/api';

// Whether the person who called the action can see the work item. An action that then reads or
// writes as the app must not run for a work item the person cannot browse (finding E4).
export async function userCanBrowse(issueKey) {
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=id`);
  return response.ok;
}

export const cannotSee = (issueKey) => ({ ok: false, error: `you cannot see ${issueKey}, so this action does not run` });

// The account id of the person who called the action, as Jira knows it. null when Jira does not say.
export async function currentAccountId() {
  const response = await api.asUser().requestJira(route`/rest/api/3/myself`);
  if (!response.ok) return null;
  const me = await response.json();
  return typeof me?.accountId === 'string' && me.accountId ? me.accountId : null;
}

// Writes `key` only if it does not exist (Forge KVS FAIL_IF_EXISTS). True when this call wrote it.
export async function createOnce(store, key, value) {
  try {
    await store.set(key, value, { keyPolicy: 'FAIL_IF_EXISTS' });
    return true;
  } catch (error) {
    if (await store.get(key)) return false; // another call wrote it
    throw error; // a storage error, not a conflict
  }
}
