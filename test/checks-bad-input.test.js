// General rule (README, "No check passes by default"): every check gives unknown on a missing,
// empty, non-finite or malformed input. Each row starts from a context where the check passes,
// replaces one input it reads (also an element inside a list) with each bad value, and asserts
// that the check does not pass and does not throw. A check that returns null (rule not
// applicable) or a reason string is also covered. The app's own config constant is read only
// where a bad value could turn a check into a pass (required workflows, security check).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as c from '../src/verifier/checks.js';
import { acHash } from '../src/approvals.js';
import { reportHash } from '../src/verifier/report.js';
import { nextEvent } from '../src/audit.js';
import { CLAIM_CHECKS, verify } from '../src/verifier/verdict.js';

// missing: the key is deleted. null_element: a list whose only element is null (also a wrong
// type where the input is not a list).
const BAD = { missing: undefined, null: null, empty_string: '', empty_array: [], null_element: [null], NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY,
  minus_Infinity: Number.NEGATIVE_INFINITY };
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const MERGE = 'c'.repeat(40);
const CI = '.github/workflows/ci.yml';

// The app's AC record for this AC list (made by a person, 'pat'), with its audit event.
function acRecordFor(acs) {
  const h = acHash(acs);
  return {
    approvals: { removals: [], changes: [], acs: { acHash: h, by: 'pat', at: '2026-11-16T11:00:00Z', auditSeq: 9 } },
    approvalEvents: new Map([[9, nextEvent({ seq: 8, hash: 'e'.repeat(64) }, { actor: 'pat', event: 'acs.recorded', data: { key: 'X-1', acHash: h }, at: '2026-11-16T11:00:00Z' })]]),
  };
}

function good() {
  const report = {
    schema: 'aat-ci-report/2',
    head_sha: HEAD,
    base_sha: BASE,
    workflow_files: { [CI]: 'h1' },
    tests: [
      { id: 'tests/test_x.py::test_X1_fix', outcome: 'passed' },
      { id: 'tests/test_x.py::test_other', outcome: 'passed' },
    ],
    // Protected regression set: one pinned base test, unchanged, its base copy passes on head.
    pinned: { version: 1, base_sha: BASE, tests: [{ id: 'tests/test_x.py::test_other', base_hash: 'e'.repeat(64),
      head_id: 'tests/test_x.py::test_other', head_hash: 'e'.repeat(64), outcome: 'passed' }] },
    metrics: { latency_ms: 10 },
    deps: { requests: '2.32.0' },
    migrations: [{ number: '0007', operations: ['ADD COLUMN note'] }],
    repair: { debits_minor: 100, credits_minor: 100, rows_deleted: 0, rows_updated: 0 },
    recon: { accounts: 3, accounts_matching: 3, diff_minor: 0 },
    repro: {
      head_sha: HEAD,
      base_sha: BASE,
      changed_support: [],
      removed_test_files: [],
      // Base test ids of the changed test modules, and the base collection run that read them.
      base_test_ids: ['tests/test_x.py::test_X1_fix', 'tests/test_x.py::test_other'],
      base_collect: { rc: 0, modules_without_ids: [] },
      base_run: { report: true, rc: 1 },
      tests: [{ id: 'tests/test_x.py::test_X1_fix', base: { outcome: 'failed', exc_type: 'AssertionError' }, head: { outcome: 'passed' } }],
      full_suite: { outcome: 'passed' },
    },
    coverage: { changed_executable: 10, changed_covered: 9, changed_excluded: 0, head_total: 90, base_total: 90, unmeasured_files: [] },
  };
  return {
    ticket: {
      key: 'X-1',
      type: 'Bug',
      domain: 'money_semantics',
      signoff: { by: 'pat', at: '2026-11-16T12:00:00Z', sha: MERGE, auditSeq: 7 },
      subtasks: [{ key: 'X-2', statusCategory: 'done' }],
      links: [{ type: 'is blocked by', key: 'X-3', statusCategory: 'done' }],
      acceptanceCriteria: [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_X1_fix'] } }],
    },
    pr: { number: 5, title: 'X-1 fix rounding', branch: 'fix/x-1', state: 'closed', merged: true, headSha: HEAD, mergeSha: MERGE },
    prCandidates: [5],
    // The sign-off button's audit event (PR 8 review, item 10) and a claimant who is not the signer.
    claimant: 'dev',
    // The app's approval store (finding E1, 19 Nov): no approval, and the ACs as last recorded by
    // a person, with the matching audit event.
    ...acRecordFor([{ acId: 'AC1', check: { type: 'test_passes', args: ['test_X1_fix'] } }]),
    signoffEvent: nextEvent({ seq: 6, hash: 'f'.repeat(64) }, { actor: 'pat', event: 'change.signed_off', data: { key: 'X-1', sha: MERGE }, at: '2026-11-16T12:00:00Z' }),
    report,
    reportAuthor: 'github-actions[bot]',
    reportComment: { updatedAt: '2026-11-16T10:03:00Z' },
    baseWorkflowFiles: { [CI]: 'h1' },
    workflowRuns: [{
      id: 1, path: CI, headSha: HEAD, status: 'completed', conclusion: 'success', attempt: 2, earlierFailures: [], earlierConclusions: [{ attempt: 1, conclusion: 'success' }],
      createdAt: '2026-11-16T10:00:00Z', runStartedAt: '2026-11-16T10:00:00Z', updatedAt: '2026-11-16T10:02:30Z',
    }],
    prFiles: ['src/x.py', 'tests/test_x.py'],
    prPatches: { 'src/x.py': '+x = 1', 'tests/test_x.py': '+def test_X1_fix():\n+    assert True' },
    headPaths: ['src/x.py'],
    deployRuns: [{ tag: 'v1', conclusion: 'success', createdAt: '2026-11-16T11:00:00Z' }],
    baseReport: { tests: [{ id: 'tests/test_x.py::test_other', outcome: 'passed' }] },
    mergeReport: { ...structuredClone(report), head_sha: MERGE },
    mergeSha: MERGE,
    mergeRequiredTests: ['test_X1_fix'],
    timeline: [{ link: 'https://example.test/1' }],
    baseTip: BASE,
    securityRuns: [{ headSha: HEAD, name: 'CodeQL', appSlug: 'github-advanced-security', appId: 57789, status: 'completed', conclusion: 'success', title: 'No new alerts' }],
    // The reader always sets every flag; false means the list is complete.
    truncated: { pulls: false, comments: false, runs: false, files: false, checks: false },
    config: {
      requiredWorkflowPaths: [CI],
      securityCheck: { mode: 'enforce', checkName: 'CodeQL', appSlug: 'github-advanced-security', appId: 57789 },
    },
  };
}

// Path segments: "report.coverage.head_total", "workflowRuns.0.earlierFailures". A key with a
// dot goes in brackets: "prPatches.[tests/test_x.py]". undefined deletes the key; in a list it
// becomes an undefined element (JSON has no holes).
function setPath(obj, path, value) {
  const keys = path.match(/\[[^\]]*\]|[^.]+/g).map((k) => k.replace(/^\[|\]$/g, ''));
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  if (value === undefined && !Array.isArray(o)) delete o[keys.at(-1)];
  else o[keys.at(-1)] = value;
}

