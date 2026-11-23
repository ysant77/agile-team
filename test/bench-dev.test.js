// Development cases from benchmark set 1 (agile-team-bench, benchmark/CASES.md). Set 1 is
// development material now; the benchmark claim comes from set 2. Each case replays the
// recorded GitHub of its branch through decide().

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { nextEvent } from '../src/audit.js';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { decide } from '../src/verify-claim.js';
import { fetchFrom } from './helpers/recorded-github.js';
import './helpers/unlisted.js';

const DIR = new URL('../fixtures/bench/', import.meta.url);
const recorded = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, DIR), 'utf8'));

// The recorded reports are from before the coverage script wrote unmeasured_files, and the
// coverage check gives unknown without that list (review finding 14). The cases below test other
// rules, so they read each report as the current script writes it: with an empty list, and with
// changed_excluded 0 (also newer than the recordings). The recorded form is tested on its own below.
const load = (id) => {
  const c = recorded(id);
  const cov = c.github?.report?.coverage;
  if (cov && !('unmeasured_files' in cov)) cov.unmeasured_files = [];
  if (cov && !('changed_excluded' in cov)) cov.changed_excluded = 0;
  return c;
};

export async function run(id) {
  return runCase(load(id));
}

// opts.approvals and opts.events: the app's approval store and its audit events; opts.by: the claimant.
async function runCase(c, opts = {}) {
  const id = c.id;
  const d = {
    collectJira: async () => structuredClone(c.ticket),
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: 'local' }),
    collectGithub, collectPrStats, fetchFn: fetchFrom(c.github),
    ...(opts.approvals ? { readApprovals: async () => structuredClone(opts.approvals), readAudit: async (seq) => [opts.events.find((e) => e.seq === seq)] } : {}),
  };
  const log = console.log;
  console.log = () => {};
  try {
    const { verdict } = await decide({ issueKey: c.ticket.key, claim: { id: `dev-${id}`, type: c.claim, text: '', by: opts.by } }, d);
    return verdict;
  } finally {
    console.log = log;
  }
}

// Regression net: cases that are right today and must stay so (lead rule 3, 16 Nov).
// Invalid claims: their current contradicted or cannot_verify. Valid claims with incomplete
// evidence: cannot_verify. Controls that pass today: supported.
const KEEP = {
  B02: 'contradicted', B03: 'contradicted', B06: 'contradicted', B07: 'cannot_verify', B08: 'cannot_verify',
  B09: 'cannot_verify', B11: 'cannot_verify', B12: 'cannot_verify', B13: 'cannot_verify', I06: 'contradicted',
  I07: 'contradicted', B10: 'cannot_verify', B14: 'cannot_verify', B15: 'cannot_verify', B16: 'cannot_verify',
  B23: 'supported', I03: 'supported', I04: 'supported',
};

for (const [id, want] of Object.entries(KEEP)) {
  test(`development case ${id} stays ${want}`, async () => {
    const v = await run(id);
    assert.equal(v.result, want, v.reason);
  });
}

test('a recorded report from before unmeasured_files gives cannot_verify for done, not supported', async () => {
  for (const id of ['B23', 'I03', 'I04']) {
    const v = await runCase(recorded(id));
    assert.equal(v.result, 'cannot_verify', `${id}: ${v.reason}`);
    assert.match(v.reason, /unmeasured_files/);
  }
});

test('a recorded report from before changed_excluded gives cannot_verify for done, not supported', async () => {
  for (const id of ['B23', 'I03', 'I04']) {
    const c = recorded(id);
    c.github.report.coverage.unmeasured_files = [];
    const v = await runCase(c);
    assert.equal(v.result, 'cannot_verify', `${id}: ${v.reason}`);
    assert.match(v.reason, /changed_excluded/);
  }
});

// Every invalid case of set 1 runs through the checks: none may be supported, except a named
// limit. A limit that stops being supported must leave this list (PR 8 review, item 11).
const INVALID = ['B01', 'B02', 'B03', 'B05', 'B06', 'B07', 'B08', 'B09', 'B11', 'B12', 'B13', 'B19', 'B20', 'I05', 'I06', 'I07', 'I10'];
const LIMITS = ['B01'];
for (const id of INVALID) {
  test(`invalid case ${id} is ${LIMITS.includes(id) ? 'a named limit (still supported)' : 'not supported'}`, async () => {
    const v = await run(id);
    if (LIMITS.includes(id)) assert.equal(v.result, 'supported', `${id} is no longer a limit: remove it from LIMITS`);
    else assert.notEqual(v.result, 'supported', `${id}: ${v.reason}`);
  });
}

test('set 1 has all its cases', () => {
  assert.equal(readdirSync(DIR).filter((f) => f.endsWith('.json')).length >= 39, true);
});

