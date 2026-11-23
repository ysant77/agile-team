// Deterministic checks. Each returns { name, status: 'pass' | 'fail' | 'unknown', reason }.
// No model is involved. Unknown means "cannot verify": a human or more evidence is needed.

import { canonical, sha256 } from '../audit.js';
import { acHash, ACS_EVENT, APPROVAL_EVENTS } from '../approvals.js';
import { finiteNumber, namesKey, parseMarker, reportHash, sameFiles, testName, testsByName } from './report.js';

const BOT = 'github-actions[bot]';
const result = (name, status, reason) => ({ name, status, reason });

// Input guards (README, "No check passes by default"): a missing, empty, non-finite or malformed
// input gives unknown, never pass.
const isList = Array.isArray;
const isText = (v) => typeof v === 'string' && v.length > 0;
// Every numeric read of evidence goes through finiteNumber (report.js).
const isNum = (v) => finiteNumber(v) !== null;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// A time in ms, or null when it is missing or does not parse.
const timeOf = (v) => (typeof v === 'string' ? finiteNumber(Date.parse(v)) : null);
// An optional list: undefined means none; any other value that is not an array is malformed (null).
const optList = (v) => (v === undefined ? [] : isList(v) ? v : null);
// Lists whose elements must all be objects, or all non-empty strings (a null element is malformed).
const isObjList = (v) => isList(v) && v.every(isObj);
const isTextList = (v) => isList(v) && v.every(isText);
// A page flag from the reader (truncated.<list>). Only false means the list is complete; a missing
// or malformed flag is not known.
const complete = (ctx, list) => isObj(ctx.truncated) && ctx.truncated[list] === false;
// reportTrusted with this head does not compare the report head (testPasses on another report).
const ANY_HEAD = Symbol('any head');

function issueToken(key) {
  return String(key).replace('-', ''); // BANK-4 -> BANK4, used in test names
}

export const DEFAULT_WORKFLOW_PATHS = ['.github/workflows/ci.yml'];
const runPath = (r) => String(r.path ?? '').split('@')[0];

// Paths that decide how CI runs or how it writes the report. A PR that changes one of them can
// make its own CI say anything, so its CI is not evidence (DESIGN 6, review of 16 Nov).
// Entry forms: "dir/" (everything under it), "**/name" (a file with that name in any folder; a
// "*" in the name matches any characters except "/"), or an exact path. Composite actions and
// pytest's conftest.py run inside CI, so they count. Dependency and pytest configuration files
// decide which plugins and options the test run loads, so they count too (finding D2, 19 Nov).
export const CONFIG_TRUST_PATHS = ['**/pyproject.toml', '**/uv.lock', '**/pytest.ini', '**/setup.cfg', '**/tox.ini', '**/requirements*.txt'];
export const DEFAULT_TRUST_PATHS = ['.github/workflows/', '.github/actions/', '.github/codeql/', '**/conftest.py', ...CONFIG_TRUST_PATHS];
const nameMatches = (name, pattern) => new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`).test(name);
const matchesPath = (file, paths) => paths.some((g) => {
  if (g.endsWith('/')) return file.startsWith(g);
  if (g.startsWith('**/')) return nameMatches(file.split('/').pop(), g.slice(3));
  return file === g;
});

export function pipelineChange(ctx) {
  if (!Array.isArray(ctx.prFiles)) return 'pull request file list not available';
  // A pull request changes at least one file; an empty list was not read correctly.
  if (!ctx.prFiles.length || !ctx.prFiles.every(isText)) return 'pull request file list is empty or malformed';
  const paths = ctx.config?.reportTrustPaths ?? DEFAULT_TRUST_PATHS;
  const touched = ctx.prFiles.filter((f) => matchesPath(f, paths));
  return touched.length ? `PR changes ${touched.join(', ')}, which can change how CI runs or reports` : null;
}

// HEURISTIC, not a boundary (review B4c, 16 Nov). The bank CI edits its own report comment on
// every push, so an edit alone proves nothing. The comment is trusted only when its last edit
// lies inside a pinned workflow run on the head: from the run's start to 60 s after it ended.
// Someone with write access can still edit inside that window. Plan (b2) replaces this with a
// check run that no user can edit (DESIGN section 12).
const EDIT_SLACK_MS = 60 * 1000;
const HEURISTIC = 'report comment time-window heuristic';
function commentEditedLater(ctx) {
  const c = ctx.reportComment;
  if (!c?.updatedAt) return `${HEURISTIC}: comment times not available`;
  if (!isObjList(ctx.workflowRuns)) return `${HEURISTIC}: workflow runs not read, or the list is malformed`;
  const paths = ctx.config?.requiredWorkflowPaths ?? DEFAULT_WORKFLOW_PATHS;
  const runs = ctx.workflowRuns.filter((r) => isList(paths) && paths.includes(runPath(r)) && r.headSha === ctx.pr?.headSha);
  if (runs.length === 0) return `${HEURISTIC}: no pinned CI run on the head, so the comment has no source`;
  const edited = timeOf(c.updatedAt);
  const inside = edited !== null && runs.some((r) => {
    const start = timeOf(r.runStartedAt ?? r.createdAt);
    const end = timeOf(r.updatedAt ?? r.createdAt);
    return start !== null && end !== null && edited >= start && edited <= end + EDIT_SLACK_MS;
  });
  return inside ? null : `${HEURISTIC}: the comment was last edited outside the pinned CI run`;
}

// Guard: a report counts only if the bot wrote it, for the PR head, with unchanged workflows.
export function reportTrusted(ctx, report = ctx.report, headSha = ctx.pr?.headSha) {
  if (!isObj(report)) return result('report_trusted', 'unknown', 'no CI report');
  // The author comes from the comment that carried the report; a field in the report body is
  // written by the code under test and proves nothing.
  if (ctx.reportAuthor !== BOT) {
    return result('report_trusted', 'unknown', `report not posted by ${BOT}`);
  }
  if (headSha !== ANY_HEAD) {
    if (!isText(headSha)) return result('report_trusted', 'unknown', 'no head commit to match the report with');
    if (report.head_sha !== headSha) return result('report_trusted', 'unknown', 'report is for an older commit, not the head');
  }
  // Without the base fingerprint (ci-reports/main.json) a changed workflow cannot be seen.
  if (!isObj(ctx.baseWorkflowFiles) || !Object.keys(ctx.baseWorkflowFiles).length) return result('report_trusted', 'unknown', 'no base workflow fingerprint (ci-reports/main.json)');
  if (!isObj(report.workflow_files)) return result('report_trusted', 'unknown', 'the report has no workflow fingerprint');
  if (!sameFiles(ctx.baseWorkflowFiles, report.workflow_files)) {
    return result('report_trusted', 'unknown', 'workflow changed in this PR');
  }
  if (report === ctx.report) {
    // The latest bot report can be on a comment page that was not read.
    if (!complete(ctx, 'comments')) return result('report_trusted', 'unknown', 'PR comment list is not complete (page limit) or has no page flag, so the latest report is not known');
    // The fingerprint is written by the workflow under test, so the verifier also reads the PR's
    // own file list.
    const change = pipelineChange(ctx);
    if (change) return result('report_trusted', 'unknown', change);
    const edited = commentEditedLater(ctx);
    if (edited) return result('report_trusted', 'unknown', edited);
  }
  return result('report_trusted', 'pass', 'bot report for the head commit');
}

// Report provenance (design P0-3, findings D1 and D3). The bank's report job and publish-main-report
// job upload the report again as an artifact whose name holds its hash and the run attempt. Only the
// run can upload to itself. A report counts only when a run of the pinned workflow on that commit
// (pull_request on the PR head; push on main for main.json) has, at its current attempt, exactly one
// marker hash, equal to the hash of the raw text read. A re-run uploads to the same run under a new
// attempt number: only the current attempt's marker counts, and two different hashes for one
// attempt give unknown. Required per repository (configFor); otherwise advisory, never counted.
const sameRepoName = (a, b) => isText(a) && isText(b) && a.toLowerCase() === b.toLowerCase();
export function reportProvenance(ctx) {
  const name = 'report_provenance';
  const setting = ctx.config?.provenanceRequired;
  const required = setting !== undefined && setting !== false;
  const paths = ctx.config?.requiredWorkflowPaths ?? DEFAULT_WORKFLOW_PATHS;
  const repoOk = (r) => !isText(ctx.repo) || sameRepoName(r.headRepo, ctx.repo);
  const sides = [];
  if (isObj(ctx.report)) {
    sides.push({ label: 'the PR report comment', raw: ctx.reportRaw, runs: ctx.workflowRuns, kind: 'ci',
      want: (r) => r.event === 'pull_request' && isText(ctx.pr?.headSha) && r.headSha === ctx.pr.headSha && repoOk(r) });
  }
  if (isObj(ctx.baseReport)) {
    const sha = ctx.baseReport.head_sha;
    const branch = isText(ctx.pr?.baseRef) ? ctx.pr.baseRef : 'main';
    sides.push({ label: 'main.json', raw: ctx.baseReportRaw, runs: ctx.baseRuns, kind: 'main',
      want: (r) => r.event === 'push' && isText(sha) && r.headSha === sha && r.headBranch === branch && repoOk(r) });
  }
  if (!sides.length) return { ...result(name, 'pass', 'not run: no CI report was read'), advisory: true };
  const problems = [];
  const found = [];
  for (const side of sides) {
    if (!isText(side.raw)) { problems.push(`${side.label}: its raw text was not read`); continue; }
    if (!isList(side.runs)) { problems.push(`${side.label}: the workflow runs were not read`); continue; }
    const h = reportHash(side.raw);
    const runs = side.runs.filter((r) => isObj(r) && paths.includes(runPath(r)) && side.want(r));
    if (!runs.length) { problems.push(`${side.label}: no run of the pinned workflow on its commit`); continue; }
    let match = null;
    let conflict = null;
    let unread = false;
    for (const r of runs) {
      const names = isObj(ctx.artifactsByRun) ? ctx.artifactsByRun[r.id] : undefined;
      if (!isList(names)) { unread = true; continue; }
      const hashes = new Set(names.map(parseMarker).filter((m) => m && m.kind === side.kind && m.attempt === r.attempt).map((m) => m.hash));
      if (hashes.size > 1) conflict = conflict ?? r;
      else if (hashes.has(h)) match = match ?? r;
    }
    if (conflict) problems.push(`${side.label}: run ${conflict.id} attempt ${conflict.attempt} has two report markers with different hashes`);
    else if (match) found.push(`${side.label} matches the marker of run ${match.id} attempt ${match.attempt}`);
    else if (unread) problems.push(`${side.label}: the artifact list of its run was not read`);
    else problems.push(`${side.label}: no run of the pinned workflow has a marker, at its current attempt, with the hash of the text read`);
  }
  const advisory = (text) => ({ ...result(name, 'pass', `not counted (report provenance is not required for this repository): ${text}`), advisory: true });
  if (problems.length) return required ? result(name, 'unknown', problems.join('; ')) : advisory(problems.join('; '));
  return required ? result(name, 'pass', found.join('; ')) : advisory(found.join('; '));
}

// The open or merged PRs that name the key. The collector always gives the list of PR numbers,
// with the chosen PR in it. A missing, empty or malformed list is not known (PR 9 review, item 3).
function candidatesGap(ctx) {
  const list = ctx.prCandidates;
  if (!isList(list) || !list.length || !list.every((n) => Number.isInteger(n) && n > 0)) {
    return `the list of pull requests that name ${ctx.ticket?.key ?? 'the ticket'} is missing, empty or malformed`;
  }
  return null;
}

const forkReason = (ctx) => `PR ${ctx.forkPrs.map((n) => `#${n}`).join(', ')} names ${ctx.ticket?.key} but comes from a fork: CI does not post its report for forks, so a person checks, or the work moves to a branch of this repository`;

export function prLinked(ctx) {
  const pr = ctx.pr;
  if (!pr && !complete(ctx, 'pulls')) {
    return result('pr_linked', 'unknown', `no pull request in the latest ones names ${ctx.ticket?.key}; older ones were not read (page limit, or no page flag)`);
  }
  if (!pr && ctx.forkPrs?.length) return result('pr_linked', 'unknown', forkReason(ctx));
  if (!pr) return result('pr_linked', 'fail', `no pull request names ${ctx.ticket?.key}`);
  if (!isText(ctx.ticket?.key)) return result('pr_linked', 'unknown', 'the ticket has no key');
  const gap = candidatesGap(ctx);
  if (gap) return result('pr_linked', 'unknown', gap);
  // Two open or merged PRs that name the key: code cannot tell which one the claim means.
  if ((ctx.prCandidates ?? []).length > 1) {
    return result('pr_linked', 'unknown', `PRs ${ctx.prCandidates.map((n) => `#${n}`).join(', ')} all name ${ctx.ticket.key}; link one PR`);
  }
  // A PR that does not name the key counts only as the counted, audited panel link (linkedPr is set
  // by src/verify-claim.js from src/pr-link.js).
  const named = namesKey(pr.title, ctx.ticket.key) || namesKey(pr.branch, ctx.ticket.key) || (Number.isInteger(ctx.linkedPr) && ctx.linkedPr === pr.number);
  if (!named) return result('pr_linked', 'fail', `PR #${pr.number} does not name ${ctx.ticket.key}`);
  // The merge flag decides only for a closed PR.
  if ((pr.state !== 'open' && pr.state !== 'closed') || (pr.state === 'closed' && typeof pr.merged !== 'boolean')) {
    return result('pr_linked', 'unknown', `PR #${pr.number} has no valid state or merge flag`);
  }
  if (pr.state === 'closed' && !pr.merged) {
    return result('pr_linked', 'fail', `PR #${pr.number} is closed without merge`);
  }
  // "fixed" and "ready" mean the change is done on its branch; "merged" is its own claim type.
  const open = pr.state === 'open' ? ' (open, not merged)' : '';
  return result('pr_linked', 'pass', `PR #${pr.number} names ${ctx.ticket.key}${open}`);
}