// Each row: the call, the key inputs (context paths, or "arg:<n>" for an argument), and options.
// `expect` is the result on the good context when it is not pass. `allow` lists the bad values
// that are a valid reading of that input, so a pass is right (README, "No check passes by
// default", exceptions). Each one says why.
const ARGS = {
  testPasses: ['test_X1_fix'],
  metricCompare: ['latency_ms', 20, 'max'],
  versionAtLeast: ['requests', '2.0.0'],
  pathAbsent: ['old/legacy.py'],
  deployed: ['v1'],
  migrationAdditive: ['0007'],
  manual: ['a person checks the screen'],
  securityCheck: ['done'],
  metricIntegrity: ['latency_ms'],
};
// The inputs of reportTrusted, read by every check that needs a trusted report.
const TRUST = ['report', 'report.head_sha', 'report.workflow_files', 'reportAuthor', 'pr', 'pr.headSha', 'baseWorkflowFiles', 'truncated', 'truncated.comments',
  'reportComment', 'reportComment.updatedAt', 'prFiles', 'prFiles.0', 'workflowRuns', 'workflowRuns.0', 'workflowRuns.0.path', 'workflowRuns.0.headSha',
  'workflowRuns.0.createdAt', 'workflowRuns.0.runStartedAt', 'workflowRuns.0.updatedAt'];
// A run's start and end times fall back to its creation time (GitHub leaves run_started_at out
// of old runs). The fallback keeps the edit inside the window here.
const TRUST_ALLOW = { 'workflowRuns.0.runStartedAt': ['missing', 'null'], 'workflowRuns.0.updatedAt': ['missing', 'null'],
  'workflowRuns.0.createdAt': Object.keys(BAD) };
const RUN = ['workflowRuns', 'workflowRuns.0', 'workflowRuns.0.path', 'workflowRuns.0.headSha', 'workflowRuns.0.status', 'workflowRuns.0.conclusion',
  'workflowRuns.0.attempt', 'workflowRuns.0.earlierConclusions', 'workflowRuns.0.earlierConclusions.0', 'workflowRuns.0.earlierConclusions.0.attempt',
  'workflowRuns.0.earlierConclusions.0.conclusion', 'workflowRuns.0.earlierUnread', 'workflowRuns.0.createdAt'];
// GitHub gives run_attempt 1 for a run that was never re-run, and old runs leave it out: a
// missing attempt is attempt 1. A missing earlierUnread count is 0. A run's time is read only
// when a run without a result is on the head.
const RUN_ALLOW = { 'workflowRuns.0.attempt': ['missing'], 'workflowRuns.0.earlierUnread': ['missing'],
  'workflowRuns.0.createdAt': Object.keys(BAD) };
