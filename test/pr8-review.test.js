// PR 8 review findings on the definition of done.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as checks from '../src/verifier/checks.js';
import { verify } from '../src/verifier/verdict.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/S59.json', import.meta.url), 'utf8'));
const defaults = JSON.parse(readFileSync(new URL('../fixtures/_defaults.json', import.meta.url), 'utf8'));
const ctxOf = (i) => {
  const c = { ...defaults, ...structuredClone(fixture.steps[i].context) };
  const run = c.workflowRuns[0];
  c.report.workflow_files = defaults.baseWorkflowFiles;
  c.mergeReport.workflow_files = defaults.baseWorkflowFiles;
  c.reportComment = { createdAt: run.createdAt, updatedAt: run.createdAt };
  return c;
};

// An open, unmerged PR: the work is not on main.
const openPr = (ctx) => {
  ctx.pr = { ...ctx.pr, state: 'open', merged: false, mergeSha: null };
  ctx.mergeSha = null;
  return ctx;
};

// Finding 7: an AC that needs CI evidence is code work, whatever the ticket type.
for (const [type, args, extra] of [
  ['metric_at_least', ['recall', 0.5], (c) => { c.report.metrics = { recall: 0.8 }; }],
  ['metric_at_most', ['latency_ms', 100], (c) => { c.report.metrics = { latency_ms: 20 }; }],
  ['ci_green', [], () => {}],
  ['path_absent', ['src/old.py'], (c) => { c.headPaths = ['src/new.py']; }],
]) {
  test(`a Story with only a ${type} AC is not done while its PR is open`, () => {
    const ctx = openPr(ctxOf(0));
    ctx.ticket = { key: 'BANK-4', type: 'Story', acceptanceCriteria: [{ acId: 'AC1', check: { type, args } }] };
    extra(ctx);
    assert.equal(checks.hasCodeWork(ctx), true);
    const v = verify({ id: 'd7', type: 'done' }, ctx);
    assert.notEqual(v.result, 'supported', v.reason);
    assert.equal(v.checks.find((k) => k.name === 'on_main')?.status, 'fail');
  });
}

test('a ticket with only sub-task, blocker, link or manual ACs still has no code work', () => {
  const acs = ['subtasks_done', 'blocked_by_done', 'link_exists', 'manual'].map((type, i) => ({ acId: `AC${i}`, check: { type, args: [] } }));
  assert.equal(checks.hasCodeWork({ ticket: { key: 'BANK-65', type: 'Story', acceptanceCriteria: acs } }), false);
});
