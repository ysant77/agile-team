// Review of 24 Nov, audit order (P1): a failure between two writes must not leave a side effect
// with no audit event, and a retry must not write a second event. Each test makes one store write
// fail once, then retries the same operation, as the queue or the user would.
// - verifyClaim: the audit event is written, then the progress save fails; the retry wrote the
//   event again (verdict and done_evidence).
// - createTicket: the Jira issue is made, then the audit append fails; the retry found the "done"
//   key and never wrote ticket.created.
// - recordFinding: the finding is stored, then the audit append fails; the retry took the
//   duplicate path and never wrote finding.recorded.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import api from '@forge/api';
import { kvs } from '@forge/kvs';
import { appendAudit, readAudit } from '../src/audit-store.js';
import { verifyClaim } from '../src/verify-claim.js';
import { createTicket } from '../src/index.js';

// A store whose next write that matches `when` throws once (a lost write or a crash).
function faultyStore() {
  const m = new Map();
  const faults = [];
  return {
    map: m,
    failOnce: (when) => faults.push(when),
    get: async (k) => structuredClone(m.get(k)),
    set: async (k, v, opts) => {
      const i = faults.findIndex((f) => f(k, v));
      if (i >= 0) { faults.splice(i, 1); throw new Error(`injected failure on ${k}`); }
      if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && m.has(k)) throw new Error('key exists');
      m.set(k, structuredClone(v));
    },
    delete: async (k) => { m.delete(k); },
  };
}
const events = (m, name) => [...m.entries()].filter(([k]) => /^audit:\d+$/.test(k)).map(([, v]) => v).filter((e) => e.event === name);

function claimDeps(store, comments) {
  return {
    store,
    env: () => ({ repo: null }),
    collectJira: async () => ({ key: 'BANK-1', type: 'Story', acceptanceCriteria: [], subtasks: [], links: [], labels: [] }),
    addVerdictProperty: async () => true,
    appendAudit: (e) => appendAudit(e, store),
    readAudit: (from, n) => readAudit(from, n, store),
    addComment: async (_k, t) => { comments.push(t); },
    findComment: async (_k, marker) => comments.some((t) => t.includes(marker)),
    releaseClaim: async () => {},
  };
}
const quiet = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

test('verifyClaim: the progress save after the verdict event fails; the retry writes no second verdict event', async () => {
  const store = faultyStore();
  const comments = [];
  // The save that records the audit step (steps.audit set) fails once.
  store.failOnce((k, v) => k.startsWith('claim-progress:') && v?.steps?.audit && !v?.steps?.latestDone);
  const claim = { id: 'BANK-1:11', type: 'done', by: 'dev-b' };
  await quiet(() => assert.rejects(verifyClaim({ issueKey: 'BANK-1', claim }, claimDeps(store, comments)), /injected failure/));
  await quiet(() => verifyClaim({ issueKey: 'BANK-1', claim }, claimDeps(store, comments)));
  assert.equal(events(store.map, 'verdict').length, 1);
  assert.equal(comments.length, 1);
});

test('verifyClaim: the progress save after the evidence event fails; the retry writes no second done_evidence event', async () => {
  const store = faultyStore();
  const comments = [];
  store.failOnce((k, v) => k.startsWith('claim-progress:') && v?.steps?.evidence && !v?.steps?.commentMarker);
  const claim = { id: 'BANK-1:12', type: 'done', by: 'dev-b' };
  await quiet(() => assert.rejects(verifyClaim({ issueKey: 'BANK-1', claim }, claimDeps(store, comments)), /injected failure/));
  await quiet(() => verifyClaim({ issueKey: 'BANK-1', claim }, claimDeps(store, comments)));
  assert.equal(events(store.map, 'done_evidence').length, 1);
  assert.equal(events(store.map, 'verdict').length, 1);
});

const pathOf = (r) => r?.value_ ?? String(r);
function mockJiraUser(t) {
  const posts = [];
  t.mock.method(api, 'asUser', () => ({
    requestJira: async (route, opts) => {
      const path = pathOf(route);
      if (path.startsWith('/rest/api/3/myself')) return { ok: true, status: 200, json: async () => ({ accountId: 'pm-1' }) };
      if (path === '/rest/api/3/field') return { ok: true, status: 200, json: async () => [] };
      if (path === '/rest/api/3/issue' && opts?.method === 'POST') { posts.push(1); return { ok: true, status: 201, json: async () => ({ key: `BANK-${300 + posts.length}` }) }; }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    },
  }));
  return posts;
}
const DRAFT = { request: 'Add a statement export', projectKey: 'BANK', summary: 'Export a statement', description: 'A person downloads a statement.', storyPoints: 3, issueType: 'Task' };

test('createTicket: the audit append after the Jira create fails; the retry makes no second issue and writes ticket.created once', async (t) => {
  const store = faultyStore();
  t.mock.method(kvs, 'get', store.get);
  t.mock.method(kvs, 'set', store.set);
  t.mock.method(kvs, 'delete', store.delete);
  const posts = mockJiraUser(t);
  store.failOnce((k, v) => /^audit:\d+$/.test(k) && v?.event === 'ticket.created');
  await quiet(() => assert.rejects(createTicket({ ...DRAFT }), /injected failure/));
  const again = await quiet(() => createTicket({ ...DRAFT }));
  assert.equal(again.ok, true, again.error);
  assert.equal(posts.length, 1);
  assert.equal(events(store.map, 'ticket.created').length, 1);
});

// Lead review of 24 Nov: the finding link is written between the "done" key and the audit event.
// A stop after "done" and before the link must be repaired by the retry: link and event both
// written, once, and no second issue.
test('createTicket: the finding link write after "done" fails; the retry writes the link and ticket.created once', async (t) => {
  const store = faultyStore();
  t.mock.method(kvs, 'get', store.get);
  t.mock.method(kvs, 'set', store.set);
  t.mock.method(kvs, 'delete', store.delete);
  const id = 'F-0123456789ab-89abcdef';
  store.map.set(`finding:${id}`, { findingId: id, by: 'pm-1', kind: 'defect', status: 'unconfirmed', hypothesis: 'the export misses the last line.',
    reproducer: { testName: 'test_export_has_every_line', file: 'tests/test_export.py', asserts: 'every line is exported' } });
  const posts = mockJiraUser(t);
  store.failOnce((k) => k === `finding-links:${id}`);
  await quiet(() => assert.rejects(createTicket({ ...DRAFT, findingId: id }), /injected failure/));
  const again = await quiet(() => createTicket({ ...DRAFT, findingId: id }));
  assert.equal(again.ok, true, again.error);
  assert.equal(posts.length, 1);
  assert.deepEqual(store.map.get(`finding-links:${id}`), [again.key]);
  assert.equal(events(store.map, 'ticket.created').length, 1);
});
