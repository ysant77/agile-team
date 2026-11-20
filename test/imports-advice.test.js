// The bank's import guard (scripts/import_guard.py) writes an `imports` block in the CI report:
// the imports that the PR adds, the unknown ones, the files that do not parse, and whether
// uv.lock or pyproject.toml changed. The app reads it as advice: the check `imports_known` is
// always advisory, so it never changes a verdict (lead item 4, 20 Nov).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importsAdvice } from '../src/verifier/checks.js';
import { verify } from '../src/verifier/verdict.js';
import { decide } from '../src/verify-claim.js';
import { COMPLETE } from './helpers/reader.js';
import './helpers/unlisted.js';

const HEAD = 'a'.repeat(40);
const CI = '.github/workflows/ci.yml';
const TEST = 'test_BANK4_single_withdrawal_debits_once';

const UNKNOWN = {
  version: 1, result: 'unknown_import', unknown: ['requests'], unparsed: [], lock_changed: false,
  added: [{ file: 'src/bank/ledger.py', line: 3, module: 'requests', kind: 'unknown' }, { file: 'src/bank/ledger.py', line: 4, module: 'json', kind: 'stdlib' }],
};
const PASS = { version: 1, result: 'pass', unknown: [], unparsed: [], lock_changed: false, added: [{ file: 'src/bank/ledger.py', line: 3, module: 'json', kind: 'stdlib' }] };

function github({ outcome = 'passed', imports } = {}) {
  const report = { schema: 'aat-ci-report/1', head_sha: HEAD, tests: [{ id: `tests/test_accounts.py::${TEST}`, outcome }], metrics: {}, workflow_files: { [CI]: 'h' } };
  if (imports !== undefined) report.imports = imports;
  return {
    pr: { number: 61, title: 'BANK-4 lock the withdrawal', branch: 'fix/bank-4-lock', state: 'open', headSha: HEAD },
    report,
    reportAuthor: 'github-actions[bot]',
    reportComment: { createdAt: '2026-11-17T01:05:00Z', updatedAt: '2026-11-17T01:05:00Z' },
    baseWorkflowFiles: { [CI]: 'h' },
    workflowRuns: [{ name: 'CI', path: CI, headSha: HEAD, status: 'completed', conclusion: 'success', createdAt: '2026-11-17T01:00:00Z', runStartedAt: '2026-11-17T01:00:05Z', updatedAt: '2026-11-17T01:09:00Z' }],
    deployRuns: [],
    prFiles: ['src/bank/accounts.py', 'tests/test_accounts.py'],
    truncated: COMPLETE,
    prCandidates: [61],
  };
}

const deps = (gh) => ({
  env: () => ({ repo: 'ysant77/yms-bank-demo', token: null }),
  collectJira: async () => ({ key: 'BANK-4', type: 'Story', labels: [], acceptanceCriteria: [{ acId: 'AC1', check: { type: 'test_passes', args: [TEST] } }], subtasks: [], links: [] }),
  collectGithub: async () => gh,
  collectPrStats: async () => ({ patches: {} }),
  collectReviews: async () => [],
  fetchFn: null,
});
const run = (type, gh) => decide({ issueKey: 'BANK-4', claim: { id: 'BANK-4:1', type, text: '' } }, deps(gh));
const decision = (v) => ({ result: v.result, reason: v.reason, counted: v.checks.filter((k) => !k.advisory) });
const advice = (v) => v.checks.find((k) => k.name === 'imports_known');

test('an unknown import is shown as advice; ready and fixed stay supported with the same reason', async () => {
  for (const type of ['ready', 'fixed']) {
    const plain = (await run(type, github())).verdict;
    assert.equal(plain.result, 'supported', plain.reason);
    assert.equal(advice(plain), undefined, 'no block, no advice');
    const { verdict, comment } = await run(type, github({ imports: UNKNOWN }));
    assert.deepEqual(decision(verdict), decision(plain));
    const a = advice(verdict);
    assert.equal(a.advisory, true);
    assert.equal(a.status, 'unknown');
    assert.match(a.reason, /^advice, not counted: /);
    assert.match(a.reason, /unknown import added: requests \(src\/bank\/ledger\.py:3\)/);
    assert.match(comment, /imports_known: advice, not counted/);
  }
});