const merge = (...a) => Object.assign({}, ...a);
const ROWS = [
  ['pipelineChange', ['prFiles', 'prFiles.0']],
  ['reportTrusted', TRUST, { allow: TRUST_ALLOW }],
  // The title alone is not key: the branch name also names the key. The fork list and the pull
  // request page flag are read only when no PR is linked. The PR number is used only in reasons.
  ['prLinked', ['pr', 'pr.number', 'pr.state', 'pr.merged', 'prCandidates', 'prCandidates.0', 'ticket', 'ticket.key'],
    { allow: { 'pr.number': Object.keys(BAD) } }],
  ['ciGreen', ['pr', 'pr.headSha', ...RUN, 'prFiles', 'prFiles.0', 'truncated', 'truncated.runs', 'config.requiredWorkflowPaths'],
    // No configured list means the default pinned workflow, which the good run is.
    { allow: merge(RUN_ALLOW, { 'config.requiredWorkflowPaths': ['missing'] }) }],
  ['testPasses', ['arg:0', ...TRUST, 'report.tests', 'report.tests.0', 'report.tests.0.id', 'report.tests.0.outcome'], { allow: TRUST_ALLOW }],
  ['bugTestExists', [...TRUST, 'report.tests', 'report.tests.0', 'report.tests.0.id', 'report.tests.0.outcome', 'ticket', 'ticket.key'], { allow: TRUST_ALLOW }],
  // For a metric the test list is a guard (no failed test), not the evidence: an empty list has
  // no failed test. A missing list is a report without tests.
  ['metricIntegrity', ['arg:0', 'report.tests', 'report.tests.0', 'prFiles', 'prFiles.0', 'prPatches', 'prPatches.[tests/test_x.py]', 'workflowRuns'],
    { allow: { 'report.tests': ['missing', 'empty_array'], workflowRuns: ['empty_array'] } }],
  ['metricCompare', ['arg:0', 'arg:1', 'arg:2', ...TRUST, 'report.metrics', 'report.metrics.latency_ms', 'report.tests', 'report.tests.0', 'prPatches'],
    { allow: merge(TRUST_ALLOW, { 'report.tests': ['missing', 'empty_array'] }) }],
  ['versionAtLeast', ['arg:0', 'arg:1', ...TRUST, 'report.deps', 'report.deps.requests'], { allow: TRUST_ALLOW }],
  ['pathAbsent', ['arg:0', 'headPaths', 'headPaths.0']],
  // Jira returns an empty list when a ticket has no sub-tasks or links: none is open. A missing
  // field was not read.
  ['subtasksDone', ['ticket', 'ticket.subtasks', 'ticket.subtasks.0', 'ticket.subtasks.0.statusCategory'], { allow: { 'ticket.subtasks': ['empty_array'] } }],
  ['blockedByDone', ['ticket', 'ticket.links', 'ticket.links.0', 'ticket.links.0.statusCategory', 'ticket.links.0.type'], { allow: { 'ticket.links': ['empty_array'] } }],
  ['deployed', ['deployRuns', 'deployRuns.0', 'deployRuns.0.conclusion', 'deployRuns.0.createdAt', 'deployRuns.0.tag']],
  // An empty modules_without_ids list means every changed test module gave its base test ids. A
  // report without a repro block is from before the base record existed (as a block without
  // base_test_ids). Approvals can only turn a fail into a pass, so none stored means none. Only
  // the app's store counts; the issue property is never read for a pass (finding E1).
  ['testsNotRemoved', ['report', 'report.tests', 'report.tests.0', 'report.tests.0.id', 'baseReport', 'baseReport.tests', 'baseReport.tests.0', 'baseReport.tests.0.id',
    'report.repro', 'report.repro.base_test_ids', 'report.repro.base_test_ids.0', 'report.repro.base_collect',
    'report.repro.base_collect.rc', 'report.repro.base_collect.modules_without_ids', 'ticket', 'approvals', 'approvals.removals', 'approvals.changes'],
  { allow: { 'report.repro.base_collect.modules_without_ids': ['empty_array'], 'report.repro': ['missing'], approvals: ['missing', 'null'],
    'approvals.removals': ['missing', 'empty_array'], 'approvals.changes': ['missing', 'empty_array'] } }],
  // No pinned block is a report from before the bank step: advisory, so it cannot turn a verdict
  // into a pass. Approvals can only turn a fail into a pass, so none stored means none.
  ['pinnedTestsHold', ['report', 'report.pinned', 'report.pinned.tests', 'report.pinned.tests.0', 'report.pinned.tests.0.id', 'report.pinned.tests.0.base_hash',
    'report.pinned.tests.0.head_id', 'report.pinned.tests.0.head_hash', 'report.pinned.tests.0.outcome', 'ticket', 'approvals', 'approvals.removals', 'approvals.changes'],
  { allow: { 'report.pinned': ['missing'], approvals: ['missing', 'null'], 'approvals.removals': ['missing', 'empty_array'], 'approvals.changes': ['missing', 'empty_array'] } }],
  // Report provenance (design P0-3), required: both reports match the single marker of their
  // pinned run at its current attempt.
  ['reportProvenance', ['reportRaw', 'baseReportRaw', 'workflowRuns', 'workflowRuns.0', 'workflowRuns.0.event', 'workflowRuns.0.headSha', 'workflowRuns.0.attempt',
    'workflowRuns.0.headRepo', 'baseRuns', 'baseRuns.0', 'baseRuns.0.headBranch', 'baseRuns.0.headSha', 'artifactsByRun', 'pr', 'pr.headSha', 'baseReport.head_sha'], {
    tweak: (ctx) => {
      ctx.config = { ...(ctx.config ?? {}), provenanceRequired: true };
      ctx.repo = 'o/r';
      ctx.pr.baseRef = 'main';
      ctx.baseReport.head_sha = BASE;
      ctx.reportRaw = JSON.stringify(ctx.report);
      ctx.baseReportRaw = JSON.stringify(ctx.baseReport);
      Object.assign(ctx.workflowRuns[0], { event: 'pull_request', headRepo: 'o/r' });
      ctx.baseRuns = [{ id: 99, attempt: 1, path: CI, headSha: BASE, event: 'push', headBranch: 'main', headRepo: 'o/r' }];
      ctx.artifactsByRun = {
        [ctx.workflowRuns[0].id]: [`ci-report-sha256-${reportHash(ctx.reportRaw)}-attempt-${ctx.workflowRuns[0].attempt}`],
        99: [`main-report-sha256-${reportHash(ctx.baseReportRaw)}-attempt-1`],
      };
    },
  }],
  // No AC record (a work item made before 19 Nov or outside the app) is advisory: it cannot turn
  // a verdict into a pass.
  ['acsRecorded', ['approvals', 'approvals.acs', 'approvals.acs.acHash', 'approvals.acs.by', 'approvals.acs.auditSeq', 'approvalEvents', 'ticket', 'ticket.key', 'ticket.acceptanceCriteria', 'claimant'],
  { allow: { approvals: ['missing', 'null'], 'approvals.acs': ['missing', 'null'] } }],
  ['migrationAdditive', ['arg:0', ...TRUST, 'report.migrations', 'report.migrations.0', 'report.migrations.0.number', 'report.migrations.0.operations',
    'report.migrations.0.operations.0'], { allow: TRUST_ALLOW }],
  // A repository with no migrations reports an empty list, or none: no two numbers can clash.
  ['uniqueMigrations', ['arg:0', 'arg:0.migrations', 'arg:0.migrations.0', 'arg:0.migrations.0.number'], { allow: { 'arg:0.migrations': ['missing', 'empty_array'] } }],
  // An empty list of tests required after merge means no test by name; the merge report must
  // still keep every base test and unique migrations.
  ['mergedClean', ['mergeReport', 'mergeSha', 'mergeReport.migrations', 'mergeReport.migrations.0', 'mergeReport.tests', 'mergeReport.tests.0', 'baseReport',
    'mergeRequiredTests', 'mergeRequiredTests.0', 'reportAuthor', 'baseWorkflowFiles'],
  { allow: { 'mergeReport.migrations': ['missing', 'empty_array'], mergeRequiredTests: ['empty_array'] } }],
  ['repairBalanced', [...TRUST, 'report.repair', 'report.repair.debits_minor', 'report.repair.credits_minor', 'report.repair.rows_deleted', 'report.repair.rows_updated'], { allow: TRUST_ALLOW }],
  ['reconProof', [...TRUST, 'report.recon', 'report.recon.accounts', 'report.recon.accounts_matching', 'report.recon.diff_minor'], { allow: TRUST_ALLOW }],
  ['evidenceLinked', ['timeline', 'timeline.0', 'timeline.0.link']],
  ['manual', ['arg:0'], { expect: 'unknown' }],
  ['onMain', ['pr', 'pr.merged', 'prCandidates', 'prCandidates.0', 'ticket', 'ticket.key'],
    // The key is used only in reasons once a PR is linked.
    { allow: { ticket: Object.keys(BAD),
      'ticket.key': Object.keys(BAD) } }],
  ['acTestsRunNewCode', ['prPatches', 'prPatches.[src/x.py]', 'report.tests', 'report.tests.0'], { expect: null }],
  // An empty earlierFailures list is the read result "no step failed in an earlier attempt". The
  // run's own status and conclusion are ci_green's inputs; ci_attempts reads only the attempts.
  ['ciAttempts', [...RUN, 'workflowRuns.0.earlierFailures', 'workflowRuns.0.earlierFailures.0', 'pr', 'pr.headSha'],
    { allow: merge(RUN_ALLOW, { 'workflowRuns.0.earlierFailures': ['empty_array'], 'workflowRuns.0.status': Object.keys(BAD), 'workflowRuns.0.conclusion': Object.keys(BAD) }) }],
  ['baseCurrent', ['baseTip', 'report.base_sha'], { tweak: (ctx) => { ctx.pr.merged = false; } }],
  ['measurementUnchanged', ['prFiles', 'config.guardedPaths'], { expect: null }],
  ['checkHumanSignoff', ['ticket.signoff', 'ticket.signoff.by', 'ticket.signoff.sha', 'ticket.signoff.auditSeq', 'pr.mergeSha', 'claimant', 'signoffEvent', 'signoffEvent.hash']],
  // An empty changed_support list means no pytest support file changed. A Bug with no AC (none
  // stored, or an empty list) uses the tests named for its key.
  ['reproduced', [...TRUST, 'report.repro', 'report.repro.head_sha', 'report.repro.tests', 'report.repro.tests.0', 'report.repro.tests.0.id', 'report.repro.tests.0.base',
    'report.repro.tests.0.base.outcome', 'report.repro.tests.0.base.exc_type', 'report.repro.tests.0.head', 'report.repro.tests.0.head.outcome',
    'report.repro.full_suite', 'report.repro.full_suite.outcome', 'report.repro.base_run', 'report.repro.base_run.report', 'report.repro.base_run.rc',
    'report.repro.changed_support', 'report.repro.changed_support.0', 'report.repro.base_collect', 'baseReport', 'ticket.acceptanceCriteria', 'ticket.acceptanceCriteria.0'],
  { allow: merge(TRUST_ALLOW, { 'report.repro.changed_support': ['empty_array'], 'ticket.acceptanceCriteria': ['missing', 'null', 'empty_array'] }) }],
  // An empty unmeasured_files list means every changed file is in the coverage data.
  ['coverageOk', [...TRUST, 'report.coverage', 'report.coverage.changed_executable', 'report.coverage.changed_covered', 'report.coverage.head_total', 'report.coverage.base_total',
    'report.coverage.unmeasured_files', 'report.coverage.unmeasured_files.0', 'report.coverage.changed_excluded', 'prPatches', 'prPatches.[src/x.py]'],
  { allow: merge(TRUST_ALLOW, { 'report.coverage.unmeasured_files': ['empty_array'] }) }],
  ['codeScanning', ['pr', 'pr.headSha', 'prFiles', 'truncated', 'truncated.checks', 'workflowRuns.0', 'securityRuns', 'securityRuns.0', 'securityRuns.0.headSha', 'securityRuns.0.status', 'securityRuns.0.conclusion',
    'config.securityCheck', 'config.securityCheck.checkName', 'config.securityCheck.appSlug'],
  // Other workflow runs only change the reason when no scanning result exists.
  { allow: { 'workflowRuns.0': Object.keys(BAD) } }],
  ['securityCheck', ['securityRuns', 'securityRuns.0', 'pr.headSha', 'config.securityCheck', 'config.securityCheck.mode']],
];

