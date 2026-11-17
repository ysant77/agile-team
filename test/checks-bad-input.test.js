// General rule (README, "No check passes by default"): every check gives unknown on a missing,
// empty, non-finite or malformed input. Each row starts from a context where the check passes,
// replaces one key input with each bad value, and asserts that the check does not pass and does
// not throw. A check that returns null (rule not applicable) or a reason string is also covered.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as c from '../src/verifier/checks.js';
import { nextEvent } from '../src/audit.js';

const BAD = { null: null, empty_string: '', empty_array: [], NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY };
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const MERGE = 'c'.repeat(40);
const CI = '.github/workflows/ci.yml';

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
    signoffEvent: nextEvent({ seq: 6, hash: 'f'.repeat(64) }, { actor: 'pat', event: 'change.signed_off', data: { key: 'X-1', sha: MERGE }, at: '2026-11-16T12:00:00Z' }),
    report,
    reportAuthor: 'github-actions[bot]',
    reportComment: { updatedAt: '2026-11-16T10:03:00Z' },
    baseWorkflowFiles: { [CI]: 'h1' },
    workflowRuns: [{
      id: 1, path: CI, headSha: HEAD, status: 'completed', conclusion: 'success', attempt: 2, earlierFailures: [],
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
    truncated: {},
    config: {
      requiredWorkflowPaths: [CI],
      securityCheck: { mode: 'enforce', checkName: 'CodeQL', appSlug: 'github-advanced-security', appId: 57789 },
    },
  };
}

// Path segments: "report.coverage.head_total", "workflowRuns.0.earlierFailures".
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = value;
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
const ROWS = [
  ['pipelineChange', ['prFiles']],
  ['reportTrusted', ['report', 'report.head_sha', 'report.workflow_files', 'reportAuthor', 'pr.headSha', 'baseWorkflowFiles', 'reportComment', 'reportComment.updatedAt', 'prFiles', 'workflowRuns']],
  // The title alone is not key: the branch name also names the key.
  ['prLinked', ['pr', 'pr.state', 'pr.merged', 'prCandidates', 'ticket.key']],
  ['ciGreen', ['pr.headSha', 'workflowRuns', 'workflowRuns.0.conclusion', 'workflowRuns.0.status', 'prFiles', 'config.requiredWorkflowPaths']],
  ['testPasses', ['arg:0', 'report', 'report.tests']],
  ['bugTestExists', ['report.tests', 'ticket.key']],
  // For a metric the test list is a guard (no failed test), not the evidence: an empty list has
  // no failed test.
  ['metricIntegrity', ['arg:0', 'report.tests', 'prFiles', 'prPatches'], { allow: { 'report.tests': ['empty_array'] } }],
  ['metricCompare', ['arg:0', 'arg:1', 'arg:2', 'report.metrics', 'report.metrics.latency_ms', 'report.tests', 'prFiles'], { allow: { 'report.tests': ['empty_array'] } }],
  ['versionAtLeast', ['arg:0', 'arg:1', 'report.deps', 'report.deps.requests']],
  ['pathAbsent', ['arg:0', 'headPaths']],
  // Jira returns an empty list when a ticket has no sub-tasks or links: none is open.
  ['subtasksDone', ['ticket.subtasks', 'ticket.subtasks.0.statusCategory'], { allow: { 'ticket.subtasks': ['empty_array'] } }],
  ['blockedByDone', ['ticket.links', 'ticket.links.0.statusCategory', 'ticket.links.0.type'], { allow: { 'ticket.links': ['empty_array'] } }],
  ['deployed', ['deployRuns', 'deployRuns.0.conclusion', 'deployRuns.0.createdAt']],
  // An empty modules_without_ids list means every changed test module gave its base test ids.
  ['testsNotRemoved', ['report', 'report.tests', 'baseReport', 'baseReport.tests', 'report.repro.base_test_ids', 'report.repro.base_collect',
    'report.repro.base_collect.rc', 'report.repro.base_collect.modules_without_ids'], { allow: { 'report.repro.base_collect.modules_without_ids': ['empty_array'] } }],
  ['migrationAdditive', ['arg:0', 'report.migrations', 'report.migrations.0.operations']],
  // A repository with no migrations reports an empty list: no two numbers can clash.
  ['uniqueMigrations', ['arg:0', 'arg:0.migrations'], { allow: { 'arg:0.migrations': ['empty_array'] } }],
  ['mergedClean', ['mergeReport', 'mergeSha', 'mergeReport.migrations', 'mergeReport.tests', 'baseReport'], { allow: { 'mergeReport.migrations': ['empty_array'] } }],
  ['repairBalanced', ['report.repair', 'report.repair.debits_minor', 'report.repair.credits_minor', 'report.repair.rows_deleted', 'report.repair.rows_updated']],
  ['reconProof', ['report.recon', 'report.recon.accounts', 'report.recon.accounts_matching', 'report.recon.diff_minor']],
  ['evidenceLinked', ['timeline', 'timeline.0.link']],
  ['manual', ['arg:0'], { expect: 'unknown' }],
  ['onMain', ['pr', 'pr.merged', 'prCandidates']],
  ['acTestsRunNewCode', ['prPatches', 'report.tests'], { expect: null }],
  // An empty earlierFailures list is the read result "no step failed in an earlier attempt".
  ['ciAttempts', ['workflowRuns', 'workflowRuns.0.earlierFailures', 'workflowRuns.0.attempt'], { allow: { 'workflowRuns.0.earlierFailures': ['empty_array'] } }],
  ['baseCurrent', ['baseTip', 'report.base_sha'], { tweak: (ctx) => { ctx.pr.merged = false; } }],
  ['measurementUnchanged', ['prFiles', 'config.guardedPaths'], { expect: null }],
  ['checkHumanSignoff', ['ticket.signoff', 'ticket.signoff.by', 'ticket.signoff.sha', 'pr.mergeSha']],
  // An empty changed_support list means no pytest support file changed. A Bug with no AC (none
  // stored, or an empty list) uses the tests named for its key.
  ['reproduced', ['report.repro', 'report.repro.tests', 'report.repro.full_suite', 'report.repro.base_run', 'report.repro.changed_support', 'report.repro.base_collect', 'baseReport', 'ticket.acceptanceCriteria'],
    { allow: { 'report.repro.changed_support': ['empty_array'], 'ticket.acceptanceCriteria': ['null', 'empty_array'] } }],
  // An empty unmeasured_files list means every changed file is in the coverage data.
  ['coverageOk', ['report.coverage', 'report.coverage.changed_executable', 'report.coverage.changed_covered', 'report.coverage.head_total', 'report.coverage.base_total', 'report.coverage.unmeasured_files', 'report.coverage.changed_excluded', 'prFiles', 'prPatches'],
    { allow: { 'report.coverage.unmeasured_files': ['empty_array'] } }],
  ['codeScanning', ['pr.headSha', 'securityRuns', 'securityRuns.0.conclusion', 'config.securityCheck.checkName']],
  ['securityCheck', ['securityRuns', 'pr.headSha']],
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
        if (opts.allow?.[key]?.includes(label)) continue;
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
        if (statusOf(name, out) === 'pass') passed.push(`${key}=${label}`);
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
