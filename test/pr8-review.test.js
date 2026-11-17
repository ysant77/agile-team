// PR 8 review findings on the definition of done.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as checks from '../src/verifier/checks.js';
import { nextEvent } from '../src/audit.js';
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

test('a Story with only a ci_green AC is done once its PR is merged, with no repro step', () => {
  const ctx = ctxOf(0);
  ctx.ticket = { key: 'BANK-4', type: 'Story', acceptanceCriteria: [{ acId: 'AC1', check: { type: 'ci_green', args: [] } }] };
  const v = verify({ id: 'd7m', type: 'done' }, ctx);
  assert.equal(v.result, 'supported', v.reason);
  assert.equal(v.checks.some((k) => k.name === 'reproduced'), false);
});

// Finding 9: zero changed executable lines while a source file gains code is not a pass.
for (const exec of [0, []]) {
  test(`coverage is unknown when changed_executable is ${JSON.stringify(exec)} and a source file changed`, () => {
    const ctx = ctxOf(0);
    ctx.report.coverage = { ...ctx.report.coverage, changed_executable: exec, changed_covered: 0 };
    const r = checks.coverageOk(ctx);
    assert.equal(r.status, 'unknown', r.reason);
    assert.match(r.reason, exec === 0 ? /src\/bank\/transfers\.py changed code/ : /changed-line counts missing/);
  });
}

test('coverage passes with zero changed executable lines when only tests and comments changed', () => {
  const ctx = ctxOf(0);
  ctx.report.coverage = { ...ctx.report.coverage, changed_executable: 0, changed_covered: 0 };
  ctx.prPatches = { ...ctx.prPatches, 'src/bank/transfers.py': '@@ -1 +1,2 @@\n+# a note\n+' };
  assert.equal(checks.coverageOk(ctx).status, 'pass');
});

// Finding 10: a sign-off counts only when the sign-off button wrote it (an audit event that
// matches the property) and the signer is not the person who made the claim.
const MERGE = 'a'.repeat(40);
const signoffEvent = (over = {}) => nextEvent({ seq: 6, hash: 'f'.repeat(64) }, {
  actor: 'acc-reviewer', event: 'change.signed_off', data: { key: 'BENCH-27', sha: MERGE, reason: 'checked the rounding' }, at: '2026-11-16T12:00:00Z', ...over,
});
const signoffCtx = (over = {}) => ({
  ticket: { key: 'BENCH-27', domain: 'money_semantics', signoff: { by: 'acc-reviewer', sha: MERGE, reason: 'checked the rounding', at: '2026-11-16T12:00:01Z', auditSeq: 7 } },
  pr: { merged: true, mergeSha: MERGE, headSha: 'b'.repeat(40) },
  claimant: 'acc-dev',
  signoffEvent: signoffEvent(),
  ...over,
});

test('a sign-off with a matching audit event by someone other than the claimant passes', () => {
  const r = checks.checkHumanSignoff(signoffCtx());
  assert.equal(r.status, 'pass', r.reason);
});

test('a sign-off written to the issue property without the sign-off button is unknown', () => {
  for (const over of [{ signoffEvent: null }, { signoffEvent: signoffEvent({ actor: 'acc-other' }) },
    { signoffEvent: signoffEvent({ data: { key: 'BENCH-27', sha: 'c'.repeat(40) } }) }, { signoffEvent: signoffEvent({ event: 'requirement.approved' }) },
    { signoffEvent: { ...signoffEvent(), hash: '0'.repeat(64) } }]) {
    const r = checks.checkHumanSignoff(signoffCtx(over));
    assert.equal(r.status, 'unknown', JSON.stringify(over));
    assert.match(r.reason, /audit/);
  }
  const ctx = signoffCtx();
  delete ctx.ticket.signoff.auditSeq;
  assert.equal(checks.checkHumanSignoff(ctx).status, 'unknown');
});

test('a sign-off by the claimant, or with no known claimant, is unknown', () => {
  const self = checks.checkHumanSignoff(signoffCtx({ claimant: 'acc-reviewer' }));
  assert.equal(self.status, 'unknown');
  assert.match(self.reason, /claimant/);
  const none = checks.checkHumanSignoff(signoffCtx({ claimant: null }));
  assert.equal(none.status, 'unknown');
  assert.match(none.reason, /claimant/);
});