// The status a call gives: 'pass' for a pass result, a null reason (helpers), or an all-pass list.
function statusOf(name, value) {
  if (value === null || value === undefined) return name === 'pipelineChange' || name === 'metricIntegrity' ? 'pass' : null;
  if (typeof value === 'string') return 'unknown';
  if (Array.isArray(value)) return value.length && value.every((r) => r.status === 'pass') ? 'pass' : value.map((r) => r.status).join(',') || 'not run';
  return value.status;
}

function call(name, ctx, args) {
  if (name === 'uniqueMigrations') return c.uniqueMigrations(args[0]);
  return c[name](ctx, ...args);
}

test('every exported check of checks.js is in the table, except the helpers that are not checks', () => {
  const fns = Object.entries(c).filter(([, v]) => typeof v === 'function').map(([k]) => k);
  const covered = new Set(ROWS.map(([n]) => n));
  assert.deepEqual(fns.filter((n) => !covered.has(n)).sort(), ['hasCodeWork', 'needsRepro', 'ticketTests']);
});

for (const [name, keys, opts = {}] of ROWS) {
  const argsOf = (ctx) => (name === 'uniqueMigrations' ? [ctx.report] : [...(ARGS[name] ?? [])]);
  const fresh = () => {
    const ctx = good();
    opts.tweak?.(ctx);
    return ctx;
  };
  test(`${name}: the good context gives ${opts.expect === undefined ? 'pass' : String(opts.expect)}`, () => {
    const ctx = fresh();
    assert.equal(statusOf(name, call(name, ctx, argsOf(ctx))), opts.expect === undefined ? 'pass' : opts.expect);
  });
  test(`${name}: no missing, empty, non-finite or malformed key input gives pass`, () => {
    const passed = [];
    for (const key of keys) {
      for (const [label, value] of Object.entries(BAD)) {
        // An allowed value may pass, but no value may make a check throw.
        const allowed = opts.allow?.[key]?.includes(label);
        const ctx = fresh();
        const args = argsOf(ctx);
        if (key.startsWith('arg:')) {
          const [i, ...rest] = key.slice(4).split('.');
          if (rest.length) setPath(args[Number(i)], rest.join('.'), value);
          else args[Number(i)] = value;
        } else {
          setPath(ctx, key, value);
        }
        let out;
        try {
          out = call(name, ctx, args);
        } catch (error) {
          passed.push(`${key}=${label} throws ${error.message}`);
          continue;
        }
        if (!allowed && statusOf(name, out) === 'pass') passed.push(`${key}=${label}`);
      }
    }
    assert.deepEqual(passed, []);
  });
}