// The pinned workflow files whose runs decide ci_green. A run is matched by its workflow file,
// never by its display name: a PR can add another workflow that is also named "CI".

// Conclusions that mean the run gave no result. Every other conclusion except success is a fail.
const NO_RESULT = ['cancelled', 'stale', 'skipped'];

// The earlier attempts of a re-run (github-evidence.js, earlierConclusions). Failure is left to
// ci_attempts, which reads the failed step. Any other result except success means the attempt
// gave no result, for example a cancelled attempt that was then re-run. Returns a reason when the
// earlier attempts are not known to be clean, else null.
const ATTEMPT_OK = ['success', 'failure'];
function earlierAttemptsGap(run) {
  // GitHub leaves run_attempt out of old runs: a missing attempt is attempt 1.
  const attempt = run.attempt === undefined ? 1 : run.attempt;
  if (!(Number.isInteger(attempt) && attempt >= 1)) return 'a CI run has no valid attempt number';
  if (attempt === 1) return null;
  const name = `run ${run.id ?? '(no id)'}`;
  const list = run.earlierConclusions;
  // Attempts past the read limit are reported by ci_attempts (earlierUnread). A missing count is 0.
  const unread = run.earlierUnread === undefined ? 0 : run.earlierUnread;
  if (!(Number.isInteger(unread) && unread >= 0)) return `${name} has a malformed count of unread attempts`;
  // Rule (final review, item 3): an attempt that was not read may have failed, so ci_green gives
  // unknown by itself, not only through ci_attempts.
  if (unread > 0) return `${unread} earlier attempt(s) of ${name} were not read (read limit): a person checks`;
  const read = attempt - 1;
  const known = isList(list) && list.every((a) => isObj(a) && Number.isInteger(a.attempt))
    && Array.from({ length: read }, (_, i) => i + 1).every((n) => list.some((a) => a.attempt === n));
  if (!known) return `the conclusions of the earlier attempts of ${name} could not be read`;
  const bad = list.filter((a) => !ATTEMPT_OK.includes(a.conclusion));
  return bad.length
    ? bad.map((a) => `attempt ${a.attempt} of ${name} concluded ${a.conclusion ?? 'with no result'} and a re-run followed: a person checks`).join('; ')
    : null;
}

// A run without a result is clean when its steps were read and none failed, and no earlier attempt
// of it failed. Returns a reason when that is not known, else null.
const isStepList = (v) => isList(v) && v.every(isObj);
// Job conclusions that are not a failure.
const JOB_NO_FAIL = ['success', 'cancelled', 'skipped', 'neutral'];
function noResultGap(run) {
  const name = `run ${run.id ?? '(no id)'} (${run.conclusion})`;
  if (!isStepList(run.stepFailures)) return `the steps of ${name} were not read, so it may have failed before it ended`;
  if (run.stepFailures.length) return `${name} failed in step "${run.stepFailures[0].step}" before it ended: a person checks`;
  // A job can fail with no failed step (final review, item 3), so its own conclusion is read too.
  if (!isStepList(run.jobConclusions)) return `the job results of ${name} were not read, so a job may have failed before it ended`;
  const badJob = run.jobConclusions.find((j) => !JOB_NO_FAIL.includes(j.conclusion));
  if (badJob) return `job "${badJob.job}" of ${name} concluded ${badJob.conclusion ?? 'with no result'}: a person checks`;
  if ((run.attempt ?? 1) === 1) return null;
  const failed = (run.earlierConclusions ?? []).find((a) => a?.conclusion === 'failure');
  if (failed) return `attempt ${failed.attempt} of ${name} failed: a person checks`;
  if (!isStepList(run.earlierFailures)) return `the earlier attempts of ${name} were not read`;
  if (run.earlierFailures.length) return `attempt ${run.earlierFailures[0].attempt} of ${name} failed in step "${run.earlierFailures[0].step}": a person checks`;
  return null;
}

export function ciGreen(ctx) {
  const required = ctx.config?.requiredWorkflowPaths === undefined ? DEFAULT_WORKFLOW_PATHS : ctx.config.requiredWorkflowPaths;
  const head = ctx.pr?.headSha;
  if (!isText(head)) return result('ci_green', 'unknown', 'no head commit');
  if (!isList(required) || !required.length || !required.every(isText)) return result('ci_green', 'unknown', 'no valid list of required workflow files in the config');
  if (!isObjList(ctx.workflowRuns)) return result('ci_green', 'unknown', 'workflow runs not read, or the list is malformed');
  const change = pipelineChange(ctx);
  if (change) return result('ci_green', 'unknown', change);
  // A failed run can be on a page that was not read.
  if (!complete(ctx, 'runs')) return result('ci_green', 'unknown', `workflow run list for ${head.slice(0, 7)} is not complete (page limit) or has no page flag`);
  const reasons = [];
  let unknown = false;
  for (const path of required) {
    // Every run of the pinned workflow on the head must succeed; a later success does not
    // hide an earlier failure. LIMIT (README, "Verifier limits"): only runs on the claimed head
    // count. A failure on an earlier head followed by a new commit whose CI passes is green.
    const all = ctx.workflowRuns.filter((r) => runPath(r) === path && r.headSha === head);
    const failed = all.find((r) => r.status === 'completed' && r.conclusion !== 'success' && !NO_RESULT.includes(r.conclusion));
    if (failed) return result('ci_green', 'fail', `${path} concluded ${failed.conclusion} on ${head.slice(0, 7)}`);
    // GitHub lists only the latest attempt of each run id: an earlier attempt can be cancelled.
    const attemptGaps = all.map(earlierAttemptsGap).filter(Boolean);
    if (attemptGaps.length) {
      unknown = true;
      reasons.push(`${path}: ${attemptGaps.join('; ')}`);
      continue;
    }
    // A cancelled or stale run gave no result (benchmark set 2, S17): it is missing evidence, not
    // evidence against the claim. A later completed run of the workflow on the head decides.
    const runs = all.filter((r) => !(r.status === 'completed' && NO_RESULT.includes(r.conclusion)));
    // Rule (README, "A success after a run without a result"): an author can cancel a failing
    // run. A later success counts only when every run without a result is known to have no
    // failed step (stepFailures) and no failed earlier attempt (earlierConclusions,
    // earlierFailures). A cancelled earlier attempt of the success's own run id gives unknown
    // (earlierAttemptsGap).
    const unclean = all.filter((r) => !runs.includes(r)).map(noResultGap).filter(Boolean);
    if (runs.length && unclean.length) {
      unknown = true;
      reasons.push(`${path}: ${unclean.join('; ')}`);
      continue;
    }
    if (runs.length === 0 && all.length > 0) {
      unknown = true;
      reasons.push(`${path}: the run on ${head.slice(0, 7)} concluded ${all[0].conclusion}, so no result exists for the head`);
      continue;
    }
    if (runs.length === 0 || runs.some((r) => r.status !== 'completed')) {
      unknown = true;
      reasons.push(`${path}: no completed run for ${head.slice(0, 7)}`);
      continue;
    }
    // An author can cancel a failing run and start a new one (review finding 13). The success
    // counts only when it was created after every run without a result; equal or missing times
    // give unknown.
    const noResult = all.filter((r) => !runs.includes(r));
    const times = (list) => list.map((r) => timeOf(r.createdAt));
    const known = (t) => t.every((v) => v !== null);
    const lastNoResult = Math.max(...times(noResult));
    const lastSuccess = Math.max(...times(runs));
    if (noResult.length && !(known(times(noResult)) && known(times(runs)) && lastSuccess > lastNoResult)) {
      unknown = true;
      reasons.push(`${path}: a run on ${head.slice(0, 7)} concluded ${noResult[0].conclusion}, and no successful run is known to come after it`);
    } else {
      reasons.push(`${path}: success`);
    }
  }
  return result('ci_green', unknown ? 'unknown' : 'pass', reasons.join('; '));
}

// Test states (owner decision 23 Nov, set 6 W22). passed: it ran and passed. failed and error: it
// ran and did not pass, a fail. Any other state (skipped, xfailed, xpassed, deselected, not_run,
// or none) means it did not run: unknown, never a fail and never a pass.
const RAN_BAD = ['failed', 'error'];
const didNotRun = (outcome) => outcome !== 'passed' && !RAN_BAD.includes(outcome);
const NOT_RUN_REASON = (outcome) => `${isText(outcome) ? outcome : 'no result'}: a person checks why it did not run`;

// A named test that the head report lacks but the base had: the PR deletes it (set 6 W13). The
// base ids are the base report's and the repro block's. null when the base did not have it.
export function deletedTestNote(ctx, name, report = ctx.report) {
  const listed = isObj(report?.repro) ? optList(report.repro.base_test_ids) : null;
  const base = [...(isObjList(ctx.baseReport?.tests) ? ctx.baseReport.tests.map((t) => t.id) : []), ...(listed && listed.every(isText) ? listed : [])];
  return base.some((id) => testName(id) === name) ? 'it is in the base report, so the PR deletes it' : null;
}

export function testPasses(ctx, name, report = ctx.report) {
  // Another report (the merge result) is matched to its commit by the caller (mergedClean).
  const trust = reportTrusted(ctx, report, report === ctx.report ? ctx.pr?.headSha : ANY_HEAD);
  const label = `test_passes(${name})`;
  if (!isText(name)) return result(label, 'unknown', 'no test name');
  if (trust.status !== 'pass') return result(label, 'unknown', trust.reason);
  if (!isObjList(report.tests)) return result(label, 'unknown', 'the report has no valid test list');
  const tests = testsByName(report, name);
  if (tests.length === 0) {
    const deleted = report === ctx.report ? deletedTestNote(ctx, name, report) : null;
    return result(label, 'fail', `${name} is missing from the report${deleted ? `; ${deleted}` : ''}`);
  }
  const bad = tests.filter((t) => RAN_BAD.includes(t.outcome));
  if (bad.length) return result(label, 'fail', `${name}: ${bad[0].outcome}`);
  const notRun = tests.find((t) => didNotRun(t.outcome));
  if (notRun) return result(label, 'unknown', `${name}: ${NOT_RUN_REASON(notRun.outcome)}`);
  return result(label, 'pass', `${name} passed`);
}

