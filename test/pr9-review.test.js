// Review of PR 9 (commit 06bfe5a), items 1, 2, 4 and 5. Item 3 is in checks-bad-input.test.js.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import * as checks from '../src/verifier/checks.js';
import { verify } from '../src/verifier/verdict.js';
import { decide } from '../src/verify-claim.js';
import { fetchFrom } from './helpers/recorded-github.js';
import { withReader } from './helpers/reader.js';
import { PRE_PINNED_CONFIG } from './helpers/pre-pinned.js';

const H = 'a'.repeat(40);
const CI = '.github/workflows/ci.yml';

// ---- Item 1: a success after a run without a result ----
// A success after a cancelled, stale or skipped run of the same workflow file on the same head
// passes only when the run without a result is known to have no failed attempt and no failed
// step. Otherwise the author may have cancelled a failing run.

const run = (over) => ({ id: 1, path: CI, headSha: H, status: 'completed', attempt: 1, createdAt: '2026-11-17T01:00:00Z', ...over });
const ciCtx = (runs) => withReader({ pr: { headSha: H }, prFiles: ['src/a.py'], workflowRuns: runs, config: { requiredWorkflowPaths: [CI] } });
const success = run({ id: 2, conclusion: 'success', createdAt: '2026-11-17T01:10:00Z' });

test('item 1: a cancelled run whose step results were not read gives unknown, even with a later success', () => {
  for (const conclusion of ['cancelled', 'stale', 'skipped']) {
    for (const stepFailures of [undefined, null, 'none', [null]]) {
      const r = checks.ciGreen(ciCtx([run({ conclusion, stepFailures }), success]));
      assert.equal(r.status, 'unknown', `${conclusion} ${JSON.stringify(stepFailures)}: ${r.reason}`);
    }
  }
});

test('item 1: a cancelled run with a failed step gives unknown, even with a later success', () => {
  const failed = run({ conclusion: 'cancelled', stepFailures: [{ attempt: 1, job: 'test', step: 'Run pytest' }] });
  const r = checks.ciGreen(ciCtx([failed, success]));
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /Run pytest/);
});

test('item 1: a cancelled run with an earlier failed attempt gives unknown, even with a later success', () => {
  const cancelled = run({ conclusion: 'cancelled', attempt: 2, stepFailures: [], jobConclusions: [], earlierUnread: 0,
    earlierConclusions: [{ attempt: 1, conclusion: 'failure' }], earlierFailures: [{ attempt: 1, job: 'test', step: 'Run uv sync' }] });
  const r = checks.ciGreen(ciCtx([cancelled, success]));
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /attempt 1/);
});

test('item 1: a cancelled run with no failed step and no failed attempt, then a later success, passes', () => {
  const clean = run({ conclusion: 'cancelled', stepFailures: [], jobConclusions: [] });
  assert.equal(checks.ciGreen(ciCtx([clean, success])).status, 'pass');
  const rerun = run({ conclusion: 'cancelled', attempt: 2, stepFailures: [], jobConclusions: [], earlierUnread: 0,
    earlierConclusions: [{ attempt: 1, conclusion: 'success' }], earlierFailures: [] });
  assert.equal(checks.ciGreen(ciCtx([rerun, success])).status, 'pass');
  // The success must still come after the run without a result.
  assert.equal(checks.ciGreen(ciCtx([{ ...clean, createdAt: '2026-11-17T02:00:00Z' }, success])).status, 'unknown');
});