// The base collection record (bank scripts/repro.py, base_collect). A report that lists base
// test ids must also say how they were read; ids that could not be read are missing evidence.
test('testsNotRemoved: base test ids without a base_collect record give unknown', () => {
  const ctx = good();
  delete ctx.report.repro.base_collect;
  const r = c.testsNotRemoved(ctx);
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /base_collect/);
});

test('testsNotRemoved: a test module whose base test ids could not be read is named', () => {
  const ctx = good();
  ctx.report.repro.base_collect = { rc: 2, modules_without_ids: ['tests/test_y.py', 'tests/test_z.py'] };
  const r = c.testsNotRemoved(ctx);
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /tests\/test_y\.py, tests\/test_z\.py.*base test ids could not be read/);
});

test('testsNotRemoved: a base collection exit code other than 0, 5 or null gives unknown', () => {
  for (const rc of [1, 2, 3, 4, -1, '0', 0.5, true]) {
    const ctx = good();
    ctx.report.repro.base_collect.rc = rc;
    const r = c.testsNotRemoved(ctx);
    assert.equal(r.status, 'unknown', `rc ${JSON.stringify(rc)}: ${r.reason}`);
  }
  for (const rc of [0, 5]) {
    const ctx = good();
    ctx.report.repro.base_collect.rc = rc;
    assert.equal(c.testsNotRemoved(ctx).status, 'pass', `rc ${rc}`);
  }
});

