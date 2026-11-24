// Set 7 X01 (development data, 24 Nov): a pytest.raises block that ends with DID NOT RAISE on base
// is a failure by an assertion. The case files of sets 6 and 7 count it so. Narrow: only pytest's
// own "Failed: DID NOT RAISE ..." counts; any other Failed (pytest.fail) or error stays unknown.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { reproduced } from '../src/verifier/checks.js';
import { withReader } from './helpers/reader.js';
import './helpers/unlisted.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/S59.json', import.meta.url), 'utf8'));
const defaults = JSON.parse(readFileSync(new URL('../fixtures/_defaults.json', import.meta.url), 'utf8'));
function ctxWithBase(base) {
  const c = { ...defaults, ...structuredClone(fixture.steps[0].context) };
  const run = c.workflowRuns[0];
  c.report.workflow_files = defaults.baseWorkflowFiles;
  c.mergeReport.workflow_files = defaults.baseWorkflowFiles;
  c.reportComment = { createdAt: run.createdAt, updatedAt: run.createdAt };
  for (const t of c.report.repro.tests) t.base = structuredClone(base);
  return withReader(c);
}

test('pytest DID NOT RAISE on base counts as a failure by an assertion', () => {
  const r = reproduced(ctxWithBase({ outcome: 'failed', exc_type: 'Failed', exc_message: 'Failed: DID NOT RAISE LedgerError' }));
  assert.equal(r.status, 'pass', r.reason);
  const plain = reproduced(ctxWithBase({ outcome: 'failed', exc_type: 'Failed', exc_message: "Failed: DID NOT RAISE <class 'ValueError'>" }));
  assert.equal(plain.status, 'pass', plain.reason);
});

test('any other Failed, or another error, still does not count', () => {
  for (const base of [
    { outcome: 'failed', exc_type: 'Failed', exc_message: 'Failed: the code is wrong' },
    { outcome: 'failed', exc_type: 'Failed', exc_message: 'did not raise' },
    { outcome: 'failed', exc_type: 'Failed' },
    { outcome: 'failed', exc_type: 'TypeError', exc_message: 'Failed: DID NOT RAISE LedgerError' },
  ]) {
    const r = reproduced(ctxWithBase(base));
    assert.equal(r.status, 'unknown', JSON.stringify(base));
    assert.match(r.reason, /not by an assertion/);
  }
});

test('an AssertionError on base passes as before', () => {
  assert.equal(reproduced(ctxWithBase({ outcome: 'failed', exc_type: 'AssertionError' })).status, 'pass');
});
