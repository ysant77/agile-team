// Set 7 X09 (development data, 24 Nov): the merge-result check passed although the AC test failed
// on the merge commit. No required tests were configured (mergeRequiredTests is [] in
// verify-claim.js since 17 Nov), so merged_clean read only removed tests and migrations. Now it
// also needs the ticket's own AC tests to pass in the report for the merge commit.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergedClean } from '../src/verifier/checks.js';

const CI = '.github/workflows/ci.yml';
const MERGE = 'c'.repeat(40);
const AC = 'tests/test_api.py::test_statement_refuses_a_future_to';
const OTHER = 'tests/test_api.py::test_statement_to_is_set_to_today';
const report = (tests) => ({ head_sha: MERGE, workflow_files: { [CI]: 'x' }, migrations: [], tests });
const ctxOf = (mergeTests, acs = [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_statement_refuses_a_future_to'] } }]) => ({
  ticket: { key: 'BENCH-709', acceptanceCriteria: acs },
  pr: { number: 9, headSha: 'a'.repeat(40) }, mergeSha: MERGE, mergeReport: report(mergeTests),
  baseReport: report([{ id: OTHER, outcome: 'passed' }]),
  reportAuthor: 'github-actions[bot]', baseWorkflowFiles: { [CI]: 'x' }, mergeRequiredTests: [], config: { requiredWorkflowPaths: [CI] },
});

test('an AC test that failed in the report for the merge commit fails the merge result', () => {
  const r = mergedClean(ctxOf([{ id: AC, outcome: 'failed' }, { id: OTHER, outcome: 'passed' }]));
  assert.equal(r.status, 'fail', r.reason);
  assert.match(r.reason, /merge result: test_statement_refuses_a_future_to: failed/);
});

test('an AC test that passed there keeps the merge result clean', () => {
  const r = mergedClean(ctxOf([{ id: AC, outcome: 'passed' }, { id: OTHER, outcome: 'passed' }]));
  assert.equal(r.status, 'pass', r.reason);
});

test('every name of a multi-test AC is required; a missing one fails', () => {
  const acs = [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_a', 'test_b'] } }];
  const r = mergedClean(ctxOf([{ id: 'tests/t.py::test_a', outcome: 'passed' }, { id: OTHER, outcome: 'passed' }], acs));
  assert.equal(r.status, 'fail', r.reason);
  assert.match(r.reason, /test_b is missing from the report/);
});

test('an AC with no test check adds nothing', () => {
  const acs = [{ acId: 'AC1', check: { type: 'subtasks_done', args: [] } }];
  assert.equal(mergedClean(ctxOf([{ id: OTHER, outcome: 'passed' }], acs)).status, 'pass');
});