// (a1) A high-stake domain (DESIGN 6a) needs a person's sign-off on the merged change before
// "done" is supported. Code alone never supports it.
test('B27: a money_semantics ticket is not done without a recorded sign-off of the merged commit', async () => {
  const v = await run('B27');
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /money_semantics.*sign-off/);
});

test('B27: a sign-off of the merged commit by a person lets the evidence decide again', async () => {
  const { checkHumanSignoff } = await import('../src/verifier/checks.js');
  const { nextEvent } = await import('../src/audit.js');
  // The sign-off button writes the audit event; the claimant is another person (PR 8 review, item 10).
  const signoffEvent = nextEvent(null, { actor: 'acc-1', event: 'change.signed_off', data: { key: 'BENCH-27', sha: 'abc', reason: 'checked' }, at: '2026-11-16T12:00:00Z' });
  const ctx = { ticket: { key: 'BENCH-27', domain: 'money_semantics', signoff: { by: 'acc-1', sha: 'abc', at: '2026-11-16T12:00:00Z', auditSeq: 0 } }, pr: { merged: true, mergeSha: 'abc', headSha: 'def' }, claimant: 'acc-2', signoffEvent };
  assert.equal(checkHumanSignoff(ctx).status, 'pass');
  assert.equal(checkHumanSignoff({ ...ctx, ticket: { ...ctx.ticket, signoff: { ...ctx.ticket.signoff, sha: 'old' } } }).status, 'unknown');
  assert.equal(checkHumanSignoff({ ...ctx, ticket: { key: 'X', domain: null } }), null);
});

// (a2) A PR that changes measurement code (config guardedPaths) cannot support a claim by itself,
// whatever the AC type: a test that asserts recall is a measurement too (benchmark B19, B20).
for (const id of ['B19', 'B20']) {
  test(`${id}: a change to the evaluation or model code sends the claim to a person`, async () => {
    const v = await run(id);
    assert.equal(v.result, 'cannot_verify', v.reason);
    assert.match(v.reason, /src\/fraud\/(evaluate|model)\.py.*measure/);
  });
}

// (a4) A ready claim whose CI ran against an older base tip: the evidence does not cover the
// merge result (benchmark I09).
test('I09: a base that moved after CI makes a ready claim cannot_verify, with both commits named', async () => {
  const v = await run('I09');
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /base moved/);
});

// (a5) A re-run hides a failed attempt: GitHub lists only the latest attempt of a run. An
// earlier attempt that failed in a test step means a flaky test (benchmark B05); one that failed
// in a setup step is a runner problem (benchmark B29) and does not count.
test('B05: an earlier attempt that failed in the test step sends the claim to a person', async () => {
  const v = await run('B05');
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /attempt 1 failed in step .*pytest/);
});

test('B29: an earlier attempt that failed in a setup step is not held against the claim', async () => {
  const v = await run('B29');
  assert.doesNotMatch(v.reason, /attempt 1 failed/);
});

// (a6) An AC test that replaces the function the PR adds does not run the new code (benchmark I05).
test('I05: an AC test that monkeypatches the new function sends the claim to a person', async () => {
  const v = await run('I05');
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /replaces over_daily_limit/);
});

