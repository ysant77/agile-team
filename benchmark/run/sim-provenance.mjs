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

export function pushRun({ id, sha, repo }) {
  return { id, name: 'CI', path: CI_PATH, head_sha: sha, event: 'push', head_branch: 'main', head_repository: { full_name: repo },
    status: 'completed', conclusion: 'success', run_attempt: 1, html_url: 'x' };
}

// The artifacts of the push run: the marker of the bytes served as main.json.
export function mainArtifacts(servedText) {
  const artifacts = [{ name: 'ci-report' }, { name: `main-report-sha256-${simReportHash(servedText)}-attempt-1` }];
  return { total_count: artifacts.length, artifacts };
}
