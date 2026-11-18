// The bank repository runs the pinned step (bank main 60f141e), so the app requires the pinned
// block (VERIFY_CONFIG.pinnedRequired). A recording without the block is cannot_verify; the same
// recording with the real block from the bank step is supported.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { VERIFY_CONFIG, decide } from '../src/verify-claim.js';
import { fetchFrom } from './helpers/recorded-github.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../fixtures/judge/${name}.json`, import.meta.url), 'utf8'));

async function verdictOf(c, deps = {}) {
  const log = console.log;
  console.log = () => {};
  try {
    return await decide({ issueKey: c.ticket.key, claim: { id: 'r', type: c.claim } }, {
      collectJira: async () => ({ subtasks: [], links: [], ...structuredClone(c.ticket) }),
      env: () => ({ repo: 'ysant77/yms-bank-demo', token: 'local' }),
      collectGithub, collectPrStats, fetchFn: fetchFrom(c.github), collectReviews: async () => [], ...deps,
    });
  } finally {
    console.log = log;
  }
}

test('the bank repository requires the pinned block', () => {
  assert.equal(VERIFY_CONFIG.pinnedRequired, true);
});

test('U01 recorded before the step (no pinned block): cannot_verify, with the reason', async () => {
  const { record } = await verdictOf(load('U01'));
  assert.equal(record.result, 'cannot_verify');
  assert.match(record.reason, /no pinned block/);
});

test('U01 with the pinned block of the bank step: supported, and the check is proved', async () => {
  const c = load('U01');
  c.github.report.pinned = load('U01-pinned').pinned;
  const { record, verdict } = await verdictOf(c);
  assert.equal(record.result, 'supported', record.reason);
  assert.equal(verdict.checks.find((k) => k.name === 'pinned_tests_hold').status, 'pass');
});

test('an injected configuration is used only when given; the default is VERIFY_CONFIG', async () => {
  const pre = await verdictOf(load('U01'), { config: { ...VERIFY_CONFIG, pinnedRequired: false } });
  assert.equal(pre.record.result, 'supported');
});
