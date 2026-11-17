// Follow-up to the PR 8 merge: the review hold is tested for a "done" claim that the done gate
// supports (a merged PR, CI green on head and on the merge result), not only for ready and fixed.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decide } from '../src/verify-claim.js';
import { withReader } from './helpers/reader.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/S59.json', import.meta.url), 'utf8'));
const defaults = JSON.parse(readFileSync(new URL('../fixtures/_defaults.json', import.meta.url), 'utf8'));

// The S59 step 0 context (PR 14 merged) as the GitHub reader returns it.
function github() {
  const c = withReader({ ...defaults, ...structuredClone(fixture.steps[0].context) });
  const run = c.workflowRuns[0];
  c.report.workflow_files = defaults.baseWorkflowFiles;
  c.mergeReport.workflow_files = defaults.baseWorkflowFiles;
  c.reportComment = { createdAt: run.createdAt, updatedAt: run.createdAt };
  delete c.ticket;
  return c;
}

const HEAD = github().pr.headSha;
const ticket = { key: 'BANK-4', type: 'Story', labels: [], subtasks: [], links: [], acceptanceCriteria: [{ acId: 'AC1', check: { type: 'ci_green', args: [] } }] };

const review = (headSha = HEAD, severity = 'blocking') => ({
  label: 'Review (not verified)', outcome: 'review', guard: null, prNumber: 14, headSha,
  review: { findings: [{ hunk: 'P14:H1', file: 'src/bank/accounts.py', line: 12, severity, ac: 'AC1', text: 'The guard is skipped when the amount is zero.' }], risks: [], proposedChecks: [] },
});

const deps = (reviews) => ({
  env: () => ({ repo: 'ysant77/yms-bank-demo', token: null }),
  collectJira: async () => structuredClone(ticket),
  collectGithub: async () => github(),
  collectPrStats: async () => ({ patches: github().prPatches }),
  collectReviews: async () => reviews,
  readAudit: async () => [],
  fetchFn: null,
});

const done = async (reviews) => (await decide({ issueKey: 'BANK-4', claim: { id: 'BANK-4:d', type: 'done', by: 'acc-dev' } }, deps(reviews))).verdict;

test('the done claim on the merged PR is supported without a review', async () => {
  const v = await done([]);
  assert.equal(v.result, 'supported', v.reason);
});

test('a blocking finding on the same head holds a supported done claim', async () => {
  const v = await done([review()]);
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.deepEqual(v.reviewHold, { acs: ['AC1'], headSha: HEAD });
  assert.match(v.reason, /blocking finding/);
});

test('a note, or a blocking finding on another head, does not hold the done claim', async () => {
  assert.equal((await done([review(HEAD, 'note')])).result, 'supported');
  assert.equal((await done([review('c'.repeat(40))])).result, 'supported');
});
