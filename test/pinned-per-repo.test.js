// The pinned block is required per repository (execution plan 19 Nov, rollout step 1 of PR 25).
// A repository on the list runs the bank's pinned step, so a CI report without the block gives
// unknown. Every other repository (a customer repository, a demo copy before the step) keeps the
// check advisory. The list is app configuration, never read from a report.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { configFor, decide, VERIFY_CONFIG } from '../src/verify-claim.js';
import { fetchFrom } from './helpers/recorded-github.js';

const LISTED = ['ysant77/yms-bank-demo'];

test('a listed repository requires the block; names compare without case', () => {
  assert.equal(configFor('ysant77/yms-bank-demo', LISTED).pinnedRequired, true);
  assert.equal(configFor('YSANT77/YMS-Bank-Demo', LISTED).pinnedRequired, true);
});

test('an unlisted repository, or none, keeps the check advisory', () => {
  for (const repo of ['ysant77/yms-bank-demo-cases', 'acme/payments', '', null, undefined]) {
    assert.equal(configFor(repo, LISTED).pinnedRequired, false, String(repo));
  }
});

test('configFor keeps every other setting of the app configuration', () => {
  const c = configFor('ysant77/yms-bank-demo', LISTED);
  assert.deepEqual({ ...c, pinnedRequired: VERIFY_CONFIG.pinnedRequired, provenanceRequired: VERIFY_CONFIG.provenanceRequired }, VERIFY_CONFIG);
});

// Rollout step 6 (19 Nov): the two bank repositories run the pinned step, and their real runs
// passed the gate (bank 356cb19; demo PRs 1 to 4, 6 and 7). Every other repository is advisory.
test('the deployed list names the two bank repositories; any other repository is advisory', () => {
  assert.deepEqual(VERIFY_CONFIG.pinnedRequiredRepos, ['ysant77/yms-bank-demo', 'ysant77/yms-bank-demo-cases']);
  assert.equal(configFor('ysant77/yms-bank-demo').pinnedRequired, true);
  assert.equal(configFor('ysant77/yms-bank-demo-cases').pinnedRequired, true);
  assert.equal(configFor('acme/payments').pinnedRequired, false);
  assert.equal(configFor('ysant77/yms-bank-demo-other').pinnedRequired, false);
});

test('a malformed list requires nothing it does not name', () => {
  for (const list of [null, 'ysant77/yms-bank-demo', [null, 7]]) {
    assert.equal(configFor('acme/payments', list).pinnedRequired, false, JSON.stringify(list));
  }
});

// decide() reads the setting for the configured repository (real U01 evidence recorded before the
// pinned block and the report markers; report provenance is set advisory here, so only the pinned
// rule decides).
async function pinnedCheckFor(repo, listed) {
  const saved = [VERIFY_CONFIG.pinnedRequiredRepos, VERIFY_CONFIG.provenanceRequiredRepos];
  VERIFY_CONFIG.pinnedRequiredRepos = listed;
  VERIFY_CONFIG.provenanceRequiredRepos = [];
  const c = JSON.parse(readFileSync(new URL('../fixtures/before-markers/U01.json', import.meta.url), 'utf8'));
  const log = console.log;
  console.log = () => {};
  try {
    const { record } = await decide({ issueKey: c.ticket.key, claim: { id: 'p', type: c.claim } }, {
      collectJira: async () => ({ subtasks: [], links: [], ...structuredClone(c.ticket) }),
      env: () => ({ repo, token: 'local' }),
      collectGithub, collectPrStats, fetchFn: fetchFrom(c.github), collectReviews: async () => [],
    });
    return { result: record.result, check: record.checks.find((x) => x.name === 'pinned_tests_hold') };
  } finally {
    console.log = log;
    [VERIFY_CONFIG.pinnedRequiredRepos, VERIFY_CONFIG.provenanceRequiredRepos] = saved;
  }
}

test('decide: a listed repository with no pinned block gives cannot_verify; an unlisted one stays supported', async () => {
  const listed = await pinnedCheckFor('ysant77/yms-bank-demo', ['ysant77/yms-bank-demo']);
  assert.equal(listed.check.status, 'unknown');
  assert.equal(listed.result, 'cannot_verify');
  const unlisted = await pinnedCheckFor('ysant77/yms-bank-demo', []);
  assert.equal(unlisted.result, 'supported');
  assert.equal(unlisted.check.advisory, true);
});