test('testsNotRemoved: rc null with no base test ids means no changed test module', () => {
  const ctx = good();
  ctx.report.repro.base_test_ids = [];
  ctx.report.repro.base_collect = { rc: null, modules_without_ids: [] };
  assert.equal(c.testsNotRemoved(ctx).status, 'pass');
});

test('testsNotRemoved: malformed base test ids or module lists give unknown', () => {
  const bad = [
    ['base_test_ids', 'tests/test_x.py::test_other'], ['base_test_ids', [1]], ['base_test_ids', ['']], ['base_test_ids', undefined],
    ['base_collect', { rc: 0 }], ['base_collect', { modules_without_ids: [] }], ['base_collect', 'ok'],
    ['base_collect', { rc: 0, modules_without_ids: 'tests/test_y.py' }], ['base_collect', { rc: 0, modules_without_ids: [null] }],
  ];
  for (const [field, value] of bad) {
    const ctx = good();
    if (value === undefined) delete ctx.report.repro[field];
    else ctx.report.repro[field] = value;
    const r = c.testsNotRemoved(ctx);
    assert.equal(r.status, 'unknown', `${field}=${JSON.stringify(value)}: ${r.reason}`);
  }
});

test('testsNotRemoved: a dropped base test is a fail even when the collection record is incomplete', () => {
  const ctx = good();
  ctx.report.repro.base_test_ids.push('tests/test_x.py::test_dropped');
  delete ctx.report.repro.base_collect;
  const r = c.testsNotRemoved(ctx);
  assert.equal(r.status, 'fail', r.reason);
  assert.match(r.reason, /test_dropped/);
});

test('reproduced and mergedClean carry the base_collect gap', () => {
  const ctx = good();
  ctx.report.repro.base_collect.modules_without_ids = ['tests/test_y.py'];
  assert.equal(c.reproduced(ctx).status, 'unknown');
  ctx.mergeReport.repro.base_collect.modules_without_ids = ['tests/test_y.py'];
  assert.equal(c.mergedClean(ctx).status, 'unknown');
});

// changed_excluded (bank scripts/changed_coverage.py): changed lines that the coverage settings
// exclude are not in the counts, so the counts can look covered.
test('coverageOk: changed lines excluded from coverage give unknown, with the count', () => {
  const ctx = good();
  ctx.report.coverage.changed_excluded = 3;
  const r = c.coverageOk(ctx);
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /3 changed lines excluded from coverage; a person checks/);
});

test('coverageOk: a missing or non-integer changed_excluded gives unknown', () => {
  for (const value of [undefined, 1.5, -1, '0', true]) {
    const ctx = good();
    if (value === undefined) delete ctx.report.coverage.changed_excluded;
    else ctx.report.coverage.changed_excluded = value;
    const r = c.coverageOk(ctx);
    assert.equal(r.status, 'unknown', `${JSON.stringify(value)}: ${r.reason}`);
    assert.match(r.reason, /changed_excluded/);
  }
});