test('item 1: the reader records the failed steps of a run without a result', async () => {
  const fetchFn = async (url) => {
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    const body = /\/pulls\?/.test(url) ? (page === 1 ? [{ number: 21, title: 'BANK-21 fix', state: 'open', head: { ref: 'b', sha: H, repo: { full_name: 'o/r' } } }] : [])
      : /\/actions\/runs\?/.test(url) ? { workflow_runs: page === 1 ? [
        { id: 7, run_attempt: 1, path: CI, head_sha: H, status: 'completed', conclusion: 'cancelled', created_at: '2026-11-17T01:00:00Z' },
        { id: 8, run_attempt: 1, path: CI, head_sha: H, status: 'completed', conclusion: 'success', created_at: '2026-11-17T01:10:00Z' },
      ] : [] }
      : /\/runs\/7\/attempts\/1\/jobs/.test(url) ? { jobs: [{ name: 'test', steps: [{ name: 'Run pytest', conclusion: 'failure' }, { name: 'Upload', conclusion: 'cancelled' }] }] }
      : /\/pulls\/21\/files/.test(url) ? [{ filename: 'src/x.py' }]
      : null;
    return body === null ? { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } } : { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
  };
  const gh = await collectGithub({ repo: 'o/r', key: 'BANK-21', fetchFn });
  const byId = Object.fromEntries(gh.workflowRuns.map((r) => [r.id, r]));
  assert.deepEqual(byId[7].stepFailures, [{ attempt: 1, job: 'test', step: 'Run pytest' }]);
  assert.equal(byId[8].stepFailures, undefined);
  assert.equal(checks.ciGreen({ pr: gh.pr, workflowRuns: gh.workflowRuns, prFiles: gh.prFiles, truncated: gh.truncated, config: { requiredWorkflowPaths: [CI] } }).status, 'unknown');
});

// ---- Item 2: a Story's new function and the base AttributeError ----
// The call in the test must be code (not a comment or a string), and the base error must name the
// module object, as Python writes it: "module 'bank.ledger' has no attribute 'name'".

const loadBench = (id) => {
  const c = JSON.parse(readFileSync(new URL(`../fixtures/bench/${id}.json`, import.meta.url), 'utf8'));
  const cov = c.github?.report?.coverage;
  if (cov && !('unmeasured_files' in cov)) cov.unmeasured_files = [];
  if (cov && !('changed_excluded' in cov)) cov.changed_excluded = 0;
  return c;
};
async function verdictOf(c) {
  const d = {
    collectJira: async () => structuredClone(c.ticket),
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: 'local' }),
    collectGithub, collectPrStats, config: PRE_PINNED_CONFIG, fetchFn: fetchFrom(c.github),
  };
  const log = console.log;
  console.log = () => {};
  try {
    return (await decide({ issueKey: c.ticket.key, claim: { id: `pr9-${c.id}`, type: c.claim, text: '' } }, d)).verdict;
  } finally {
    console.log = log;
  }
}
const NO_ATTR = "AttributeError: module 'bank.ledger' has no attribute 'strip_reference'";
// testPatch: the added lines of the test file, without the leading "+".
function newFunction(c, { message = NO_ATTR, testPatch = ['    assert ledger.strip_reference(" a ") == "a"'] } = {}) {
  c.ticket.type = 'Story';
  const acs = new Set(c.ticket.acceptanceCriteria.map((a) => a.check.args[0]));
  for (const t of c.github.report.repro.tests) {
    if (acs.has(t.id.split('::')[1])) t.base = { outcome: 'failed', exc_type: 'AttributeError', exc_message: message };
  }
  for (const f of c.github.files) {
    if (f.filename.startsWith('src/') && f.patch) f.patch += '\n+def strip_reference(text):\n+    return text.strip()';
    if (f.filename.startsWith('tests/') && f.patch) f.patch += `\n${testPatch.map((l) => `+${l}`).join('\n')}`;
  }
  return c;
}

test('item 2: the control case (a real call, a module error) is supported', async () => {
  const v = await verdictOf(newFunction(loadBench('B23')));
  assert.equal(v.result, 'supported', v.reason);
});

test('item 2: a call inside a comment or a string does not count', async () => {
  const cases = {
    comment: ['    assert True  # ledger.strip_reference(" a ")'],
    'comment line': ['    # ledger.strip_reference(" a ")', '    assert True'],
    'double-quoted string': ['    assert "ledger.strip_reference(x)" != "a"'],
    'single-quoted string': ["    assert 'ledger.strip_reference(x)' != 'a'"],
    'triple-quoted string over lines': ['    """', '    ledger.strip_reference(" a ")', '    """', '    assert True'],
  };
  for (const [name, testPatch] of Object.entries(cases)) {
    const v = await verdictOf(newFunction(loadBench('B23'), { testPatch }));
    assert.equal(v.result, 'cannot_verify', `${name}: ${v.reason}`);
    assert.match(v.reason, /AttributeError/);
  }
});

