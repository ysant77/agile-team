import api, { route } from '@forge/api';
import { textToAdf } from './text.js';

const POINT_FIELD_NAMES = ['Story point estimate', 'Story Points', 'Story points'];

export async function findStoryPointField(requester) {
  const response = await requester.requestJira(route`/rest/api/3/field`);
  if (!response.ok) throw new Error(`Field list failed: ${response.status}`);
  const fields = await response.json();
  for (const name of POINT_FIELD_NAMES) {
    const field = fields.find((f) => f.name === name && f.custom);
    if (field) return field.id;
  }
  return null;
}

export async function createIssue({ projectKey, summary, description, issueType, storyPoints }) {
  const requester = api.asUser();
  const pointField = await findStoryPointField(requester);
  const fields = {
    project: { key: projectKey },
    summary,
    description: textToAdf(description),
    issuetype: { name: issueType || 'Task' },
  };
  const create = await requester.requestJira(route`/rest/api/3/issue`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!create.ok) {
    return { ok: false, step: 'create', status: create.status, error: await create.text() };
  }
  const { key } = await create.json();

  // Set points in a second call: the field is often not on the create screen.
  let pointsSet = false;
  let pointsError = pointField ? null : 'no story point field found';
  if (pointField) {
    const edit = await requester.requestJira(route`/rest/api/3/issue/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [pointField]: storyPoints } }),
    });
    pointsSet = edit.ok;
    if (!edit.ok) pointsError = `edit failed: ${edit.status} ${await edit.text()}`;
  }
  return { ok: true, key, pointField, pointsSet, pointsError };
}

export async function getComment(issueKey, commentId) {
  const response = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issueKey}/comment/${commentId}`);
  if (!response.ok) throw new Error(`Comment read failed: ${response.status}`);
  return response.json();
}

export async function addComment(issueKey, text) {
  const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: textToAdf(text) }),
  });
  return response.ok;
}