// test_passes(a, b, ...): every named test passes on the head. A fail of any name is a fail; else
// an unknown of any name is unknown. The first name stays the reproducer (ticketTests).
export function testPassesAll(ctx, names) {
  if (!Array.isArray(names) || names.length === 0) return result('test_passes', 'unknown', 'no test name');
  if (names.length === 1) return testPasses(ctx, names[0]);
  const parts = names.map((n) => testPasses(ctx, n));
  const label = `test_passes(${names.map(String).join(', ')})`;
  const failed = parts.filter((p) => p.status === 'fail');
  const unknownParts = parts.filter((p) => p.status === 'unknown');
  if (failed.length) return result(label, 'fail', failed.map((p) => p.reason).join('; '));
  if (unknownParts.length) return result(label, 'unknown', unknownParts.map((p) => p.reason).join('; '));
  return result(label, 'pass', parts.map((p) => p.reason).join('; '));
}

export function bugTestExists(ctx) {
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result('bug_test_exists', 'unknown', trust.reason);
  // The key token at a boundary: test_BANK1_x names BANK-1, test_ABANK1_x does not.
  if (!isText(ctx.ticket?.key)) return result('bug_test_exists', 'unknown', 'the ticket has no key');
  if (!isObjList(ctx.report.tests)) return result('bug_test_exists', 'unknown', 'the report has no valid test list');
  const token = new RegExp(`(^|[^A-Za-z0-9])${issueToken(ctx.ticket.key)}_`);
  const tests = ctx.report.tests.filter((t) => token.test(testName(t.id)));
  if (tests.length === 0) {
    return result('bug_test_exists', 'fail', `no test named for ${ctx.ticket.key}: the change may be right, but nothing proves it`);
  }
  const failed = tests.find((t) => RAN_BAD.includes(t.outcome));
  if (failed) return result('bug_test_exists', 'fail', `${testName(failed.id)}: ${failed.outcome}`);
  const notRun = tests.find((t) => didNotRun(t.outcome));
  if (notRun) return result('bug_test_exists', 'unknown', `${testName(notRun.id)}: ${NOT_RUN_REASON(notRun.outcome)}`);
  return result('bug_test_exists', 'pass', `${tests.length} test(s) for ${ctx.ticket.key} passed`);
}

// Words in an added test line that can change a recorded metric without naming it.
const TAMPER = /perf_counter|monotonic|time\.time|\bstash\b|pytest_sessionfinish|pytest_runtest|record_metric|record_samples|ci_report|COLLECTOR|\.metrics\b|xfail|deselect/;

