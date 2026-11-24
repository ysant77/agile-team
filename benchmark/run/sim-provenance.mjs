// Simulated GitHub facts for report provenance (SCORER-CHANGES 20). Gives what the bank CI gives
// since bank PR 22: run event, head branch and head repository; the report hash marker of the
// pinned PR run; the push run on main for main.json and its marker. The hash rule is the shared one
// (sha256 of the text without trailing spaces, tabs, CR and LF). It is written here, not imported
// from the app, so the scorer also runs against app versions that do not have it.

import { createHash } from 'node:crypto';

const CI_PATH = '.github/workflows/ci.yml';

export const simReportHash = (text) => createHash('sha256').update(String(text).replace(/[ \t\r\n]+$/, ''), 'utf8').digest('hex');

export function withRunFacts(run, { headBranch, repo, fork = false }) {
  return { ...run, event: 'pull_request', head_branch: headBranch, head_repository: { full_name: fork ? 'someone/yms-bank-demo' : repo } };
}

// The artifacts of a PR run. ciText: the report as CI wrote it. marker: false for a run that
// uploads no marker (another workflow, a fork, no bot report, a cancelled run).
export function prArtifacts({ attempt, ciText, marker }) {
  const artifacts = [{ name: 'ci-report' }];
  if (marker && typeof ciText === 'string') artifacts.push({ name: `ci-report-sha256-${simReportHash(ciText)}-attempt-${attempt}` });
  return { total_count: artifacts.length, artifacts };
}

// conclusion: 'success' unless the case states a failed push run (SCORER-CHANGES 21, V21).
// SCORER-CHANGES 22 (e): status 'in_progress' gives a run with no conclusion yet.
export function pushRun({ id, sha, repo, conclusion = 'success', status = 'completed' }) {
  return { id, name: 'CI', path: CI_PATH, head_sha: sha, event: 'push', head_branch: 'main', head_repository: { full_name: repo },
    status, conclusion: status === 'completed' ? conclusion : null, run_attempt: 1, html_url: 'x' };
}

// SCORER-CHANGES 21 (c), V15: the report comment as a person edited it after the run. One base
// outcome of the repro block changes; the report that CI wrote (and its marker) does not.
export function editedComment(report, { test, baseOutcome, excType = null }) {
  const edited = structuredClone(report);
  for (const t of edited.repro?.tests ?? []) if (t.id === test) t.base = { outcome: baseOutcome, exc_type: excType };
  return edited;
}

// SCORER-CHANGES 21 (d), V21: the genuine report of the push run on the merge commit, in which the
// named test failed. The served main.json is a different file (pushed by a person); only this
// genuine report has the run's marker.
export function genuineMainReport(served, { test, excType = 'AssertionError' }) {
  const genuine = structuredClone(served);
  for (const t of genuine.tests ?? []) if (t.id === test) Object.assign(t, { outcome: 'failed', exc_type: excType });
  return genuine;
}

// The artifacts of the push run: the marker of the bytes served as main.json.
export function mainArtifacts(servedText) {
  const artifacts = [{ name: 'ci-report' }, { name: `main-report-sha256-${simReportHash(servedText)}-attempt-1` }];
  return { total_count: artifacts.length, artifacts };
}