test('decide reads the sign-off audit event and passes the claimant to the checks', async () => {
  const { decide } = await import('../src/verify-claim.js');
  const seen = [];
  const d = {
    collectJira: async () => signoffCtx().ticket,
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: null }),
    collectGithub: async () => ({ pr: signoffCtx().pr, workflowRuns: [], deployRuns: [] }),
    collectPrStats: async () => ({ patches: {} }),
    readAudit: async (from, count) => { seen.push([from, count]); return [signoffEvent()]; },
  };
  const log = console.log;
  console.log = () => {};
  try {
    const signoffOf = async (by) => (await decide({ issueKey: 'BENCH-27', claim: { id: 'c1', type: 'done', by } }, d))
      .verdict.checks.find((k) => k.name === 'human_signoff');
    const self = await signoffOf('acc-reviewer');
    assert.deepEqual(seen, [[7, 1]]);
    assert.equal(self.status, 'unknown');
    assert.match(self.reason, /claimant/);
    assert.equal((await signoffOf('acc-dev')).status, 'pass');
  } finally {
    console.log = log;
  }
});

// Finding 11.
test('ci_attempts uses the default workflow path when the config names none', () => {
  const run = { path: '.github/workflows/ci.yml', headSha: 'h', attempt: 2, earlierFailures: [{ attempt: 1, job: 'test', step: 'Run pytest' }] };
  const r = checks.ciAttempts({ pr: { headSha: 'h' }, workflowRuns: [run], config: {} });
  assert.equal(r?.status, 'unknown');
});

test('a run with more earlier attempts than are read is unknown, not clean', async () => {
  const { collectGithub } = await import('../src/github-evidence.js');
  const H = 'c'.repeat(40);
  const fetchFn = async (url) => {
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    const body = /\/pulls\?/.test(url) ? (page === 1 ? [{ number: 20, title: 'BANK-13 fix', state: 'open', head: { ref: 'b', sha: H, repo: { full_name: 'ysant77/yms-bank-demo' } } }] : [])
      : /\/actions\/runs\?/.test(url) ? (page === 1 ? { workflow_runs: [{ id: 9, run_attempt: 8, name: 'CI', path: '.github/workflows/ci.yml', head_sha: H, status: 'completed', conclusion: 'success' }] } : { workflow_runs: [] })
      : /\/attempts\/\d+\/jobs/.test(url) ? { jobs: [{ name: 'test', steps: [{ name: 'Run pytest', conclusion: 'success' }] }] }
      : /\/pulls\/20\/files/.test(url) ? []
      : null;
    return body === null ? { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } } : { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
  };
  const gh = await collectGithub({ repo: 'ysant77/yms-bank-demo', key: 'BANK-13', fetchFn });
  const r = checks.ciAttempts({ pr: gh.pr, workflowRuns: gh.workflowRuns, config: { requiredWorkflowPaths: ['.github/workflows/ci.yml'] } });
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /not read/);
});

test('the evidence record lists the audited sign-off as the human decision', async () => {
  const { buildDoneEvidence } = await import('../src/verifier/evidence.js');
  const ctx = signoffCtx();
  ctx.ticket.decisions = [{ by: 'forged', seq: 1, text: 'not from the app' }];
  const e = buildDoneEvidence({ id: 'd', type: 'done' }, ctx, [checks.checkHumanSignoff(ctx)]);
  assert.deepEqual(e.humanDecisions, [{ by: 'acc-reviewer', seq: 7, text: `signed off ${MERGE}: checked the rounding` }]);
  const unaudited = signoffCtx({ signoffEvent: null });
  assert.deepEqual(buildDoneEvidence({ id: 'd', type: 'done' }, unaudited, [checks.checkHumanSignoff(unaudited)]).humanDecisions, []);
});

test('the checker version names the definition-of-done rules', async () => {
  const { CHECKER_VERSION } = await import('../src/verifier/verdict.js');
  assert.equal(CHECKER_VERSION, 'verifier/2');
});
