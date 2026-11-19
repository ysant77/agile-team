import api, { route } from '@forge/api';
import { adfToText, textToAdf } from './text.js';

const POINT_FIELD_NAMES = ['Story point estimate', 'Story Points', 'Story points'];

// The board's estimation field is the one the board shows; fall back to field names.
export async function findStoryPointField(requester, projectKey) {
  try {
    const boards = await requester.requestJira(
      route`/rest/agile/1.0/board?projectKeyOrId=${projectKey}&maxResults=1`,
    );
    if (boards.ok) {
      const board = (await boards.json()).values?.[0];
      if (board) {
        const config = await requester.requestJira(
          route`/rest/agile/1.0/board/${board.id}/configuration`,
        );
        if (config.ok) {
          const fieldId = (await config.json()).estimation?.field?.fieldId;
          if (fieldId) return { id: fieldId, source: `board ${board.id}` };
        }
      }
    }
  } catch (error) {
    console.log('board estimation lookup failed', error.message);
  }
  const response = await requester.requestJira(route`/rest/api/3/field`);
  if (!response.ok) throw new Error(`Field list failed: ${response.status}`);
  const fields = await response.json();
  for (const name of POINT_FIELD_NAMES) {
    const field = fields.find((f) => f.name === name && f.custom);
    if (field) return { id: field.id, source: `name ${name}` };
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function postIssue(requester, fields) {
  return requester.requestJira(route`/rest/api/3/issue`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

// A new issue can return 404 for a short time after creation; retry the edit.
async function setPoints(requester, key, pointField, storyPoints) {
  let last = '';
  for (const wait of [0, 1500, 3000, 6000]) {
    if (wait) await sleep(wait);
    const edit = await requester.requestJira(route`/rest/api/3/issue/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [pointField]: storyPoints } }),
    });
    if (edit.ok) return { pointsSet: true, pointsVia: `edit after ${wait} ms` };
    last = `${edit.status} ${await edit.text()}`;
  }
  return { pointsSet: false, pointsError: `edit failed: ${last}` };
}

export async function createIssue({ projectKey, summary, description, issueType, storyPoints, acceptanceCriteria = [], labels = [] }) {
  const requester = api.asUser();
  const point = await findStoryPointField(requester, projectKey);
  const pointField = point?.id ?? null;
  const fields = {
    project: { key: projectKey },
    summary,
    description: textToAdf(description),
    issuetype: { name: issueType || 'Task' },
    ...(labels.length ? { labels } : {}),
  };

  // First try to set points in the create call; if the field is not on the create
  // screen, Jira rejects it, so create without it and set it by edit.
  let create = pointField
    ? await postIssue(requester, { ...fields, [pointField]: storyPoints })
    : await postIssue(requester, fields);
  let pointsInCreate = Boolean(pointField) && create.ok;
  if (!create.ok && pointField) {
    create = await postIssue(requester, fields);
    pointsInCreate = false;
  }
  if (!create.ok) {
    const error = await create.text();
    const diagnosis = await diagnoseCreate(projectKey);
    console.log('create diagnosis', JSON.stringify(diagnosis));
    return { ok: false, step: 'create', status: create.status, error, diagnosis };
  }
  const { key } = await create.json();
  const specSaved = await saveTicketSpec(requester, key, { acceptanceCriteria, storyPoints });
  if (pointsInCreate) return { ok: true, key, specSaved, pointField, pointSource: point.source, pointsSet: true, pointsVia: 'create' };
  if (!pointField) return { ok: true, key, specSaved, pointsSet: false, pointsError: 'no story point field' };
  return { ok: true, key, specSaved, pointField, pointSource: point.source, ...(await setPoints(requester, key, pointField, storyPoints)) };
}

// The app's ticket data (acceptance criteria with checks) as issue property aat.ticket.
async function saveTicketSpec(requester, key, spec) {
  const response = await requester.requestJira(route`/rest/api/3/issue/${key}/properties/aat.ticket`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, ...spec }),
  });
  return response.ok;
}

// Spike diagnostics: can the user and the app see the project?
async function diagnoseCreate(projectKey) {
  const status = async (requester, path) => {
    try {
      const response = await requester.requestJira(path);
      return response.status;
    } catch (error) {
      return `error: ${error.message}`;
    }
  };
  const user = api.asUser();
  const app = api.asApp();
  return {
    projectAsUser: await status(user, route`/rest/api/3/project/${projectKey}`),
    projectAsApp: await status(app, route`/rest/api/3/project/${projectKey}`),
    createMetaAsUser: await status(
      user,
      route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
    ),
  };
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
  // A failed post must not count as posted: the queue retries the job.
  if (!response.ok) throw new Error(`Comment post failed: ${response.status}`);
  return true;
}

// True when one of the latest 100 comments holds `marker` (the verdict comment of one claim).
export async function findComment(issueKey, marker) {
  const response = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issueKey}/comment?orderBy=-created&maxResults=100`);
  if (!response.ok) throw new Error(`Comment list failed: ${response.status}`);
  const { comments = [] } = await response.json();
  return comments.some((c) => adfToText(c.body).includes(marker));
}
