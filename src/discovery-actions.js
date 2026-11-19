// Rovo actions for discovery from symptoms (Mode B). The rules are in src/discovery.js; this file
// binds them to Forge: Jira says who is asking, KVS holds the investigation and its read log, the
// audit chain records starts and findings, and GitHub is read without a token.
//
// Configuration (Forge variables): DISCOVERY_REPO (owner/name) and DISCOVERY_REF (the investigated
// branch). With either one missing, no investigation starts. GITHUB_TOKEN is never used here: the
// read budget is set for 60 calls an hour.

import api from '@forge/api';
import { kvs } from '@forge/kvs';
import { appendAudit } from './audit-store.js';
import { currentAccountId } from './action-guard.js';
import { listRepoFiles, readCiResults, readRepoFile, recordFinding, startInvestigation } from './discovery.js';

const API = 'https://api.github.com';
const HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'agile-team-forge-app', 'X-GitHub-Api-Version': '2022-11-28' };

function forgeDeps() {
  return {
    store: kvs,
    // No Authorization header, on purpose (see the top of this file).
    get: (path) => api.fetch(`${API}${path}`, { headers: { ...HEADERS } }),
    now: () => Date.now(),
    appendAudit,
  };
}

export async function startInvestigationAction(payload) {
  const by = await currentAccountId();
  return startInvestigation({ symptom: payload?.symptom, by, repo: process.env.DISCOVERY_REPO, ref: process.env.DISCOVERY_REF }, forgeDeps());
}

export async function listRepoFilesAction(payload) {
  return listRepoFiles({ investigationId: payload?.investigationId, by: await currentAccountId(), prefix: payload?.prefix }, forgeDeps());
}

export async function readRepoFileAction(payload) {
  return readRepoFile({ investigationId: payload?.investigationId, by: await currentAccountId(), path: payload?.path, startLine: payload?.startLine }, forgeDeps());
}

export async function readCiResultsAction(payload) {
  return readCiResults({ investigationId: payload?.investigationId, by: await currentAccountId() }, forgeDeps());
}

export async function recordFindingAction(payload) {
  return recordFinding({ investigationId: payload?.investigationId, by: await currentAccountId(), finding: payload?.finding }, forgeDeps());
}