test('coverageOk: a changed-line floor fail stays a fail when lines are excluded', () => {
  const ctx = good();
  ctx.report.coverage.changed_covered = 2;
  ctx.report.coverage.changed_excluded = 4;
  assert.equal(c.coverageOk(ctx).status, 'fail');
});

// PR 9 review, item 4: the changed-line counts are whole numbers of lines, at least 0, and no
// more lines are covered than exist.
test('coverageOk: a negative, fractional or impossible changed-line count gives unknown', () => {
  const bad = [
    { changed_executable: -1 }, { changed_executable: -1, changed_covered: -1 }, { changed_executable: 10.5 },
    { changed_covered: -1 }, { changed_covered: 8.5 }, { changed_covered: 11 },
  ];
  for (const counts of bad) {
    const ctx = good();
    Object.assign(ctx.report.coverage, counts);
    const r = c.coverageOk(ctx);
    assert.equal(r.status, 'unknown', `${JSON.stringify(counts)}: ${r.reason}`);
  }
});

// PR 9 review, item 5: coverage totals are percentages, finite and in [0, 100].
test('coverageOk: a total coverage outside 0 to 100 gives unknown', () => {
  for (const [field, value] of [['head_total', 1e999], ['head_total', 101], ['head_total', -1], ['base_total', 150], ['base_total', -0.5], ['head_total', '90']]) {
    const ctx = good();
    ctx.report.coverage[field] = value;
    const r = c.coverageOk(ctx);
    assert.equal(r.status, 'unknown', `${field}=${value}: ${r.reason}`);
  }
  for (const [head, base] of [[0, 0], [100, 100]]) {
    const ctx = good();
    Object.assign(ctx.report.coverage, { head_total: head, base_total: base });
    assert.equal(c.coverageOk(ctx).status, 'pass', `${head}/${base}`);
  }
});

// Final review, item 1: a metric that is not a finite number (1e999 parses to Infinity, also
// -Infinity) gives unknown in both directions, as one number and as a median.
test('metricCompare: a non-finite metric value gives unknown, never pass', () => {
  for (const value of [1e999, -1e999, Number.NaN]) {
    for (const [direction, bound] of [['min', 5], ['max', 20]]) {
      for (const shape of ['number', 'median']) {
        const ctx = good();
        ctx.report.metrics.latency_ms = shape === 'number' ? value : { median: value, iqr_low: 1, iqr_high: 2, runs: 5 };
        const r = c.metricCompare(ctx, 'latency_ms', bound, direction);
        assert.equal(r.status, 'unknown', `${shape} ${value} ${direction}: ${r.reason}`);
      }
    }
  }
});

// Final review, item 1: a version that does not start with a release number gives unknown.
test('versionAtLeast: an unparsable version gives unknown, never pass', () => {
  for (const found of ['latest', 'abc', 'v', '*', '.', '-1', 'x.y.z']) {
    const ctx = good();
    ctx.report.deps.requests = found;
    const r = c.versionAtLeast(ctx, 'requests', '0.0.0');
    assert.equal(r.status, 'unknown', `found ${found}: ${r.reason}`);
  }
  for (const wanted of ['latest', 'abc', 'x.1']) {
    const r = c.versionAtLeast(good(), 'requests', wanted);
    assert.equal(r.status, 'unknown', `wanted ${wanted}: ${r.reason}`);
  }
  // Release numbers still compare as before.
  assert.equal(c.versionAtLeast(good(), 'requests', '2.32.0').status, 'pass');
  assert.equal(c.versionAtLeast(good(), 'requests', '2.32.1').status, 'fail');
  assert.equal(c.versionAtLeast(good(), 'requests', '2.4').status, 'pass');
});

// Final review, item 2: verdict assembly. A malformed ticket, AC list, link list, type, key or
// claim must not crash verify() and must not give supported. A check that throws gives
// cannot_verify with "malformed input" and the check's name.
const VERDICT_BAD = { ...BAD, text: 'x', number: 42, object: {}, empty_object_element: [{}] };
function verdictGood() {
  const ctx = good();
  ctx.workflowRuns[0].url = 'https://example.test/run/1';
  ctx.ticket.fields = { customfield_1: 'yes' };
  ctx.ticket.acceptanceCriteria.push(
    { acId: 'AC2', check: { type: 'link_exists', args: ['is blocked by'] } },
    { acId: 'AC3', check: { type: 'field_equals', args: ['customfield_1', 'yes'] } },
  );
  return { ...ctx, ...acRecordFor(ctx.ticket.acceptanceCriteria) };
}
const CLAIMS = Object.keys(CLAIM_CHECKS);
const VERDICT_PATHS = ['ticket', 'ticket.key', 'ticket.type', 'ticket.links', 'ticket.links.0', 'ticket.fields', 'ticket.acceptanceCriteria',
  'ticket.acceptanceCriteria.0', 'ticket.acceptanceCriteria.0.check', 'ticket.acceptanceCriteria.0.check.args',
  'ticket.acceptanceCriteria.1', 'ticket.acceptanceCriteria.1.check', 'ticket.acceptanceCriteria.1.check.args',
  'ticket.acceptanceCriteria.2.check.args'];

