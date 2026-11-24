// Set 7 fault 3, seen again in set 8 (Y06, Y14; development data, 24 Nov): a test that a later PR
// of another ticket added to main was read as "removed without approval" by this PR, because the
// base side of the check is the main report at the claim. A PR can remove a test only from a file
// that it changes, renames or deletes, so a main-report test of another module does not count.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testsNotRemoved } from '../src/verifier/checks.js';

const T = (id) => ({ id, outcome: 'passed' });
const ctxOf = ({ prFiles, head, base }) => ({
  ticket: { key: 'BANK-6', acceptanceCriteria: [] },
  prFiles,
  baseReport: { tests: base.map(T) },
  report: { tests: head.map(T) },
  approvals: null,
});
const BASE = ['tests/test_api.py::test_a', 'tests/test_ping.py::test_ping_answers_ok'];

test('a main-report test in a module that the PR does not touch is not read as removed', () => {
  const r = testsNotRemoved(ctxOf({ prFiles: ['src/bank/api.py', 'tests/test_api.py'], head: ['tests/test_api.py::test_a', 'tests/test_api.py::test_new'], base: BASE }));
  assert.equal(r.status, 'pass', r.reason);
});

test('a test that the PR removes from a module it changes is still a removal', () => {
  const r = testsNotRemoved(ctxOf({ prFiles: ['tests/test_api.py'], head: ['tests/test_ping.py::test_ping_answers_ok'], base: BASE }));
  assert.equal(r.status, 'fail');
  assert.match(r.reason, /removed without approval: test_a/);
});

test('a deleted or renamed test module is a module the PR touches', () => {
  const deleted = testsNotRemoved(ctxOf({ prFiles: ['tests/test_ping.py'], head: ['tests/test_api.py::test_a'], base: BASE }));
  assert.match(deleted.reason, /removed without approval: test_ping_answers_ok/);
});

test('with no readable PR file list the check is as before', () => {
  const r = testsNotRemoved(ctxOf({ prFiles: null, head: ['tests/test_api.py::test_a'], base: BASE }));
  assert.match(r.reason, /removed without approval: test_ping_answers_ok/);
});