test('item 2: a base error that names the attribute on another object or module does not count', async () => {
  for (const message of [
    "AttributeError: 'Ledger' object has no attribute 'strip_reference'",
    "AttributeError: module 'bank.other' has no attribute 'strip_reference'",
    "AttributeError: module 'ledger' has no attribute 'strip_reference'",
    "AttributeError: type object 'ledger' has no attribute 'strip_reference'",
  ]) {
    const v = await verdictOf(newFunction(loadBench('B23'), { message }));
    assert.equal(v.result, 'cannot_verify', `${message}: ${v.reason}`);
  }
});

// Final review, item 5: the base error must be the whole first line Python writes, from its
// start. A longer message that only contains the module text does not count.
test('final review item 5: a base error that only contains the module text does not count', async () => {
  for (const message of [
    "AttributeError: partially initialized module 'bank.ledger' has no attribute 'strip_reference' (most likely due to a circular import)",
    "AttributeError: module 'bank.ledger' has no attribute 'strip_reference' and more",
    "RuntimeError: AttributeError: module 'bank.ledger' has no attribute 'strip_reference'",
    "module 'bank.ledger' has no attribute 'strip_reference'",
    `${NO_ATTR}\nsecond line`,
  ]) {
    const v = await verdictOf(newFunction(loadBench('B23'), { message }));
    assert.equal(v.result, 'cannot_verify', `${message}: ${v.reason}`);
  }
  // Python 3.12 can add a suggestion to the same line.
  const hint = `${NO_ATTR}. Did you mean: 'strip_ref'?`;
  assert.equal((await verdictOf(newFunction(loadBench('B23'), { message: hint }))).result, 'supported');
});

// Final review, item 5: a string continued with a backslash at the end of a line is a string on
// the next line too, so a call written there does not count.
test('final review item 5: a call inside a backslash-continued string does not count', async () => {
  const cases = {
    'double-quoted': ['    assert "a \\', '    ledger.strip_reference(x)" != "a"'],
    'single-quoted': ["    assert 'a \\", "    ledger.strip_reference(x)' != 'a'"],
  };
  for (const [name, testPatch] of Object.entries(cases)) {
    const v = await verdictOf(newFunction(loadBench('B23'), { testPatch }));
    assert.equal(v.result, 'cannot_verify', `${name}: ${v.reason}`);
  }
  // An escaped backslash at the end of a string does not continue it; the call after it is code.
  const escaped = ['    path = "a\\\\"', '    assert ledger.strip_reference(" a ") == "a"'];
  assert.equal((await verdictOf(newFunction(loadBench('B23'), { testPatch: escaped }))).result, 'supported');
});

// LIMIT: only the added lines of the test file are read. A string opened on an unchanged line
// (for example a docstring that the PR extends) is not seen, so a call written inside it still
// counts. Closing this needs the whole file, which the patch does not give.
test('item 2 limit: a call inside a string opened on an unchanged line still counts', async () => {
  const c = newFunction(loadBench('B23'), { testPatch: ['    ledger.strip_reference(" a ")'] });
  for (const f of c.github.files) {
    if (f.filename.startsWith('tests/') && f.patch) f.patch = f.patch.replace(/\n\+ {4}ledger\.strip_reference\(" a "\)$/, '\n     """old docstring\n+    ledger.strip_reference(" a ")\n     """');
    if (f.filename.startsWith('tests/') && f.patch) assert.match(f.patch, /old docstring/);
  }
  const v = await verdictOf(c);
  assert.equal(v.result, 'supported', v.reason);
});

// ---- Item 3: the readers set every field the checks read ----

test('item 3: the Jira reader always gives sub-task and link lists, also when Jira leaves the fields out', async () => {
  const { collectJira } = await import('../src/jira-evidence.js');
  const requestJira = async () => ({ ok: true, json: async () => ({ key: 'BANK-9', fields: { issuetype: { name: 'Story' } }, properties: {} }) });
  const t = await collectJira('BANK-9', requestJira);
  assert.deepEqual([t.subtasks, t.links], [[], []]);
  assert.equal(checks.subtasksDone({ ticket: t }).status, 'pass');
  assert.equal(checks.blockedByDone({ ticket: t }).status, 'pass');
  assert.equal(checks.subtasksDone({ ticket: { key: 'BANK-9' } }).status, 'unknown');
  assert.equal(checks.blockedByDone({ ticket: { key: 'BANK-9' } }).status, 'unknown');
});

