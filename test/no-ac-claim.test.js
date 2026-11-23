// A plain work item with no acceptance criteria and no sub-tasks has nothing to check, so a claim
// on it is Cannot verify, not Contradicted (lead review of 23 Nov, finding 2; benchmark B13).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { decide } from '../src/verify-claim.js';
import { verify } from '../src/verifier/verdict.js';

const plain = (over = {}) => ({ key: 'KAN-1', type: 'Task', labels: [], subtasks: [], links: [], acceptanceCriteria: [], signoff: null, ...over });
const NOTHING = /^nothing to check: the work item has no acceptance criteria/;

test('a done claim on a plain work item with no repository is Cannot verify', () => {
  const v = verify({ id: 'c', type: 'done', by: 'a' }, { ticket: plain(), pr: null, workflowRuns: [], deployRuns: [], config: {} });
  assert.equal(v.result, 'cannot_verify');
  assert.match(v.reason, NOTHING);
  assert.equal(v.checks.find((k) => k.name === 'ac_mapped').status, 'unknown');
});

test('every claim type that maps ACs gives Cannot verify on a plain work item', () => {
  for (const type of ['done', 'fixed', 'ready']) {
    const v = verify({ id: 'c', type, by: 'a' }, { ticket: plain(), pr: null, workflowRuns: [], deployRuns: [], config: {} });
    assert.equal(v.result, 'cannot_verify', type);
    assert.match(v.reason, NOTHING, type);
  }
});

const ok = (body) => ({ ok: true, status: 200, json: async () => body, headers: { get: () => '50' } });
const notFound = { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };

test('the review repro: a plain work item, a reachable repository and no PR give Cannot verify', async (t) => {
  t.mock.method(console, 'log', () => {});
  const fetchFn = async (u) => (/contents\/main.json|branches|deploy.yml/.test(u) ? notFound : ok(/actions\/runs/.test(u) ? { workflow_runs: [] } : []));
  const d = { collectJira: async () => plain(), env: () => ({ repo: 'o/r' }), collectGithub, collectPrStats, collectReviews: async () => [], fetchFn };
  const { verdict } = await decide({ issueKey: 'KAN-1', claim: { id: 'c', type: 'done', by: 'a' } }, d);
  assert.equal(verdict.result, 'cannot_verify');
  assert.match(verdict.reason, NOTHING);
});

test('no AC with sub-tasks that are not all done stays Contradicted by the sub-task check', () => {
  const ticket = plain({ subtasks: [{ key: 'KAN-2', statusCategory: 'indeterminate' }] });
  const v = verify({ id: 'c', type: 'done', by: 'a' }, { ticket, pr: null, workflowRuns: [], deployRuns: [], config: {} });
  assert.equal(v.result, 'contradicted');
  assert.equal(v.checks.find((k) => k.name === 'subtasks_done').status, 'fail');
});