test('replacing a function the PR does not change is not flagged', async () => {
  const { acTestsRunNewCode } = await import('../src/verifier/checks.js');
  const ctx = {
    ticket: { key: 'BANK-1', acceptanceCriteria: [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_x'] } }] },
    report: { tests: [{ id: 'tests/test_a.py::test_x', outcome: 'passed' }] },
    prPatches: {
      'tests/test_a.py': '@@ -1 +1,3 @@\n+def test_x(monkeypatch):\n+    monkeypatch.setattr(clock, "now", lambda: 1)',
      'src/bank/ledger.py': '@@ -1 +1,2 @@\n+def over_limit(x):\n+    return x > 1',
    },
  };
  assert.equal(acTestsRunNewCode(ctx), null);
});

// (b1) A Bug's guard tests (named for the key, not an AC) protect behaviour that must not change,
// so they pass on base by design. Each AC test must still reproduce (benchmark B21, B25, B26, B29).
test('B21 and B29: a guard test that passes on base does not block a reproduced fix', async () => {
  for (const id of ['B21', 'B29']) {
    const v = await run(id);
    assert.equal(v.result, 'supported', `${id}: ${v.reason}`);
  }
});

test('B25: with guard tests allowed, the missing coverage block still holds the claim', async () => {
  const v = await run('B25');
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /coverage/);
});

test('a Bug with no AC test needs at least one key-named test that reproduces', async () => {
  const c = load('B21');
  c.ticket.acceptanceCriteria = [];
  const repro = async () => (await runCase(c)).checks.find((x) => x.name === 'reproduced');
  assert.equal((await repro()).status, 'pass');
  for (const t of c.github.report.repro.tests) if (/BENCH21_/.test(t.id)) t.base = { outcome: 'passed', exc_type: null };
  const r = await repro();
  assert.equal(r.status, 'fail', r.reason);
  assert.match(r.reason, /passes on base/);
});




// Two live PRs name the key: a done claim cannot tell which one it means (benchmark B26).
test('B26: a second open PR that names the key makes a done claim cannot_verify, with both PRs named', async () => {
  const v = await run('B26');
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /PRs #\d+, #\d+ all name BENCH-26/);
});

// (b2) A Task (a refactor, tests only, a chore) has no defect to reproduce: its AC tests must pass
// on head with the full suite, coverage and the trust rules; the base outcome is recorded when
// known but is not required to be a failure (benchmark I01, I02).
test('I01 and I02: a Task is supported when its AC tests pass on head, with no reproduction on base', async () => {
  for (const id of ['I01', 'I02']) {
    const v = await run(id);
    assert.equal(v.result, 'supported', `${id}: ${v.reason}`);
  }
});

test('a Task whose AC test fails on head is still contradicted', async () => {
  const c = load('I02');
  for (const t of c.github.report.tests) if (/from_minor_negative_amounts/.test(t.id)) t.outcome = 'failed';
  const v = await runCase(c);
  assert.equal(v.result, 'contradicted', v.reason);
});
// (b3) A ticket with no AC whose work is defined by sub-tasks that are all done (benchmark B24).
// A ticket with no AC and no sub-task has nothing to check: cannot_verify (B13, in the regression
// net; lead review of 23 Nov, finding 2).
test('B24: a Task with no AC and all sub-tasks done is supported', async () => {
  const v = await run('B24');
  assert.equal(v.result, 'supported', v.reason);
});

// (a3) A dropped test is visible even when git reads a delete and add as a rename: the repro
// block lists the base test ids of every changed, renamed or removed test module (benchmark I10).
test('I10: a test that the PR drops makes the claim contradicted, with the test named', async () => {
  const v = await run('I10');
  assert.equal(v.result, 'contradicted', v.reason);
  assert.match(v.reason, /test_keys_expire_after_24_hours/);
});

// An approved removal: an entry in the app's store with its audit event, by a person other than
// the claimant (finding E1, 19 Nov). A name in the issue property alone does not count.
const removalApproved = (key) => {
  const reason = 'the 24-hour expiry is replaced by AC3';
  const events = [nextEvent(null, { actor: 'lead-1', event: 'test.removal_approved', data: { key, test: 'test_keys_expire_after_24_hours', reason }, at: '2026-11-19T00:00:00Z' })];
  return { approvals: { removals: [{ test: 'test_keys_expire_after_24_hours', reason, by: 'lead-1', at: '2026-11-19T00:00:00Z', auditSeq: 0 }], changes: [], acs: null }, events, by: 'dev-1' };
};

test('an approved removal does not count as a dropped test', async () => {
  const c = load('I10');
  const v = await runCase(c, removalApproved(c.ticket.key));
  assert.doesNotMatch(v.reason, /test_keys_expire_after_24_hours/);
});

test('a removal listed only in the issue property still counts as a dropped test', async () => {
  const c = load('I10');
  c.ticket.approvedTestRemovals = ['test_keys_expire_after_24_hours'];
  const v = await runCase(c, { by: 'dev-1' });
  assert.equal(v.result, 'contradicted', v.reason);
  assert.match(v.reason, /issue property, which does not count/);
});

// The recorded I10 report is from before the repro script wrote base_collect. Its listed base ids
// still show the dropped test (a fail), but without the collection record a clean result is
// unknown: a module whose base ids could not be read may hide a dropped test.
test('I10 with an approved removal: the dropped-test check needs the base_collect record to pass', async () => {
  const check = async (c) => (await runCase(c, removalApproved(c.ticket.key))).checks.find((x) => x.name === 'reproduced');
  const c = load('I10');
  const old = await check(c);
  assert.equal(old.status, 'unknown', old.reason);
  assert.match(old.reason, /base_collect/);
  c.github.report.repro.base_collect = { rc: 0, modules_without_ids: [] };
  assert.equal((await check(c)).status, 'pass');
});

// (b4) A Story that adds a module: its AC test cannot import on base. That is new behaviour,
// not a reproduction failure, when the PR adds the module, the AC test file imports it, and the
// test passes on head (benchmark B22). A Bug keeps the old rule.
test('B22: a Story whose AC tests import a module the PR adds is supported', async () => {
  const v = await run('B22');
  assert.equal(v.result, 'supported', v.reason);
});

test('the same shape on a Bug stays cannot_verify', async () => {
  const c = load('B22');
  c.ticket.type = 'Bug';
  const v = await runCase(c);
  assert.equal(v.result, 'cannot_verify', v.reason);
});

// (b5) A PR from a fork is not "no PR": its CI report is not posted (the report job skips forks),
// so the claim cannot be verified, and the fork PR is named (benchmark I08).
test('I08: a fork PR that names the key makes the claim cannot_verify, not contradicted', async () => {
  const v = await run('I08');
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /fork/);
});