test('verify: the good context is supported for every claim type', () => {
  for (const type of CLAIMS) {
    const v = verify({ id: 'g', type, args: { tag: 'v1' } }, verdictGood());
    assert.equal(v.result, 'supported', `${type}: ${v.reason}`);
  }
});

test('verify: a malformed ticket, AC list, link list, type or key never throws', () => {
  const thrown = [];
  for (const type of CLAIMS) {
    for (const path of VERDICT_PATHS) {
      for (const [label, value] of Object.entries(VERDICT_BAD)) {
        const ctx = verdictGood();
        setPath(ctx, path, value);
        try {
          verify({ id: 'b', type, args: { tag: 'v1' } }, ctx);
        } catch (error) {
          thrown.push(`${type} ${path}=${label}: ${error.message}`);
        }
      }
    }
  }
  assert.deepEqual(thrown, []);
});

// The claim types whose verdict reads these inputs. "merged" and "deployed" read no ticket field.
test('verify: a malformed ticket, AC list, link list or key never gives supported for acs or done', () => {
  const passed = [];
  // An AC list is read as a whole, so a missing or empty list is "no AC": that is a fail for acs.
  // The type is read only to choose the Bug and Task rules; a ticket of another type keeps the
  // AC checks, so a missing or odd type can be supported.
  // The key is read only to fill {TOKEN} or {KEY} in a test name and for the Bug's own tests;
  // the acs claim here names no such test. No AC with every sub-task done means the work is the
  // sub-tasks (benchmark B24). link_exists with no link type means any link.
  const ALLOW = {
    'ticket.type': Object.keys(VERDICT_BAD),
    'ticket.key': Object.keys(VERDICT_BAD),
    'ticket.acceptanceCriteria': ['missing', 'null', 'empty_array'],
    'ticket.acceptanceCriteria.1.check.args': ['missing', 'empty_array'],
  };
  for (const type of ['acs', 'done']) {
    for (const path of VERDICT_PATHS) {
      for (const [label, value] of Object.entries(VERDICT_BAD)) {
        if (ALLOW[path]?.includes(label) && !(type === 'done' && path === 'ticket.key')) continue;
        const ctx = verdictGood();
        setPath(ctx, path, value);
        let v;
        try {
          v = verify({ id: 'b', type, args: { tag: 'v1' } }, ctx);
        } catch {
          continue; // reported by the test above
        }
        if (v.result === 'supported') passed.push(`${type} ${path}=${label}`);
      }
    }
  }
  assert.deepEqual(passed, []);
});

test('verify: a malformed claim never throws and is not supported', () => {
  for (const claim of [undefined, null, 'x', {}, { type: null }, { type: 42 }, { type: 'toString' }, { type: '__proto__' }, { type: 'constructor' }]) {
    let v;
    assert.doesNotThrow(() => { v = verify(claim, verdictGood()); }, JSON.stringify(claim));
    assert.equal(v.result, 'cannot_verify', JSON.stringify(claim));
  }
});

test('verify: a check that throws gives cannot_verify with "malformed input" and the check name', () => {
  const ctx = verdictGood();
  Object.defineProperty(ctx, 'mergeReport', { get() { throw new Error('boom'); } });
  let v;
  assert.doesNotThrow(() => { v = verify({ id: 't', type: 'merged' }, ctx); });
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /malformed input/);
  assert.match(v.reason, /merged/);
  assert.doesNotThrow(() => { v = verify({ id: 't', type: 'done' }, ctx); });
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /malformed input/);
});

test('checks with a missing ticket or a key that is not text do not throw', () => {
  for (const ticket of [undefined, null]) {
    const ctx = good();
    ctx.ticket = ticket;
    assert.doesNotThrow(() => c.reproduced(ctx), `ticket ${ticket}`);
    assert.notEqual(c.reproduced(ctx).status, 'pass');
  }
  for (const key of [42, {}, ['X-1'], null]) {
    const ctx = good();
    ctx.ticket.key = key;
    ctx.ticket.acceptanceCriteria[0].check.args = ['test_{TOKEN}_fix'];
    assert.doesNotThrow(() => c.reproduced(ctx), `key ${JSON.stringify(key)}`);
    assert.doesNotThrow(() => c.ticketTests(ctx), `key ${JSON.stringify(key)}`);
    assert.notEqual(c.reproduced(ctx).status, 'pass', `key ${JSON.stringify(key)}`);
  }
});
