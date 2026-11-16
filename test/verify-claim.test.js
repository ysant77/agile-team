// F6 and F10 (review of 16 Nov): a retried job posts one verdict, and a GitHub error is not
// evidence that no PR exists.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyClaim } from '../src/verify-claim.js';

function fakeStore() {
  const data = new Map();
  return { data, get: async (k) => structuredClone(data.get(k)), set: async (k, v) => { data.set(k, structuredClone(v)); } };
}

function deps(over = {}) {
  const posted = { comments: [], properties: [], audits: [] };
  const d = {
    store: fakeStore(),
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: null }),
    collectJira: async () => ({ key: 'BANK-1', type: 'Story', acceptanceCriteria: [] }),
    collectGithub: async () => { throw new Error('GitHub /repos/x/pulls: HTTP 404'); },
    addVerdictProperty: async (k, r) => { posted.properties.push(r); return true; },
    appendAudit: async (e) => { posted.audits.push(e); return { seq: posted.audits.length, hash: 'abcdef0123456789' }; },
    addComment: async (k, t) => { posted.comments.push(t); },
    findComment: async (k, marker) => posted.comments.some((t) => t.includes(marker)),
    ...over,
  };
  return { d, posted };
}

const claim = { id: 'BANK-1:10001', type: 'fixed', text: '' };

test('F10: a GitHub error turns a missing PR into cannot_verify, not contradicted', async () => {
  const { d, posted } = deps();
  const v = await verifyClaim({ issueKey: 'BANK-1', claim }, d);
  assert.equal(v.result, 'cannot_verify');
  assert.match(v.reason, /code host not reachable: GitHub .*HTTP 404/);
  assert.equal(posted.comments.length, 1);
});

test('F6: a retry after a failed comment posts the verdict once and reuses the first verdict', async () => {
  let fail = true;
  const { d, posted } = deps({
    addComment: async (k, t) => {
      if (fail) { fail = false; throw new Error('Jira 503'); }
      posted.comments.push(t);
    },
  });
  await assert.rejects(verifyClaim({ issueKey: 'BANK-1', claim }, d), /Jira 503/);
  // The evidence changes before the retry; the retry must not decide again.
  d.collectGithub = async () => ({ pr: null, workflowRuns: [], deployRuns: [] });
  const v = await verifyClaim({ issueKey: 'BANK-1', claim }, d);
  assert.equal(v.result, 'cannot_verify');
  assert.equal(posted.properties.length, 1);
  assert.equal(posted.audits.length, 1);
  assert.equal(posted.comments.length, 1);
  // A third delivery of the same job does nothing.
  await verifyClaim({ issueKey: 'BANK-1', claim }, d);
  assert.equal(posted.comments.length, 1);
});