export function metricIntegrity(ctx, name) {
  if (!isText(name)) return 'no metric name';
  // The test list is a guard here (no failed test); the metric is the evidence.
  const tests = optList(ctx.report?.tests);
  if (!tests || !tests.every(isObj)) return 'the report test list is malformed';
  const failed = tests.filter((t) => t.outcome === 'failed' || t.outcome === 'error');
  if (failed.length) return `${failed.length} test(s) failed in the report run, so its metrics are not trusted`;
  if (!isList(ctx.workflowRuns)) return 'workflow runs not read';
  if (ctx.workflowRuns.length && ciGreen(ctx).status !== 'pass') {
    return 'the CI run for the head is not green';
  }
  if (!isTextList(ctx.prFiles) || !ctx.prFiles.length) return 'pull request file list not available, empty or malformed';
  const files = ctx.prFiles;
  const conftest = files.filter((f) => f.split('/').pop() === 'conftest.py');
  if (conftest.length) return `PR changes ${conftest.join(', ')}, which can change any test or metric`;
  const benchFile = (ctx.config?.benchmarks?.[name]?.test ?? '').split('::')[0];
  const quoted = new RegExp(`["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
  for (const file of files.filter((f) => f.startsWith('tests/') && f.endsWith('.py') && f !== benchFile)) {
    const patch = ctx.prPatches?.[file];
    if (!isText(patch)) return `the diff of ${file} is not available`;
    const added = patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    const hit = added.find((l) => quoted.test(l) || TAMPER.test(l));
    if (hit) return `${file} adds a line that names ${name} or touches how metrics are measured: ${hit.slice(1).trim().slice(0, 80)}`;
  }
  return null;
}

// Guarded paths ignore case. A folder entry ("src/bank/testing/") covers everything under it; a
// file entry ("src/fraud/evaluate.py") also covers a file of that name in any sub-folder of its
// folder (unit 2 review, item 11).
function guardedMatch(file, entry) {
  const f = String(file).toLowerCase();
  const g = String(entry).toLowerCase();
  if (g.endsWith('/')) return f.startsWith(g);
  if (f === g) return true;
  const cut = g.lastIndexOf('/');
  return f.startsWith(g.slice(0, cut + 1)) && f.endsWith(`/${g.slice(cut + 1)}`);
}

// A too-good limit for "auc" also covers pr_auc, roc_auc and AUC: the key matches the whole name
// or its last underscore part, without case (unit 2 review, item 11).
function tooGoodLimit(limits, name) {
  const n = String(name).toLowerCase();
  for (const [key, limit] of Object.entries(limits ?? {})) {
    const k = key.toLowerCase();
    if (n === k || n.endsWith(`_${k}`)) return limit;
  }
  return undefined;
}

export function metricCompare(ctx, name, bound, direction) {
  const label = `metric_${direction === 'min' ? 'at_least' : 'at_most'}(${name}, ${bound})`;
  if (!isText(name) || !isNum(bound) || (direction !== 'min' && direction !== 'max')) {
    return result(label, 'unknown', 'the check needs a metric name, a finite bound and a direction (min or max)');
  }
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result(label, 'unknown', trust.reason);
  // A metric is written by the code under test, so the plugin's write-once rule is no trust
  // boundary (the stash, a sessionfinish hook, an xfail or a patched clock can all change it).
  // The gate needs a green run with no failed test, no conftest.py in the diff, and no added
  // test line that names the metric or touches how it is measured; otherwise a human reviews.
  const integrity = metricIntegrity(ctx, name);
  if (integrity) return result(label, 'unknown', `${integrity}: human review`);
  // A repeated benchmark reports {median, iqr_low, iqr_high, runs}; the gate uses the median.
  const raw = ctx.report.metrics?.[name];
  const read = isObj(raw) ? raw.median : raw;
  if (read === undefined || read === null) return result(label, 'fail', `${name} not reported`);
  // 1e999 in JSON is Infinity, and -Infinity passes any upper bound: not a measurement.
  const value = finiteNumber(read);
  if (value === null) return result(label, 'unknown', `${name} is not a finite number in the report`);
  const shown = typeof raw === 'number' ? `${value}` : `median ${value} (IQR ${raw.iqr_low ?? '?'} to ${raw.iqr_high ?? '?'}${raw.runs ? `, ${raw.runs} runs` : ''})`;
  // Metrics are written by the code under test. A PR that changes how they are measured
  // cannot pass a metric gate by itself (DESIGN.md section 12, risk 12).
  const guardedPaths = ctx.config?.guardedPaths ?? [];
  if (guardedPaths.length) {
    if (!Array.isArray(ctx.prFiles)) return result(label, 'unknown', 'pull request file list not available');
    const touched = ctx.prFiles.filter((f) => guardedPaths.some((g) => guardedMatch(f, g)));
    if (touched.length) {
      return result(label, 'unknown', `PR changes ${touched.join(', ')}, which can change how ${name} is measured: human review`);
    }
  }
  const bench = ctx.config?.benchmarks?.[name];
  if (bench) {
    if (typeof raw !== 'object' || raw === null) {
      return result(label, 'unknown', `${name} is a registered benchmark but was reported as one number, not as repeated runs: human review`);
    }
    if (finiteNumber(raw.runs) === null || raw.runs !== bench.runs) {
      return result(label, 'unknown', `${name} has ${raw.runs ?? 'no'} runs; ${bench.runs} are registered: human review`);
    }
    const touched = (ctx.prFiles ?? []).filter((f) => (ctx.config.benchmarkGuardedPaths ?? []).some((g) => (g.endsWith('/') ? f.startsWith(g) : f === g)));
    if (touched.length) {
      return result(label, 'unknown', `PR changes ${touched.join(', ')}, which can change how ${name} is measured: human review`);
    }
    const run = (ctx.report.tests ?? []).find((t) => t.id === bench.test);
    if (!run || run.outcome !== 'passed') {
      return result(label, 'unknown', `benchmark test ${bench.test} is ${run ? run.outcome : 'missing'} in the report: human review`);
    }
  }
  // Drift metrics compare two datasets; equal data hashes make the number meaningless.
  const hashes = ctx.report.data_hashes;
  if (/^psi/i.test(name) && hashes?.train && hashes.train === hashes.live) {
    return result(label, 'unknown', 'data hashes for training and live data are equal: the drift number compares a dataset with itself');
  }
  const guard = tooGoodLimit(ctx.config?.tooGood, name);
  if (guard !== undefined && finiteNumber(guard) === null) return result(label, 'unknown', `the too-good limit for ${name} is not a finite number`);
  if (guard !== undefined && value > guard) {
    return result(label, 'unknown', `${name} = ${shown} is above ${guard}: too good, human review`);
  }
  const ok = direction === 'min' ? value >= bound : value <= bound;
  return result(label, ok ? 'pass' : 'fail', `${name} = ${shown}`);
}

// The release numbers at the start of a version ("2.32.0rc1" gives [2, 32, 0]), or null when the
// version does not start with one. A suffix (rc1, +local, -1) is not compared.
function releaseOf(v) {
  const m = /^(\d+(?:\.\d+)*)/.exec(String(v));
  if (!m) return null;
  const parts = m[1].split('.').map((x) => finiteNumber(Number(x)));
  return parts.every((x) => x !== null) ? parts : null;
}

function compareVersions(pa, pb) {
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

export function versionAtLeast(ctx, pkg, version) {
  const label = `version_at_least(${pkg}, ${version})`;
  if (!isText(pkg) || !(isText(version) || isNum(version))) return result(label, 'unknown', 'the check needs a package name and a version');
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result(label, 'unknown', trust.reason);
  if (!isObj(ctx.report.deps)) return result(label, 'unknown', 'the report has no dependency list');
  const found = ctx.report.deps[pkg];
  if (found !== undefined && !isText(found)) return result(label, 'unknown', `${pkg} has no valid version in the report`);
  if (!found) return result(label, 'fail', `${pkg} not in the lock file`);
  const have = releaseOf(found);
  const want = releaseOf(version);
  if (!have || !want) return result(label, 'unknown', `${pkg} ${found} or the wanted version ${version} has no release number to compare`);
  return result(label, compareVersions(have, want) >= 0 ? 'pass' : 'fail', `${pkg} ${found}`);
}

export function pathAbsent(ctx, path) {
  const label = `path_absent(${path})`;
  if (!isText(path)) return result(label, 'unknown', 'no path given');
  if (!isTextList(ctx.headPaths) || !ctx.headPaths.length) return result(label, 'unknown', 'head tree not read, or the path list is malformed');
  return ctx.headPaths.includes(path)
    ? result(label, 'fail', `${path} is still on the head commit`)
    : result(label, 'pass', `${path} is not on the head commit`);
}

// Jira gives an empty list for a ticket without sub-tasks or links, and the reader always sets
// both fields. A missing field was not read, so it gives unknown (PR 9 review, item 3).
export function subtasksDone(ctx) {
  const subtasks = ctx.ticket?.subtasks;
  if (!isObjList(subtasks)) return result('subtasks_done', 'unknown', 'the sub-task list was not read, or it is malformed');
  if (subtasks.length === 0) return result('subtasks_done', 'pass', 'no sub-tasks');
  const open = subtasks.filter((s) => s.statusCategory !== 'done');
  return open.length
    ? result('subtasks_done', 'fail', `not done: ${open.map((s) => s.key).join(', ')}`)
    : result('subtasks_done', 'pass', `${subtasks.length} sub-task(s) done`);
}

export function blockedByDone(ctx) {
  const links = ctx.ticket?.links;
  if (!isObjList(links) || !links.every((l) => isText(l.type))) return result('blocked_by_done', 'unknown', 'the link list was not read, or it is malformed');
  const blockers = links.filter((l) => l.type === 'is blocked by');
  const open = blockers.filter((l) => l.statusCategory !== 'done');
  return open.length
    ? result('blocked_by_done', 'fail', `blocked by open ${open.map((l) => l.key).join(', ')}`)
    : result('blocked_by_done', 'pass', `${blockers.length} blocker(s) done`);
}

export function deployed(ctx, tag) {
  const label = `deployed(${tag ?? 'any'})`;
  if (!isObjList(ctx.deployRuns)) return result(label, 'unknown', 'no deploy run yet, or the run list is malformed');
  const tagged = ctx.deployRuns.filter((r) => !tag || r.tag === tag);
  if (!tagged.every((r) => timeOf(r.createdAt) !== null)) return result(label, 'unknown', 'a deploy run has no valid time');
  const runs = tagged
    .filter((r) => !ctx.fixAt || String(r.createdAt) >= String(ctx.fixAt))
    .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
  const latest = runs[0];
  if (!latest) return result(label, 'unknown', 'no deploy run yet');
  if (latest.conclusion !== 'success') {
    return result(label, 'fail', `latest deploy ${latest.tag ?? ''} concluded ${latest.conclusion}`);
  }
  return result(label, 'pass', `deploy ${latest.tag ?? ''} succeeded at ${latest.createdAt}`);
}

// Approvals of removed or changed tests (finding E1, 19 Nov). Only the app's store counts
// (ctx.approvals, read from Forge KVS), and only an entry whose audit event matches it, made by a
// person other than the claimant. The issue property aat.ticket can be written by any issue
// editor, so a name listed there is reported but never counted.
const eventMatches = (e, seq, event, by, data) => {
  if (!isObj(e) || e.seq !== seq || e.event !== event || e.actor !== by || !isObj(e.data)) return false;
  if (Object.entries(data).some(([k, v]) => e.data[k] !== v)) return false;
  const { hash, ...body } = e;
  return sha256(canonical(body)) === hash;
};
const eventOf = (ctx, seq) => (ctx.approvalEvents instanceof Map ? ctx.approvalEvents.get(seq) : undefined);
function auditedApprovals(ctx, kind) {
  const out = { names: new Set(), self: new Set(), unmatched: new Set(), noClaimant: new Set(), error: null };
  const a = ctx.approvals;
  if (a === undefined || a === null) return out;
  const field = kind === 'removal' ? 'removals' : 'changes';
  // One malformed part makes the whole record unreadable.
  if (!isObj(a) || ['removals', 'changes'].some((f) => a[f] !== undefined && !isObjList(a[f]))) return { ...out, error: 'the app\'s approval record is malformed' };
  for (const x of a[field] ?? []) {
    const shaped = isText(x.test) && typeof x.reason === 'string' && x.reason.trim().length >= 5 && isText(x.by) && Number.isInteger(x.auditSeq) && x.auditSeq >= 0;
    // The event holds the name as the person gave it; the checks compare test names, so a full id
    // ("file::Class::test_x") counts for "test_x" (lead review of 23 Nov, finding 8; V17).
    const n = isText(x.test) ? testName(x.test) : x.test;
    if (!shaped || !eventMatches(eventOf(ctx, x.auditSeq), x.auditSeq, APPROVAL_EVENTS[kind], x.by, { key: ctx.ticket?.key, test: x.test, reason: x.reason })) {
      if (isText(x.test)) out.unmatched.add(n);
      continue;
    }
    if (!isText(ctx.claimant)) out.noClaimant.add(n);
    else if (x.by === ctx.claimant) out.self.add(n);
    else out.names.add(n);
  }
  return out;
}
// The rename link for one base test id (owner decision 23 Nov, after set 6 W13): the pinned entry
// of that id names a head id (head_id) that is another test in the same module, which the base did
// not have and which the head report has. That is the only link from an old test to its edited
// successor that the report gives. "The module gained any new id" is not a link. Returns the new
// id, or null when the report links nothing.
function renameSuccessor(report, oldId, baseIds) {
  const p = isObj(report) && isObj(report.pinned) && isObjList(report.pinned.tests) ? report.pinned : null;
  const entry = p?.tests.find((t) => t.id === oldId);
  const to = entry?.head_id;
  if (!isText(to) || to === oldId || to.split('::')[0] !== oldId.split('::')[0]) return null;
  const base = new Set([...(p?.tests ?? []).map((t) => t.id), ...baseIds]);
  if (base.has(to)) return null;
  return isObjList(report.tests) && report.tests.some((t) => t.id === to) ? to : null;
}
const RENAME_UNKNOWN = (n) => `${n} has a change approval, which covers it only for a rename that the report links; the report has no link from the old test to a new one, so a person checks whether it was renamed or deleted`;

// Why a test that needs an approval has none that counts.
function approvalNotes(ctx, names, audited, propertyLists) {
  const notes = [];
  for (const n of names) {
    if (audited.self.has(n)) notes.push(`${n} was approved by the claimant, and another person must approve it`);
    else if (audited.noClaimant.has(n)) notes.push(`${n} has an approval, but the claimant is not known, so it cannot be shown to come from another person`);
    else if (audited.unmatched.has(n)) notes.push(`${n} has an approval with no matching audit event`);
    else if (propertyLists.includes(n)) notes.push(`${n} is listed in the issue property, which does not count; a person other than the claimant approves it in the panel`);
  }
  return notes;
}
const listedNames = (v) => (isList(v) ? v.map((x) => (isObj(x) ? x.test : x)).filter(isText) : []);

export function testsNotRemoved(ctx, report = ctx.report) {
  if (!isObj(ctx.baseReport) || !isObj(report)) return result('tests_not_removed', 'unknown', 'base or head report missing');
  if (!isObjList(report.tests) || !isObjList(ctx.baseReport.tests) || !ctx.baseReport.tests.length) {
    return result('tests_not_removed', 'unknown', 'base or head report has no valid test list');
  }
  // Approvals can only turn a fail into a pass: none stored means none; a malformed record is
  // unknown. Only audited approvals in the app's store count (auditedApprovals).
  if (!isObj(ctx.ticket)) return result('tests_not_removed', 'unknown', 'the ticket is not readable, so its approved test removals are not known');
  const audited = auditedApprovals(ctx, 'removal');
  if (audited.error) return result('tests_not_removed', 'unknown', `the approved test removals are not readable: ${audited.error}`);
  // An audited change approval by another person also covers the old name of a test that the
  // change renames and edits (V17): the person approved that its assertion changes.
  const changes = auditedApprovals(ctx, 'change');
  if (changes.error) return result('tests_not_removed', 'unknown', `the approved test changes are not readable: ${changes.error}`);
  // A report without a repro block is from before the base record existed; any other value
  // that is not an object is malformed.
  if (report.repro !== undefined && !isObj(report.repro)) return result('tests_not_removed', 'unknown', 'the repro block of the report is malformed');
  const head = new Set(report.tests.map((t) => testName(t.id)));
  const approved = new Set(audited.names);
  // A rename with the same body (pinned block) is not a removal (benchmark U10).
  for (const [from, to] of pinnedRenames(report)) if (head.has(to)) approved.add(from);
  // The base side: the main report, and the base test ids of every test module the PR changes,
  // renames or removes (repro block). After a merge the main report is the merge commit's, so the
  // repro ids are what still show a dropped test (benchmark I10).
  const repro = isObj(report.repro) ? report.repro : {};
  const listed = optList(repro.base_test_ids);
  const ids = listed && listed.every(isText) ? listed : [];
  const baseIds = [...ctx.baseReport.tests.map((t) => t.id), ...ids];
  // A change approval covers a missing test only when the report links it to its renamed
  // successor (renameSuccessor). No link: unknown, never a pass.
  const renameUnknown = [];
  const linkBase = [...ids, ...ctx.baseReport.tests.map((t) => t.id)];
  for (const n of changes.names) {
    if (head.has(n) || approved.has(n)) continue;
    const olds = baseIds.filter((id) => testName(id) === n);
    if (olds.length && olds.every((id) => renameSuccessor(report, id, linkBase))) approved.add(n);
    else renameUnknown.push(n);
  }
  const removed = [...new Set(baseIds.map((id) => testName(id)))].filter(
    (n) => !head.has(n) && !approved.has(n),
  );
  if (removed.length && removed.every((n) => renameUnknown.includes(n))) {
    return result('tests_not_removed', 'unknown', removed.map(RENAME_UNKNOWN).join('; '));
  }
  // A listed base test that the head lacks is a fail, even when the record is incomplete.
  if (removed.length) {
    const notes = approvalNotes(ctx, removed, audited, listedNames(ctx.ticket.approvedTestRemovals));
    // Every removed test has an audited approval, and only the claimant is not known: unknown.
    if (removed.every((n) => audited.noClaimant.has(n))) return result('tests_not_removed', 'unknown', notes.join('; '));
    return result('tests_not_removed', 'fail', `removed without approval: ${removed.join(', ')}${notes.length ? `; ${notes.join('; ')}` : ''}`);
  }
  const gap = baseCollectGap(repro, listed);
  if (gap) return result('tests_not_removed', 'unknown', gap);
  return result('tests_not_removed', 'pass', 'no test removed');
}

// Protected regression set (docs/PROTECTED-TESTS.md). The bank CI pins every base test by the
// hash of its body and runs the base copy against the head code; the report's "pinned" block
// holds the result. A change cannot pass by editing, weakening, deselecting or deleting a pinned
// test. A changed pin needs a recorded approval (ticket approvedTestChanges). A report without
// the block is from before the bank step: the check is advisory and does not change the verdict.
const PIN_OUTCOMES = ['passed', 'failed', 'error', 'not_run'];
const isHash = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const pinEntryOk = (t) => isObj(t) && isText(t.id) && isHash(t.base_hash) && PIN_OUTCOMES.includes(t.outcome)
  && ((t.head_id === null && t.head_hash === null) || (isText(t.head_id) && isHash(t.head_hash)));

// Renames that the pinned block shows: base name -> head name, when the body hash is the same.
function pinnedRenames(report) {
  const p = isObj(report) ? report.pinned : undefined;
  if (!isObj(p) || !isObjList(p.tests)) return new Map();
  return new Map(p.tests.filter((t) => pinEntryOk(t) && t.head_id !== null && t.head_id !== t.id && t.head_hash === t.base_hash)
    .map((t) => [testName(t.id), testName(t.head_id)]));
}

export function pinnedTestsHold(ctx, report = ctx.report) {
  const name = 'pinned_tests_hold';
  if (!isObj(report)) return result(name, 'unknown', 'head report missing');
  // Whether the repository runs the pinned step comes from the app's configuration
  // (VERIFY_CONFIG.pinnedRequired), never from the head report: a change cannot drop the block
  // to switch the check off. Not set or false: the step is not deployed, so the check is
  // advisory. Any other value is read as required.
  const setting = ctx.config?.pinnedRequired;
  const required = setting !== undefined && setting !== false;
  if (report.pinned === undefined || (required && report.pinned === null)) {
    if (required) return result(name, 'unknown', 'the repository runs the pinned step, but the CI report has no pinned block');
    return { ...result(name, 'pass', 'not run: the CI report has no pinned block, so no base test copy ran against the head code'), advisory: true };
  }
  const p = report.pinned;
  if (!isObj(p) || p.version !== 1 || !isList(p.tests)) return result(name, 'unknown', 'the pinned block of the report is malformed');
  // modules: the base test modules that the bank step covered (the changed ones). An empty list
  // with no test means the pull request changes no test module.
  if (p.modules !== undefined && !(isList(p.modules) && p.modules.every(isText))) return result(name, 'unknown', 'the module list of the pinned block is malformed');
  if (!p.tests.length) {
    return isList(p.modules) && p.modules.length === 0
      ? result(name, 'pass', 'no test module changed, so every old test runs in the head suite as it is')
      : result(name, 'unknown', 'the pinned block lists no base test, so it cannot show that old tests still hold');
  }
  if (!p.tests.every(pinEntryOk)) return result(name, 'unknown', 'an entry of the pinned block is malformed');
  if (isList(p.modules) && !p.tests.every((t) => p.modules.includes(t.id.split('::')[0]))) {
    return result(name, 'unknown', 'a pinned test is outside the modules that the pinned block lists');
  }
  if (!isObj(ctx.ticket)) return result(name, 'unknown', 'the ticket is not readable, so its approved test changes are not known');
  const rem = auditedApprovals(ctx, 'removal');
  const chg = auditedApprovals(ctx, 'change');
  if (rem.error || chg.error) return result(name, 'unknown', `the approved test removals or changes are not readable: ${rem.error ?? chg.error}`);
  const approvedChange = chg.names;
  const approvedRemoval = rem.names;
  const failing = [];
  const fails = [];
  const changed = [];
  const renameUnknown = [];
  const reproIds = isObj(report.repro) ? optList(report.repro.base_test_ids) : null;
  const pinBase = [...(reproIds && reproIds.every(isText) ? reproIds : []), ...(isObjList(ctx.baseReport?.tests) ? ctx.baseReport.tests.map((t) => t.id) : [])];
  for (const t of p.tests) {
    const n = testName(t.id);
    if (t.head_id === null) {
      // No head copy is linked, so a change approval cannot show a rename: unknown (W13). A
      // removal approval covers a deletion.
      if (approvedRemoval.has(n)) continue;
      if (approvedChange.has(n)) { renameUnknown.push(n); continue; }
      fails.push(`${n} is deleted`); failing.push(['removal', n]);
      continue;
    }
    const edited = t.head_hash !== t.base_hash;
    // A change approval covers the test itself (same id), or a linked rename (renameSuccessor).
    if (approvedChange.has(n) && (t.head_id === t.id || renameSuccessor(report, t.id, pinBase))) continue;
    if (t.outcome !== 'passed') failing.push(['change', n]);
    if (t.outcome === 'not_run') fails.push(`${n}: its base copy did not run on the head code (deselected or skipped)`);
    else if (t.outcome !== 'passed') fails.push(`${n}: its base copy fails on the head code (${t.outcome})${edited ? ', and the change edits this test' : ''}`);
    else if (edited) changed.push(n);
  }
  if (fails.length) {
    const notes = [
      ...approvalNotes(ctx, failing.filter(([k]) => k === 'removal').map(([, n]) => n), rem, listedNames(ctx.ticket.approvedTestRemovals)),
      ...approvalNotes(ctx, failing.filter(([k]) => k === 'change').map(([, n]) => n), chg, listedNames(ctx.ticket.approvedTestChanges)),
    ];
    if (failing.every(([k, n]) => (k === 'removal' ? rem : chg).noClaimant.has(n))) return result(name, 'unknown', notes.join('; '));
    return result(name, 'fail', `pinned base test: ${fails.join('; ')}; a real requirement change needs the approval of the new pin by a person other than the claimant${notes.length ? `; ${notes.join('; ')}` : ''}`);
  }
  if (renameUnknown.length) return result(name, 'unknown', renameUnknown.map(RENAME_UNKNOWN).join('; '));
  // The protection is the base copy: when it still passes on the head code, an edit of the head
  // copy keeps the old assertion in force, so it does not hold the claim (benchmark S02). The
  // reason names the edit, so a person sees it.
  const edits = changed.length ? `; ${changed.join(', ')} ${changed.length === 1 ? 'is' : 'are'} edited, and ${changed.length === 1 ? 'its base copy still passes' : 'their base copies still pass'}` : '';
  return result(name, 'pass', `${p.tests.length} pinned base test(s) hold on the head code${edits}`);
}

// The acceptance criteria must be the ones a person last recorded in the app (finding E1, 19 Nov).
// The issue property can be edited by REST, so the verifier compares its ACs with the hash in the
// app's store, written by a panel action after its audit event. A work item with no record (made
// before 19 Nov or outside the app) cannot show a change: the check is advisory and says so.
export function acsRecorded(ctx) {
  const name = 'acs_recorded';
  const a = ctx.approvals;
  if (a !== undefined && a !== null && !isObj(a)) return result(name, 'unknown', 'the app\'s AC record is malformed');
  const rec = isObj(a) ? a.acs : null;
  if (rec === null || rec === undefined) {
    return { ...result(name, 'pass', 'not checked: the ACs have no audited record (made before 19 Nov or outside the app), so a later change to them cannot be seen'), advisory: true };
  }
  if (!isObj(rec) || !isText(rec.acHash) || !isText(rec.by) || !Number.isInteger(rec.auditSeq) || rec.auditSeq < 0) return result(name, 'unknown', 'the app\'s AC record is malformed');
  if (!isObj(ctx.ticket)) return result(name, 'unknown', 'the ticket is not readable');
  if (!eventMatches(eventOf(ctx, rec.auditSeq), rec.auditSeq, ACS_EVENT, rec.by, { key: ctx.ticket.key, acHash: rec.acHash })) {
    return result(name, 'unknown', `the AC record has no matching audit event (seq ${rec.auditSeq}); a person records the ACs again in the panel`);
  }
  if (acHash(ctx.ticket.acceptanceCriteria ?? []) !== rec.acHash) {
    return result(name, 'unknown', `the ACs changed after the last audited record (audit seq ${rec.auditSeq}); a person records them again in the panel`);
  }
  // The record must come from a person other than the claimant (lead review of PR 28).
  if (!isText(ctx.claimant)) return result(name, 'unknown', 'the claimant is not known, so the AC record cannot be shown to come from another person');
  if (ctx.claimant === rec.by) return result(name, 'unknown', 'the claimant recorded the ACs; another person records them');
  return result(name, 'pass', `the ACs match the audited record (audit seq ${rec.auditSeq}, by ${rec.by})`);
}

// The base collection record (bank scripts/repro.py): pytest --collect-only on base over the
// changed, renamed or removed test modules. rc null and no ids mean there was no such module.
// A report with neither base_test_ids nor base_collect is from before the fields existed and has no
// record to check. LIMIT (README, "Verifier limits"): it keeps that old reading, and the evidence
// record marks it "pre-field report" so a reader sees it. A report with base_test_ids but no
// base_collect is from an older bank version: it cannot show that every module gave its ids, so
// it gives unknown (README, "No check passes by default"). A report with base_collect but no
// base_test_ids is malformed: the bank writes both together (final review, item 6).
const COLLECT_OK = [0, 5]; // pytest: 0 tests collected, 5 no tests collected
function baseCollectGap(repro, listed) {
  if (repro.base_test_ids === undefined && repro.base_collect === undefined) return null;
  if (repro.base_test_ids === undefined) return 'the repro block has a base_collect record but no base_test_ids list';
  if (!listed || !listed.every(isText)) return 'the repro block has a malformed base_test_ids list';
  const bc = repro.base_collect;
  if (bc === undefined) return 'the repro block lists base test ids but has no base_collect record, so a module whose base ids could not be read may hide a dropped test';
  if (!isObj(bc) || !isList(bc.modules_without_ids) || !bc.modules_without_ids.every(isText) || !('rc' in bc)) {
    return 'the base_collect record of the repro block is malformed';
  }
  if (bc.modules_without_ids.length) {
    return `${bc.modules_without_ids.join(', ')}: their base test ids could not be read, so a dropped test may be missed`;
  }
  if (bc.rc === null) {
    return listed.length ? 'base_collect has no exit code, but the repro block lists base test ids' : null;
  }
  if (!COLLECT_OK.includes(bc.rc)) return `the base collection of the changed test modules ended with pytest exit code ${JSON.stringify(bc.rc)}`;
  if (!listed.length) return 'the base collection ran, but the repro block lists no base test ids';
  return null;
}

export function migrationAdditive(ctx, number) {
  const label = `migration_additive(${number})`;
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result(label, 'unknown', trust.reason);
  if (!isObjList(ctx.report.migrations)) return result(label, 'unknown', 'the report has no valid migration list');
  const migration = ctx.report.migrations.find((m) => m.number === number);
  if (!migration) return result(label, 'fail', `migration ${number} not found`);
  if (!isTextList(migration.operations) || !migration.operations.length) return result(label, 'unknown', `migration ${number} has no valid operation list`);
  const bad = migration.operations.filter((op) => /^(DROP|RENAME)/i.test(op));
  return bad.length
    ? result(label, 'fail', `${number} contains ${bad.join(', ')}`)
    : result(label, 'pass', `${number} only adds (${migration.operations.join(', ')})`);
}

export function uniqueMigrations(report) {
  const migrations = isObj(report) ? optList(report.migrations) : null;
  if (!migrations || !migrations.every((m) => isObj(m) && (isText(m.number) || Number.isInteger(m.number)))) {
    return result('unique_migrations', 'unknown', 'the report has no valid migration list');
  }
  const numbers = migrations.map((m) => m.number);
  const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  return dupes.length
    ? result('unique_migrations', 'fail', `duplicate migration numbers: ${[...new Set(dupes)].join(', ')}`)
    : result('unique_migrations', 'pass', `${numbers.length} migration(s), numbers unique`);
}

export function mergedClean(ctx) {
  const report = ctx.mergeReport;
  const trust = reportTrusted(ctx, report, ctx.mergeSha);
  if (trust.status !== 'pass') return result('merged_clean', 'unknown', `merge result: ${trust.reason}`);
  // The reader always sets the list (verify-claim.js); an empty list names no test.
  const required = ctx.mergeRequiredTests;
  if (!isTextList(required)) return result('merged_clean', 'unknown', 'the list of tests required after merge is missing or malformed');
  const parts = [
    ...required.map((n) => testPasses(ctx, n, report)),
    testsNotRemoved(ctx, report),
    uniqueMigrations(report),
  ];
  const failed = parts.filter((p) => p.status === 'fail');
  if (failed.length) return result('merged_clean', 'fail', failed.map((p) => p.reason).join('; '));
  const unknown = parts.filter((p) => p.status === 'unknown');
  if (unknown.length) return result('merged_clean', 'unknown', unknown.map((p) => p.reason).join('; '));
  return result('merged_clean', 'pass', `merge ${String(ctx.mergeSha).slice(0, 7)} clean`);
}

export function repairBalanced(ctx) {
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result('repair_balanced', 'unknown', trust.reason);
  const r = ctx.report.repair;
  if (!r) return result('repair_balanced', 'fail', 'no repair block in the report');
  if (!isObj(r) || ![r.debits_minor, r.credits_minor, r.rows_deleted, r.rows_updated].every(isNum)) {
    return result('repair_balanced', 'unknown', 'the repair block does not have four finite numbers (debits, credits, rows deleted, rows updated)');
  }
  if (r.debits_minor !== r.credits_minor) {
    return result('repair_balanced', 'fail', `debits ${r.debits_minor} != credits ${r.credits_minor}`);
  }
  if (r.rows_deleted || r.rows_updated) {
    return result('repair_balanced', 'fail', `ledger rows changed: ${r.rows_deleted} deleted, ${r.rows_updated} updated`);
  }
  return result('repair_balanced', 'pass', `reversing entries only; ${r.debits_minor} minor units each side`);
}

export function reconProof(ctx) {
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result('recon_proof', 'unknown', trust.reason);
  const r = ctx.report.recon;
  if (!r) return result('recon_proof', 'fail', 'no recon block in the report');
  if (!isObj(r) || ![r.accounts, r.accounts_matching, r.diff_minor].every(isNum)) {
    return result('recon_proof', 'unknown', 'the recon block does not have three finite numbers (accounts, matching, diff)');
  }
  if (r.accounts_matching !== r.accounts || r.diff_minor !== 0) {
    return result('recon_proof', 'fail', `${r.accounts_matching}/${r.accounts} accounts match; diff ${r.diff_minor}`);
  }
  return result('recon_proof', 'pass', `${r.accounts} accounts rebuilt and matching; diff 0`);
}

export function evidenceLinked(ctx) {
  const timeline = optList(ctx.timeline);
  if (!timeline) return result('evidence_linked', 'unknown', 'the timeline is malformed');
  if (timeline.length === 0) return result('evidence_linked', 'fail', 'empty timeline');
  const missing = timeline.filter((e) => !isText(e?.link));
  return missing.length
    ? result('evidence_linked', 'fail', `${missing.length} timeline entr(ies) without evidence`)
    : result('evidence_linked', 'pass', `${timeline.length} entries linked`);
}

export function manual(statement) {
  return result(`manual(${statement})`, 'unknown', `needs a human: ${statement}`);
}

// ---- Definition of done (DESIGN 15a-15c) ----

// Exception types that mean "the test cannot run on base": it proves nothing about the old code.
export const CANNOT_RUN_ON_BASE = ['ImportError', 'ModuleNotFoundError', 'AttributeError', 'NameError'];
export const DEFAULT_COVERAGE = { changedFloor: 0.8, maxDropPoints: 0.5 };
const COVERAGE_FILES = ['.coveragerc', 'setup.cfg', 'pyproject.toml', 'tox.ini'];

// A key that is not text resolves to nothing, so a named test is not found.
const resolveName = (ctx, name) => {
  const key = isText(ctx.ticket?.key) ? ctx.ticket.key : '';
  return String(name).replaceAll('{TOKEN}', key.replace('-', '')).replaceAll('{KEY}', key);
};

// The AC list: none stored gives an empty list; a value that is not a list of objects is
// malformed (null).
const acsOf = (ctx) => (ctx.ticket?.acceptanceCriteria == null ? [] : isObjList(ctx.ticket.acceptanceCriteria) ? ctx.ticket.acceptanceCriteria : null);

// AC types whose evidence comes from CI, the PR head or a deploy. An AC of one of these types is
// code work: "done" needs the PR merged and the code gates (PR 8 review, item 7). A deploy ships
// merged code, so deployed is code work (PR 9 review, item 5). field_equals, link_exists and
// evidence_linked read Jira or the incident timeline, not code.
export const CODE_AC_TYPES = ['test_passes', 'metric_at_least', 'metric_at_most', 'version_at_least', 'migration_additive',
  'repair_balanced', 'recon_proof', 'ci_green', 'path_absent', 'deployed'];

// A ticket has code work when an AC needs CI evidence, or it is a Bug. A spike or a parent ticket
// with only sub-task, link or manual checks has no code gate.
export function hasCodeWork(ctx) {
  const acs = acsOf(ctx);
  // A malformed AC list cannot show that the ticket has no code work.
  if (!acs) return true;
  return ctx.ticket?.type === 'Bug' || acs.some((a) => CODE_AC_TYPES.includes(a.check?.type));
}

// D-repro applies to a Bug and to a ticket with an AC test. A Task has no defect to reproduce,
// and a ticket gated only by metrics, CI or paths has no test to run on base.
export function needsRepro(ctx) {
  if (ctx.ticket?.type === 'Task') return false;
  return ctx.ticket?.type === 'Bug' || (acsOf(ctx) ?? []).some((a) => a.check?.type === 'test_passes');
}

// The tests that must reproduce the problem: every AC test, and for a Bug every test named for
// the key.
export function ticketTests(ctx) {
  const names = (acsOf(ctx) ?? [])
    .filter((a) => a.check?.type === 'test_passes')
    .map((a) => resolveName(ctx, a.check.args?.[0]));
  if (ctx.ticket?.type === 'Bug' && isText(ctx.ticket.key)) {
    const token = new RegExp(`(^|[^A-Za-z0-9])${issueToken(ctx.ticket.key)}_`);
    for (const t of optList(ctx.report?.tests) ?? []) if (isObj(t) && token.test(testName(t.id))) names.push(testName(t.id));
  }
  return [...new Set(names)];
}

// "done" means on main: the PR is merged.
export function onMain(ctx) {
  const pr = ctx.pr;
  if (!pr && ctx.forkPrs?.length) return result('on_main', 'unknown', forkReason(ctx));
  if (!pr) return result('on_main', 'fail', `no pull request for ${ctx.ticket?.key}, so nothing is on main`);
  const gap = candidatesGap(ctx);
  if (gap) return result('on_main', 'unknown', gap);
  // Two open or merged PRs name the key: the same rule as pr_linked (benchmark B26).
  if ((ctx.prCandidates ?? []).length > 1) {
    return result('on_main', 'unknown', `PRs ${ctx.prCandidates.map((n) => `#${n}`).join(', ')} all name ${ctx.ticket.key}; link one PR`);
  }
  if (typeof pr.merged !== 'boolean') return result('on_main', 'unknown', `PR #${pr.number} has no valid merge flag`);
  if (!pr.merged) return result('on_main', 'fail', `PR #${pr.number} is not merged, so the work is not on main`);
  return result('on_main', 'pass', `PR #${pr.number} merged${ctx.mergeSha ? ` as ${String(ctx.mergeSha).slice(0, 7)}` : ''}`);
}

// The repro block is evidence only when it is complete and about this head (bank PR 14 review).
// Changed pytest support or config means the base run mixed base support files with head
// tests, so its result proves nothing either way.
function reproBlockGap(repro, headSha) {
  if (!repro.head_sha) return 'the repro block names no head commit';
  if (repro.head_sha !== headSha) return `the repro block is for ${String(repro.head_sha).slice(0, 7)}, not the report head`;
  if (!isList(repro.changed_support) || !repro.changed_support.every(isText)) return 'the repro block has no list of changed support files, or the list is malformed';
  if (repro.changed_support.length) return `pytest support or config changed: ${repro.changed_support.join(', ')}; the base run cannot show the problem`;
  const run = repro.base_run;
  if (repro.tests.length || run) {
    if (!run) return 'the repro block has no base run record';
    if (run.report !== true) return `the base run wrote no report (pytest exit code ${run.rc ?? 'unknown'})`;
    // pytest exit codes: 0 all passed, 1 some failed. Anything else is an interrupted or bad run.
    if (run.rc !== 0 && run.rc !== 1) return `the base run ended with pytest exit code ${run.rc}`;
  }
  return null;
}

// An AC test that replaces (monkeypatch.setattr, mock.patch, patch.object) a function the PR
// defines in non-test code does not run the new code (benchmark I05). Read from the added lines
// of the test file's patch; per file, not per test function. Returns null when nothing is found.
const REPLACE = /(?:monkeypatch\.setattr|patch\.object|patch)\(\s*(?:[\w.]+\s*,\s*)?["']([\w.]+)["']/g;
export function acTestsRunNewCode(ctx) {
  const patches = ctx.prPatches ?? {};
  const added = (p) => String(p ?? '').split('\n').filter((l) => l.startsWith('+')).join('\n');
  const defined = new Set();
  for (const [file, patch] of Object.entries(patches)) {
    if (/(^|\/)tests?\//.test(file) || /(^|\/)test_[^/]*\.py$/.test(file)) continue;
    for (const m of added(patch).matchAll(/^\+\s*(?:async\s+)?def\s+(\w+)\s*\(/gm)) defined.add(m[1]);
    // A module-level name the PR adds (an assignment at column 0, such as a flag). A test that
    // sets it never runs the value that ships (lead review of 23 Nov, finding 9; V18).
    for (const m of added(patch).matchAll(/^\+([A-Za-z_]\w*)\s*(?::[^=\n]+)?=(?!=)/gm)) defined.add(m[1]);
  }
  if (!defined.size) return null;
  const files = new Set();
  for (const name of ticketTests(ctx)) {
    const row = (optList(ctx.report?.tests) ?? []).find((t) => isObj(t) && testName(t.id) === name);
    if (row) files.add(row.id.split('::')[0]);
  }
  const replaced = [];
  for (const file of files) {
    for (const m of added(patches[file]).matchAll(REPLACE)) {
      const name = m[1].split('.').pop();
      if (defined.has(name)) replaced.push(`${file} replaces ${name}`);
    }
  }
  return replaced.length
    ? result('ac_tests_run_new_code', 'unknown', `${[...new Set(replaced)].join('; ')}, which this PR adds: the AC test does not run the new code, so a person checks`)
    : null;
}

// A security argument that the PR removes from a call in non-test code (lead review of 23 Nov,
// finding 9; V12): a cookie that loses httponly=True, a request that loses verify=True. The list
// is narrow on purpose. Read from the diff: a removed line has the argument and no added line of
// the same file has it. Returns null when nothing is found.
export const SECURITY_ARGS = ['httponly=True', 'secure=True', 'verify=True', 'check_hostname=True'];
export function securityArgsKept(ctx) {
  const patches = isObj(ctx.prPatches) ? ctx.prPatches : {};
  const found = [];
  for (const [file, patch] of Object.entries(patches)) {
    if (typeof patch !== 'string' || isTestFile(file)) continue;
    const lines = patch.split('\n');
    const removed = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).join('\n').replace(/\s+/g, '');
    const added = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n').replace(/\s+/g, '');
    for (const arg of SECURITY_ARGS) if (removed.includes(arg) && !added.includes(arg)) found.push(`${arg} in ${file}`);
  }
  return found.length
    ? result('security_args_kept', 'unknown', `the PR removes ${found.join('; ')}: a person checks that the security setting is meant to go`)
    : null;
}

// Earlier attempts of a re-run on the head (benchmark B05, B29). A failure in a step that runs the
// tests means the result changed with no code change: a flaky test, so a person checks. A failure
// in a setup step (checkout, install) is a runner problem and does not count. Returns null when no
// pinned run was re-run.
const TEST_STEP = /pytest|\btests?\b/i;
export function ciAttempts(ctx) {
  // No configured path means the default pinned workflow (PR 8 review, item 11).
  const paths = ctx.config?.requiredWorkflowPaths === undefined ? DEFAULT_WORKFLOW_PATHS : optList(ctx.config.requiredWorkflowPaths) ?? [];
  const all = optList(ctx.workflowRuns);
  if (!all || !all.every(isObj)) return result('ci_attempts', 'unknown', 'the workflow run list is malformed');
  const pinned = all.filter((r) => paths.includes(runPath(r)) && r.headSha === ctx.pr?.headSha);
  if (pinned.some((r) => r.attempt !== undefined && !(Number.isInteger(r.attempt) && r.attempt >= 1))) {
    return result('ci_attempts', 'unknown', 'a CI run has no valid attempt number');
  }
  const runs = pinned.filter((r) => (r.attempt ?? 1) > 1);
  if (!runs.length) return null;
  if (runs.some((r) => !isObjList(r.earlierFailures))) return result('ci_attempts', 'unknown', 'an earlier attempt of the CI run could not be read');
  const unread = runs.find((r) => Number.isInteger(r.earlierUnread) && r.earlierUnread > 0);
  if (unread) return result('ci_attempts', 'unknown', `${unread.earlierUnread} earlier attempt(s) of the CI run were not read (read limit): a person checks for a flaky test`);
  const gaps = runs.map(earlierAttemptsGap).filter(Boolean);
  if (gaps.length) return result('ci_attempts', 'unknown', gaps.join('; '));
  // An attempt that concluded failure with no failed step recorded failed in a job, not a step:
  // the cause is not known, so a person checks (final review, item 3).
  const silent = runs.flatMap((r) => r.earlierConclusions
    .filter((a) => a.conclusion === 'failure' && !r.earlierFailures.some((f) => f?.attempt === a.attempt))
    .map((a) => `attempt ${a.attempt} of run ${r.id ?? '(no id)'} failed with no failed step recorded: a person checks`));
  if (silent.length) return result('ci_attempts', 'unknown', silent.join('; '));
  const flaky = runs.flatMap((r) => r.earlierFailures ?? []).filter((f) => TEST_STEP.test(f.step));
  return flaky.length
    ? result('ci_attempts', 'unknown', flaky.map((f) => `attempt ${f.attempt} failed in step "${f.step}" and a re-run passed with no code change: a person checks for a flaky test`).join('; '))
    : result('ci_attempts', 'pass', 'earlier attempts failed only in setup steps, or not at all');
}

// The report must be for the current base tip (benchmark I09). GitHub's "branch up to date" rule
// does the same; here the reason names both commits. Returns null when the tip or the report's
// base is not known, or the PR is merged.
export function baseCurrent(ctx) {
  const tip = ctx.baseTip;
  const ran = ctx.report?.base_sha;
  if (!tip || !ran || ctx.pr?.merged) return null;
  return tip === ran
    ? result('base_current', 'pass', `CI ran on the current base ${String(tip).slice(0, 7)}`)
    : result('base_current', 'unknown', `the base moved: CI ran on ${String(ran).slice(0, 7)}, the base is now ${String(tip).slice(0, 7)}; CI must run again on the updated branch`);
}

// Measurement code (config guardedPaths, DESIGN 12 risk 12). A PR that changes it cannot support
// any claim by itself: a test that asserts a metric is a measurement too, not only a metric AC
// (benchmark B19, B20). Returns null when no guarded path changed.
export function measurementUnchanged(ctx) {
  const guarded = ctx.config?.guardedPaths ?? [];
  if (!guarded.length || !ctx.pr) return null;
  if (!Array.isArray(ctx.prFiles)) return null; // the trust checks already report a missing file list
  const touched = ctx.prFiles.filter((f) => guarded.some((g) => guardedMatch(f, g)));
  return touched.length
    ? result('measurement_unchanged', 'unknown', `PR changes ${touched.join(', ')}, which can change how results are measured: a person reviews`)
    : null;
}

// High-stake domains (DESIGN 6a): money rules, security exceptions, data repair, model risk,
// fairness, product behaviour. "done" needs a person's sign-off of the merged commit; code alone
// never supports it (benchmark B27). Returns null when the ticket has no such domain.
const SIGNOFF_DOMAINS = ['money_semantics', 'security_exception', 'data_repair', 'model_risk', 'fairness', 'product_behaviour'];
export function checkHumanSignoff(ctx) {
  // The domain comes from the stored ticket spec or from a Jira label (benchmark set 2, S16).
  // Labels are free text, so both match in any letter case (review finding 15).
  const asDomain = (v) => (typeof v === 'string' && SIGNOFF_DOMAINS.includes(v.toLowerCase()) ? v.toLowerCase() : null);
  const labels = Array.isArray(ctx.ticket?.labels) ? ctx.ticket.labels : [];
  const domain = asDomain(ctx.ticket?.domain) ?? labels.map(asDomain).find(Boolean);
  if (!domain) return null;
  const s = ctx.ticket.signoff;
  const sha = ctx.pr?.mergeSha ?? ctx.pr?.headSha ?? null;
  if (!isText(s?.by)) return result('human_signoff', 'unknown', `${domain}: a person's sign-off of the merged change is required, and none is recorded`);
  if (!sha || s.sha !== sha) return result('human_signoff', 'unknown', `${domain}: the sign-off is for ${String(s.sha ?? 'no commit').slice(0, 7)}, not the merged commit ${String(sha ?? 'unknown').slice(0, 7)}`);
  // Any issue editor can write the aat.signoff property by REST. Only the sign-off button also
  // writes an audit event, so the property must match one (PR 8 review, item 10).
  if (!signoffAudited(ctx, s)) {
    return result('human_signoff', 'unknown', `${domain}: the sign-off has no matching audit event from the sign-off button, so it may not come from the app; sign off again in the panel`);
  }
  if (!isText(ctx.claimant)) return result('human_signoff', 'unknown', `${domain}: the claimant is not known, so the sign-off cannot be shown to come from another person`);
  if (ctx.claimant === s.by) return result('human_signoff', 'unknown', `${domain}: the claimant signed off their own claim; another person must sign off`);
  return result('human_signoff', 'pass', `${domain}: signed off by ${s.by} at ${s.at} (audit seq ${s.auditSeq})`);
}

function signoffAudited(ctx, s) {
  const e = ctx.signoffEvent;
  if (!Number.isInteger(s.auditSeq) || !e || typeof e !== 'object') return false;
  const { hash, ...body } = e;
  return e.seq === s.auditSeq && e.event === 'change.signed_off' && e.actor === s.by
    && e.data?.key === ctx.ticket?.key && e.data?.sha === s.sha && sha256(canonical(body)) === hash;
}

// A Story's AC test that cannot import on base because the PR adds the module (benchmark B22):
// the module file is added in the diff, the test file imports it (added lines), and the test
// passes on head. That is new behaviour, not a failed reproduction. A Bug keeps the old rule.
const IMPORT_ERRORS = ['ModuleNotFoundError', 'ImportError'];
function newModuleStory(ctx, row) {
  if (ctx.ticket?.type !== 'Story' || row.head?.outcome !== 'passed') return false;
  if (row.base?.outcome !== 'error' || (row.base.exc_type && !IMPORT_ERRORS.includes(row.base.exc_type))) return false;
  const modules = (ctx.prAddedFiles ?? [])
    .filter((f) => f.endsWith('.py') && !/(^|\/)tests?\//.test(f) && !/(^|\/)test_[^/]*\.py$/.test(f))
    .map((f) => f.replace(/^src\//, '').replace(/\.py$/, '').replace(/\/__init__$/, '').replaceAll('/', '.'));
  if (!modules.length) return false;
  const file = row.id.split('::')[0];
  const lines = String(ctx.prPatches?.[file] ?? '').split('\n').filter((l) => l.startsWith('+'));
  return modules.some((m) => lines.some((l) => new RegExp(`^\\+\\s*(from\\s+${m.replaceAll('.', '\\.')}\\s+import|import\\s+${m.replaceAll('.', '\\.')}\\b)`).test(l)));
}

// A Story's AC test that fails on base with AttributeError because the PR adds the function to an
// existing module (benchmark set 2, S03). All of these must hold (review finding 12):
// - a changed source module adds a module-level `def <name>(` (no indent, so not a method);
// - an added line of the test file calls `<module>.<name>(`, where <module> is that module's
//   import name (bank.ledger) or its last part (ledger). Comments and string literals are
//   removed first, so a call written in a comment or a string does not count;
// - the base exception text (exc_message) is the first line the bank writes (exconly()), whole and
//   from its start: "AttributeError: module 'bank.ledger' has no attribute '<name>'", optionally
//   followed by Python 3.12's ". Did you mean: '<other>'?". A longer text that only contains it
//   ("partially initialized module ...") does not count (final review, item 5);
// - the test passes on head. A Bug keeps the old rule.
// LIMIT: only the added lines are read. A string opened on an unchanged line is not seen.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The code of added Python lines: triple-quoted strings (also over lines), quoted strings and
// comments removed. A line that ends in an odd number of backslashes continues on the next line
// (inside a string or not), so the two are joined first (final review, item 5). A comment that
// ends in a backslash then also hides the next line: a call there is not counted, which gives
// unknown, never a wrong pass.
function pythonCode(lines) {
  return lines.map((l) => l.slice(1)).join('\n')
    .replace(/((?:^|[^\\])(?:\\\\)*)\\\n/g, '$1')
    .replace(/("""|''')[\s\S]*?(?:\1|$)/g, '""')
    .split('\n')
    .map((l) => l.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""').replace(/#.*$/, ''));
}
function newFunctionStory(ctx, row) {
  if (ctx.ticket?.type !== 'Story' || row.head?.outcome !== 'passed' || row.base?.exc_type !== 'AttributeError') return false;
  const message = row.base.exc_message;
  if (typeof message !== 'string' || !message) return false;
  const added = (file) => String(ctx.prPatches?.[file] ?? '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  const sources = Object.keys(ctx.prPatches ?? {}).filter((f) => f.endsWith('.py') && !/(^|\/)tests?\//.test(f) && !/(^|\/)test_[^/]*\.py$/.test(f));
  const testLines = pythonCode(added(row.id.split('::')[0]));
  return sources.some((f) => {
    const module = f.replace(/^src\//, '').replace(/\.py$/, '').replace(/\/__init__$/, '').replaceAll('/', '.');
    const prefixes = [...new Set([module, module.split('.').pop()])].map(escapeRe).join('|');
    return added(f).some((l) => {
      const name = /^\+def\s+([A-Za-z_]\w*)\s*\(/.exec(l)?.[1];
      const exact = new RegExp(`^AttributeError: module '${escapeRe(module)}' has no attribute '${name}'(?:\\. Did you mean: '\\w+'\\?)?$`);
      if (!name || !exact.test(message)) return false;
      const call = new RegExp(`(?<![\\w.])(?:${prefixes})\\.${name}\\s*\\(`);
      return testLines.some((t) => call.test(t));
    });
  });
}

// D-repro: each ticket test fails on base by an assertion and passes on head; the full head suite
// passes; no test is removed.
export function reproduced(ctx) {
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result('reproduced', 'unknown', trust.reason);
  if (!acsOf(ctx)) return result('reproduced', 'unknown', 'the acceptance criteria are not a list');
  if (!isText(ctx.ticket?.key)) return result('reproduced', 'unknown', 'the ticket has no key');
  const repro = ctx.report.repro;
  if (!isObj(repro) || !isObjList(repro.tests)) return result('reproduced', 'unknown', 'no repro block in the CI report (base run missing), or it is malformed');
  const gap = reproBlockGap(repro, ctx.report.head_sha);
  if (gap) return result('reproduced', 'unknown', gap);
  const fails = [];
  const unknowns = [];
  const suite = repro.full_suite;
  if (!suite) unknowns.push('no full-suite result in the repro block');
  else if (suite.outcome !== 'passed') fails.push(`full suite on head failed (${suite.failed ?? '?'} failed)`);
  const removed = testsNotRemoved(ctx);
  if (removed.status === 'fail') fails.push(removed.reason);
  else if (removed.status === 'unknown') unknowns.push(removed.reason);
  // AC tests must each reproduce. For a Bug, the other tests named for the key are guards of
  // behaviour that must not change: they must pass on head and may pass on base (benchmark B21,
  // B25, B26, B29). With no AC test, at least one key-named test must reproduce.
  const all = ticketTests(ctx);
  const acNames = new Set(acsOf(ctx).filter((a) => a.check?.type === 'test_passes').map((a) => resolveName(ctx, a.check.args?.[0])));
  const guards = all.filter((n) => !acNames.has(n));
  const rowOf = (name) => repro.tests.find((t) => testName(t.id) === name);
  const reproduces = (name) => rowOf(name)?.base?.outcome === 'failed' && rowOf(name)?.base?.exc_type === 'AssertionError' && rowOf(name)?.head?.outcome === 'passed';
  let names = all;
  if (acNames.size || guards.some(reproduces)) {
    names = acNames.size ? [...acNames] : guards.filter(reproduces);
    for (const g of guards.filter((n) => !names.includes(n))) {
      const row = rowOf(g);
      if (row && isText(row.head?.outcome) && didNotRun(row.head.outcome)) unknowns.push(`${g} is ${NOT_RUN_REASON(row.head.outcome).replace(':', ' on head:')}`);
      else if (row && row.head?.outcome !== 'passed') fails.push(`${g} fails on head (${row.head?.outcome ?? 'no result'})`);
    }
  }
  if (names.length === 0) fails.push(`no test for ${ctx.ticket?.key}: nothing reproduces the problem`);
  for (const name of names) {
    const row = rowOf(name);
    if (!row) {
      unknowns.push(`${name} is not in the repro block`);
      continue;
    }
    const base = row.base ?? {};
    // A test that did not run on head or on base shows nothing: unknown with its state (W22).
    if (isText(row.head?.outcome) && didNotRun(row.head.outcome)) {
      unknowns.push(`${name} is ${NOT_RUN_REASON(row.head.outcome).replace(':', ' on head:')}`);
      continue;
    }
    if (row.head?.outcome !== 'passed') fails.push(`${name} fails on head (${row.head?.outcome ?? 'no result'})`);
    if (isText(base.outcome) && didNotRun(base.outcome)) {
      unknowns.push(`${name} is ${NOT_RUN_REASON(base.outcome).replace(':', ' on base:')}`);
      continue;
    }
    if (base.outcome === 'passed') fails.push(`${name} passes on base, so it does not reproduce the problem`);
    else if (newModuleStory(ctx, row) || newFunctionStory(ctx, row)) continue;
    else if (base.outcome === 'error' || CANNOT_RUN_ON_BASE.includes(base.exc_type)) {
      unknowns.push(`${name} cannot run on base (${base.exc_type ?? base.outcome}); a human decides`);
    } else if (base.outcome !== 'failed') unknowns.push(`${name} has no base result`);
    else if (base.exc_type !== 'AssertionError') unknowns.push(`${name} fails on base by ${base.exc_type ?? 'an unknown error'}, not by an assertion`);
  }
  if (fails.length) return result('reproduced', 'fail', fails.join('; '));
  if (unknowns.length) return result('reproduced', 'unknown', unknowns.join('; '));
  return result('reproduced', 'pass', `${names.length} test(s) fail on base by an assertion and pass on head; full suite passed`);
}

// Non-test Python files whose patch adds or removes a line that is not blank and not a comment.
const isTestFile = (f) => /(^|\/)tests?\//.test(f) || /(^|\/)test_[^/]*\.py$/.test(f) || /(^|\/)conftest\.py$/.test(f);
function changedSourceFiles(ctx) {
  return (ctx.prFiles ?? []).filter((f) => f.endsWith('.py') && !isTestFile(f)).filter((f) => {
    const patch = ctx.prPatches?.[f];
    if (typeof patch !== 'string') return true; // patch not read: assume code changed
    return patch.split('\n').some((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l) && !/^[+-]\s*(#.*)?$/.test(l));
  });
}

// D-cov: changed executable lines covered at or above the floor, and total coverage not below
// base minus the allowed drop. A PR that changes the coverage settings or adds an exclusion
// gives unknown.
export function coverageOk(ctx) {
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result('coverage', 'unknown', trust.reason);
  const cov = ctx.report.coverage;
  if (!isObj(cov)) return result('coverage', 'unknown', 'no coverage block in the CI report');
  if (!Array.isArray(ctx.prFiles)) return result('coverage', 'unknown', 'pull request file list not available');
  const settings = ctx.prFiles.filter((f) => COVERAGE_FILES.includes(f.split('/').pop()));
  if (settings.length) return result('coverage', 'unknown', `PR changes coverage settings (${settings.join(', ')})`);
  if (!isObj(ctx.prPatches)) return result('coverage', 'unknown', 'pull request patches not read');
  // Every changed Python source file needs its patch. GitHub leaves out the patch of a very large
  // file: an added pragma there cannot be seen. Test files are not measured.
  for (const file of ctx.prFiles.filter((f) => String(f).endsWith('.py') && !isTestFile(String(f)))) {
    const patch = ctx.prPatches[file];
    if (!isText(patch)) return result('coverage', 'unknown', `the diff of ${file} is not available, so an added coverage exclusion cannot be seen`);
    if (patch.split('\n').some((l) => l.startsWith('+') && !l.startsWith('+++') && /pragma:\s*no\s*cover/i.test(l))) {
      return result('coverage', 'unknown', `${file} adds pragma: no cover`);
    }
  }
  const conf = { ...DEFAULT_COVERAGE, ...(ctx.config?.coverage ?? {}) };
  if (finiteNumber(conf.changedFloor) === null || finiteNumber(conf.maxDropPoints) === null) {
    return result('coverage', 'unknown', 'the coverage floor or the allowed drop in the config is not a finite number');
  }
  const exec = cov.changed_executable;
  const covered = cov.changed_covered;
  // Counts of lines: whole numbers, at least 0, and no more covered lines than executable ones.
  const isCount = (v) => Number.isInteger(v) && v >= 0;
  if (!isCount(exec) || !isCount(covered) || covered > exec) {
    return result('coverage', 'unknown', 'changed-line counts missing or malformed (whole numbers from 0, covered not above executable)');
  }
  // Zero changed executable lines while a source file gains or loses code means the coverage
  // tool did not see the change (PR 8 review, item 9).
  if (exec === 0) {
    const code = changedSourceFiles(ctx);
    if (code.length) return result('coverage', 'unknown', `no changed executable lines reported, but ${code.join(', ')} changed code`);
  }
  const floorPct = Math.round(conf.changedFloor * 100);
  // Under the floor is unknown, not fail (lead review of 23 Nov, finding 9; V07): a changed line
  // that no test reaches is a reason for a person to look, not proof that the claim is false.
  if (exec > 0 && covered / exec < conf.changedFloor) {
    return result('coverage', 'unknown', `${covered} of ${exec} changed lines covered (${Math.round((covered / exec) * 100)}%), under the floor of ${floorPct}%: a person checks the lines that no test reaches`);
  }
  // Checked after the changed-line floor.
  // A changed source file that the coverage data does not have looks fully covered in the counts
  // (benchmark set 2, S18). The coverage script names such files. A report without the list, or
  // with a list that is not an array, cannot show that every changed file was measured (review
  // finding 14). Reports from before the field existed therefore give unknown here.
  const unmeasured = cov.unmeasured_files;
  if (!isTextList(unmeasured)) return result('coverage', 'unknown', 'the coverage block has no unmeasured_files list, so a changed file may be missing from the coverage data');
  if (unmeasured.length) return result('coverage', 'unknown', `${unmeasured.join(', ')} changed but not in the coverage data`);
  // Changed lines that the coverage settings exclude (pragma: no cover, omit) are not in the
  // counts. The coverage script reports them as changed_excluded; reports from before the field
  // existed give unknown.
  const excluded = cov.changed_excluded;
  if (!Number.isInteger(excluded) || excluded < 0) return result('coverage', 'unknown', 'the coverage block has no valid changed_excluded count, so changed lines may be excluded from coverage');
  if (excluded > 0) return result('coverage', 'unknown', `${excluded} changed lines excluded from coverage; a person checks`);
  // Totals are percentages: finite numbers in [0, 100].
  const isPct = (v) => isNum(v) && v >= 0 && v <= 100;
  if (!isPct(cov.head_total) || !isPct(cov.base_total)) {
    return result('coverage', 'unknown', 'head or base total coverage missing, or not a percentage from 0 to 100');
  }
  if (cov.head_total < cov.base_total - conf.maxDropPoints) {
    return result('coverage', 'fail', `total coverage ${cov.head_total}% is below base ${cov.base_total}% minus ${conf.maxDropPoints}`);
  }
  const changed = exec > 0 ? `${covered} of ${exec} changed lines covered` : 'no changed executable lines';
  return result('coverage', 'pass', `${changed}; total ${cov.head_total}% (base ${cov.base_total}%)`);
}

// ---- Small security check (DESIGN 14g, owner decision 16 Nov) ----
// The code-scanning result check run on the PR head must be success. It is identified by the
// GitHub app (id and slug) and the check name, never by display text alone: a workflow job named
// "CodeQL" from another app does not count. Shapes read from real check runs on 16 Nov: name
// "CodeQL", app github-advanced-security (id 57789); success has the title "No new alerts in code
// changed by this pull request"; neutral means scanning "cannot determine the alerts introduced".
const SCAN_WORKFLOW = 'dynamic/github-code-scanning/codeql';
export function codeScanning(ctx) {
  const label = 'code_scanning';
  const conf = ctx.config?.securityCheck ?? {};
  const head = ctx.pr?.headSha;
  if (!head) return result(label, 'unknown', 'no head commit');
  const change = pipelineChange(ctx);
  if (change) return result(label, 'unknown', change);
  if (!isObjList(ctx.securityRuns)) return result(label, 'unknown', 'check runs of the head not read, or the list is malformed');
  if (!complete(ctx, 'checks')) return result(label, 'unknown', `check run list for ${head.slice(0, 7)} is not complete (page limit) or has no page flag`);
  const runs = ctx.securityRuns.filter((r) => r.headSha === head && r.name === conf.checkName
    && r.appSlug === conf.appSlug && (conf.appId === undefined || r.appId === conf.appId));
  const scanning = (isList(ctx.workflowRuns) ? ctx.workflowRuns : []).some((r) => isObj(r) && runPath(r) === SCAN_WORKFLOW && r.headSha === head && r.status !== 'completed');
  if (runs.length === 0) {
    return result(label, 'unknown', scanning ? 'code scanning is still running on the head'
      : 'no code-scanning result on the head (scanning off, or not run for this commit)');
  }
  if (runs.some((r) => r.status !== 'completed')) return result(label, 'unknown', 'code scanning is still running on the head');
  const failed = runs.find((r) => r.conclusion === 'failure');
  if (failed) return result(label, 'fail', `${conf.checkName} failed: ${failed.title ?? 'no title'}`);
  const other = runs.find((r) => r.conclusion !== 'success');
  if (other) return result(label, 'unknown', `${conf.checkName} ${other.conclusion}: ${other.title ?? 'no title'}`);
  return result(label, 'pass', `${conf.checkName}: ${runs[0].title ?? 'success'}`);
}

// The check as the claim types run it. mode "off": not run. mode "observe": run and shown, but
// advisory (not counted), until the repository is confirmed to produce the check. mode "enforce":
// counted for done, and for fixed and ready when onFixedReady is true. No securityCheck config
// means no check. A config or mode that is not one of these gives unknown, counted: a typo must
// not turn the check into advice (PR 9 review, item 3).
const SECURITY_MODES = ['off', 'observe', 'enforce'];
export function securityCheck(ctx, claimType) {
  const conf = ctx.config?.securityCheck;
  if (conf === undefined) return [];
  if (!isObj(conf) || !SECURITY_MODES.includes(conf.mode)) {
    return [result('code_scanning', 'unknown', `the security check mode ${JSON.stringify(conf?.mode)} is not off, observe or enforce`)];
  }
  if (conf.mode === 'off') return [];
  if (claimType !== 'done' && conf.onFixedReady === false) return [];
  const r = codeScanning(ctx);
  return conf.mode === 'enforce' ? [r] : [{ ...r, advisory: true, reason: `advisory, not counted: ${r.reason}` }];
}

// The bank's import guard (scripts/import_guard.py) writes an `imports` block in the CI report:
// the imports that the PR adds, the unknown ones, the files that do not parse, and whether
// uv.lock or pyproject.toml changed. The app reads it as advice: this check is always advisory,
// so it never changes a verdict. A report without the block gives no check.
const IMPORT_RESULTS = ['pass', 'unknown_import', 'not_checked'];
export function importsAdvice(ctx) {
  const report = ctx?.report;
  if (!isObj(report) || !Object.hasOwn(report, 'imports')) return null;
  const b = report.imports;
  const say = (status, text) => ({ ...result('imports_known', status, `advice, not counted: ${text}`), advisory: true });
  // Only a missing list reads as empty; null or any other value is malformed.
  const list = (v) => (v === undefined ? [] : v);
  const added = list(b?.added);
  const lists = isObj(b) && [list(b.unknown), list(b.unparsed)].every((l) => Array.isArray(l) && l.every((x) => typeof x === 'string'));
  if (!isObj(b) || !IMPORT_RESULTS.includes(b.result) || !lists || !Array.isArray(added) || !added.every(isObj)) {
    return say('unknown', 'the imports block is malformed, so the added imports are not known');
  }
  const lock = b.lock_changed === true ? '; uv.lock or pyproject.toml changed, so a newly locked package counts as known' : '';
  if (b.result === 'pass') return say('pass', `no unknown import added (${added.length} added import${added.length === 1 ? '' : 's'})${lock}`);
  if (b.result === 'unknown_import') {
    const where = (m) => added.filter((a) => a.kind === 'unknown' && (a.module ?? '(dynamic)') === m).map((a) => `${a.file}:${a.line}`).slice(0, 3);
    const names = list(b.unknown).slice(0, 10).map((m) => { const w = where(m); return w.length ? `${m} (${w.join(', ')})` : m; });
    return say('unknown', `unknown import added: ${names.join(', ')}${lock}`);
  }
  const unparsed = list(b.unparsed);
  const why = unparsed.length ? `${unparsed.slice(0, 5).join(', ')} does not parse` : (typeof b.reason === 'string' && b.reason ? b.reason : 'no reason given');
  return say('unknown', `not checked: ${why}${lock}`);
}