test('item 3: the GitHub reader always gives page flags and PR candidates', async () => {
  const fetchFn = async (url) => {
    const body = /\/pulls\?/.test(url) ? [] : null;
    return body === null ? { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } } : { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
  };
  const gh = await collectGithub({ repo: 'o/r', key: 'BANK-9', fetchFn });
  assert.deepEqual(gh.truncated, { pulls: false, comments: false, runs: false, files: false, checks: false });
  assert.deepEqual(gh.prCandidates, []);
});

// ---- Item 5: a done claim with a linked PR needs that PR merged ----
// Rule: "done" means on main. A done claim whose ticket has a linked PR needs that PR merged,
// whatever its AC types. deployed is code work (a deploy ships merged code); field_equals,
// evidence_linked and link_exists read Jira or the incident timeline, not code, so a ticket with
// only those and no linked PR has no code gate.

const S59 = JSON.parse(readFileSync(new URL('../fixtures/S59.json', import.meta.url), 'utf8'));
const DEFAULTS = JSON.parse(readFileSync(new URL('../fixtures/_defaults.json', import.meta.url), 'utf8'));
function doneCtx(type, args, { open = false } = {}) {
  const ctx = { ...DEFAULTS, ...structuredClone(S59.steps[0].context) };
  ctx.report.workflow_files = DEFAULTS.baseWorkflowFiles;
  ctx.mergeReport.workflow_files = DEFAULTS.baseWorkflowFiles;
  ctx.reportComment = { createdAt: ctx.workflowRuns[0].createdAt, updatedAt: ctx.workflowRuns[0].createdAt };
  ctx.ticket = { key: 'BANK-4', type: 'Story', subtasks: [], links: [{ type: 'relates to', key: 'BANK-5', statusCategory: 'done' }],
    fields: { customfield_1: 'yes' }, acceptanceCriteria: [{ acId: 'AC1', check: { type, args } }] };
  ctx.timeline = [{ link: 'https://example.test/1' }];
  ctx.deployRuns = [{ tag: 'v1', conclusion: 'success', createdAt: '2026-11-16T11:00:00Z' }];
  if (open) {
    ctx.pr = { ...ctx.pr, state: 'open', merged: false, mergeSha: null };
    ctx.mergeSha = null;
  }
  return withReader(ctx);
}
const NON_CODE = [['field_equals', ['customfield_1', 'yes']], ['evidence_linked', []], ['link_exists', ['relates to']]];

test('item 5: deployed is code work', () => {
  assert.equal(checks.hasCodeWork(doneCtx('deployed', ['v1'])), true);
  for (const [type, args] of NON_CODE) assert.equal(checks.hasCodeWork({ ticket: { type: 'Story', acceptanceCriteria: [{ acId: 'AC1', check: { type, args } }] } }), false, type);
});

test('item 5: a done claim with only a deployed, field_equals, evidence_linked or link_exists AC and an open PR is not supported', () => {
  for (const [type, args] of [['deployed', ['v1']], ...NON_CODE]) {
    const v = verify({ id: 'd', type: 'done' }, doneCtx(type, args, { open: true }));
    assert.notEqual(v.result, 'supported', `${type}: ${v.reason}`);
    assert.equal(v.checks.find((k) => k.name === 'on_main')?.status, 'fail', type);
  }
});

test('item 5: the same done claims are supported once the PR is merged', () => {
  for (const [type, args] of NON_CODE) {
    const v = verify({ id: 'd', type: 'done' }, doneCtx(type, args));
    assert.equal(v.result, 'supported', `${type}: ${v.reason}`);
    assert.equal(v.checks.find((k) => k.name === 'on_main')?.status, 'pass', type);
  }
});

test('item 5: a ticket with only non-code ACs and no linked PR has no PR gate', () => {
  for (const [type, args] of NON_CODE) {
    const ctx = doneCtx(type, args);
    ctx.pr = null;
    ctx.prCandidates = [];
    const v = verify({ id: 'd', type: 'done' }, ctx);
    assert.equal(v.checks.some((k) => k.name === 'on_main'), false, type);
  }
});
