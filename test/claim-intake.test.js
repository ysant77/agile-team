// F9 (review of 16 Nov): a repeated comment event is queued once, and claims are rate limited.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { admitClaim } from '../src/claim-intake.js';

const store = () => {
  const m = new Map();
  return { get: async (k) => m.get(k), set: async (k, v) => { m.set(k, v); } };
};
const now = Date.parse('2026-11-16T10:20:00Z');

test('F9: the same comment event is admitted once', async () => {
  const s = store();
  assert.equal((await admitClaim({ issueKey: 'BANK-1', commentId: '1', now }, s)).ok, true);
  assert.equal((await admitClaim({ issueKey: 'BANK-1', commentId: '1', now }, s)).ok, false);
});

test('F9: claims are capped per work item and per site each hour', async () => {
  const s = store();
  const limits = { perIssuePerHour: 2, perSitePerHour: 3 };
  assert.equal((await admitClaim({ issueKey: 'BANK-1', commentId: '1', now }, s, limits)).ok, true);
  assert.equal((await admitClaim({ issueKey: 'BANK-1', commentId: '2', now }, s, limits)).ok, true);
  assert.match((await admitClaim({ issueKey: 'BANK-1', commentId: '3', now }, s, limits)).reason, /BANK-1 reached 2/);
  assert.equal((await admitClaim({ issueKey: 'BANK-2', commentId: '4', now }, s, limits)).ok, true);
  assert.match((await admitClaim({ issueKey: 'BANK-3', commentId: '5', now }, s, limits)).reason, /site reached 3/);
  // The next hour starts a new count.
  assert.equal((await admitClaim({ issueKey: 'BANK-1', commentId: '6', now: now + 3600 * 1000 }, s, limits)).ok, true);
});