test('a contradicted verdict stays contradicted, and its reason does not name the imports', async () => {
  const plain = (await run('ready', github({ outcome: 'failed' }))).verdict;
  const v = (await run('ready', github({ outcome: 'failed', imports: UNKNOWN }))).verdict;
  assert.equal(v.result, 'contradicted');
  assert.deepEqual(decision(v), decision(plain));
  assert.doesNotMatch(v.reason, /import/);
});

test('a pass block says that no unknown import was added; a lock change is named', () => {
  const ctx = { report: { imports: PASS } };
  const a = importsAdvice(ctx);
  assert.deepEqual([a.name, a.status, a.advisory], ['imports_known', 'pass', true]);
  assert.match(a.reason, /no unknown import added \(1 added import\)/);
  const locked = importsAdvice({ report: { imports: { ...PASS, lock_changed: true } } });
  assert.match(locked.reason, /uv\.lock or pyproject\.toml changed, so a newly locked package counts as known/);
});

test('not_checked names the reason or the files that do not parse', () => {
  const noBase = importsAdvice({ report: { imports: { version: 1, result: 'not_checked', reason: 'no base commit', added: [], unknown: [], unparsed: [], lock_changed: false } } });
  assert.equal(noBase.status, 'unknown');
  assert.match(noBase.reason, /not checked: no base commit/);
  const unparsed = importsAdvice({ report: { imports: { version: 1, result: 'not_checked', added: [], unknown: [], unparsed: ['src/bank/x.py'], lock_changed: false } } });
  assert.match(unparsed.reason, /not checked: src\/bank\/x\.py does not parse/);
});

test('no report or no imports block gives no check; a malformed block is advice that says so', () => {
  assert.equal(importsAdvice({}), null);
  assert.equal(importsAdvice({ report: { tests: [] } }), null);
  for (const bad of [null, 'pass', [], { result: 'maybe' }, { result: 'unknown_import', unknown: 'requests' }, { result: 'pass', added: 'x' }]) {
    const a = importsAdvice({ report: { imports: bad } });
    assert.equal(a.advisory, true, JSON.stringify(bad));
    assert.equal(a.status, 'unknown', JSON.stringify(bad));
    assert.match(a.reason, /^advice, not counted: the imports block is malformed/, JSON.stringify(bad));
  }
});

test('a check that throws is still advisory; claims without a CI report get no imports check', () => {
  const block = { ...PASS };
  Object.defineProperty(block, 'result', { get() { throw new Error('boom'); }, enumerable: true });
  const ctx = { report: { imports: block } };
  const v = verify({ id: 'x', type: 'acs' }, { ticket: { key: 'BANK-4', acceptanceCriteria: [] }, ...ctx });
  assert.equal(v.checks.some((k) => k.name === 'imports_known'), false, 'acs has no imports check');
  const r = verify({ id: 'x', type: 'ready' }, { ticket: { key: 'BANK-4', acceptanceCriteria: [] }, ...ctx });
  const a = r.checks.find((k) => k.name === 'imports_known');
  assert.equal(a.advisory, true);
  assert.match(a.reason, /threw/);
});

test('a supported done claim keeps its result and evidence decision with an unknown import', () => {
  const ctx = { ticket: { key: 'BANK-4', acceptanceCriteria: [] }, report: { imports: UNKNOWN } };
  for (const type of ['ready', 'fixed', 'done']) {
    const without = verify({ id: 'x', type }, { ...ctx, report: {} });
    const with_ = verify({ id: 'x', type }, ctx);
    assert.equal(with_.result, without.result, type);
    assert.equal(with_.reason, without.reason, type);
  }
});
