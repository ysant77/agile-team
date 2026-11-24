// Rovo actions for discovery from symptoms (Mode B). The rules are in src/discovery.js; this file
// binds them to Forge: Jira says who is asking, KVS holds the investigation and its read log, the
// audit chain records starts and findings, and GitHub is read with the app's token when one is set.
//
// Configuration (Forge variables): DISCOVERY_REPO (owner/name) and DISCOVERY_REF (the investigated
// branch). With either one missing, no investigation starts. GITHUB_TOKEN, when set, is sent here
// too (lead review of 23 Nov, finding 4): without it, discovery and claims share the 60 calls an
// hour of an outgoing address. The read budget of src/discovery.js stays as it is; it limits what
// one investigation may read, not what GitHub allows.

import api from '@forge/api';
import { kvs } from '@forge/kvs';
import { appendAudit, readAudit } from './audit-store.js';
import { currentAccountId } from './action-guard.js';
import { listRepoFiles, readCiResults, readRepoFile, recordFinding, startInvestigation } from './discovery.js';
import { githubHeaders } from './github-evidence.js';

const API = 'https://api.github.com';

export function forgeDeps() {
  return {
    store: kvs,
    get: (path) => api.fetch(`${API}${path}`, { headers: githubHeaders(process.env.GITHUB_TOKEN) }),
    now: () => Date.now(),
    appendAudit,
    readAudit,
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
