// Definition of done (DESIGN 15a-15d): the evidence record and its write. The check rules are in
// fixtures/S59.json.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildDoneEvidence, formatEvidence } from '../src/verifier/evidence.js';
import { verify } from '../src/verifier/verdict.js';
import { verifyClaim } from '../src/verify-claim.js';

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

test('the evidence record holds every part that DESIGN 15d lists, and no model text', () => {
  const ctx = ctxOf(0);
  const verdict = verify({ id: 'd1', type: 'done' }, ctx);
  const e = buildDoneEvidence({ id: 'd1', type: 'done' }, ctx, verdict.checks);
  assert.equal(e.ticket, 'BANK-4');
  assert.equal(e.claimId, 'd1');
  assert.deepEqual(e.acs.map((a) => [a.acId, a.base.outcome, a.base.excType, a.head.outcome]), [
    ['AC1', 'failed', 'AssertionError', 'passed'],
    ['AC2', 'failed', 'AssertionError', 'passed'],
  ]);
  assert.deepEqual(e.fullSuite, { outcome: 'passed', passed: 3, failed: 0 });
  assert.equal(e.testsNotRemoved, 'pass');
  assert.deepEqual(e.coverage, { changedCovered: 18, changedExecutable: 20, headTotal: 91, baseTotal: 90.8 });
  assert.equal(e.headSha, ctx.pr.headSha);
  assert.equal(e.mergeSha, ctx.mergeSha);
  assert.equal(e.ciRunUrl, 'https://github.com/ysant77/yms-bank-demo/actions/runs/101');
  assert.deepEqual(e.adoptedChecks, []);
  assert.deepEqual(e.humanDecisions, []);
  assert.match(e.hash, /^[0-9a-f]{64}$/);
  assert.equal(buildDoneEvidence({ id: 'd1', type: 'done' }, ctx, verdict.checks).hash, e.hash);
  assert.match(formatEvidence(e), /AC1 test_BANK4_concurrent_withdrawals_20_threads: base failed \(AssertionError\), head passed/);
});

test('a ticket with no code AC gets a record without code parts', () => {
  const ctx = { ticket: { key: 'BANK-65', type: 'Story', acceptanceCriteria: [{ acId: 'AC1', check: { type: 'subtasks_done', args: [] } }], subtasks: [] } };
  const verdict = verify({ id: 'p', type: 'done' }, ctx);
  assert.equal(verdict.result, 'supported', verdict.reason);
  const e = buildDoneEvidence({ id: 'p', type: 'done' }, ctx, verdict.checks);
  assert.equal(e.codeWork, false);
  assert.equal(e.coverage, null);
});

test('a done verdict writes the evidence to the audit chain before the comment, and the comment shows it', async () => {
  const order = [];
  const store = new Map();
  const ctx = ctxOf(0);
  const d = {
    store: { get: async (k) => structuredClone(store.get(k)), set: async (k, v) => { store.set(k, structuredClone(v)); }, delete: async (k) => { store.delete(k); } },
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: null }),
    collectJira: async () => ctx.ticket,
    collectGithub: async () => { const { ticket, config, ...g } = ctx; return g; },
    collectPrStats: async () => ({ patches: ctx.prPatches }),
    addVerdictProperty: async () => { order.push('property'); return true; },
    appendAudit: async (e) => { order.push(e.event); return { seq: order.length, hash: 'abcdef0123456789abcdef' }; },
    addComment: async (k, t) => { order.push('comment'); order.text = t; },
    findComment: async () => false,
  };
  const v = await verifyClaim({ issueKey: 'BANK-4', claim: { id: 'BANK-4:1', type: 'done' } }, d);
  assert.equal(v.result, 'supported', v.reason);
  assert.deepEqual(order.filter((x) => typeof x === 'string'), ['property', 'verdict', 'done_evidence', 'comment']);
  assert.match(order.text, /Evidence record \(hash [0-9a-f]{12}\)/);
  assert.match(order.text, /changed lines covered: 18 of 20/);
});

test('a merged PR gives the merge commit, and the main report stands for the merge result', async () => {
  const { collectGithub } = await import('../src/github-evidence.js');
  const M = 'e'.repeat(40);
  const main = { schema: 'aat-ci-report/1', head_sha: M, workflow_files: {} };
  const fetchFn = async (url) => {
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    const body = /\/pulls\?/.test(url) ? (page === 1 ? [{ number: 14, title: 'BANK-4 fix', state: 'closed', merged_at: '2026-11-20T11:00:00Z', merge_commit_sha: M, head: { ref: 'b', sha: 'd'.repeat(40), repo: { full_name: 'ysant77/yms-bank-demo' } } }] : [])
      : /\/pulls\/14\/files/.test(url) ? []
      : /contents\/main\.json/.test(url) ? { content: Buffer.from(JSON.stringify(main)).toString('base64') }
      : null;
    return body === null ? { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } } : { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
  };
  const gh = await collectGithub({ repo: 'ysant77/yms-bank-demo', key: 'BANK-4', fetchFn });
  assert.equal(gh.pr.merged, true);
  assert.equal(gh.mergeSha, M);
  assert.equal(gh.mergeReport.head_sha, M);
});
