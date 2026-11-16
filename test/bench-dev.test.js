// Development cases from benchmark set 1 (agile-team-bench, benchmark/CASES.md). Set 1 is
// development material now; the benchmark claim comes from set 2. Each case replays the
// recorded GitHub of its branch through decide().

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { decide } from '../src/verify-claim.js';
import { fetchFrom } from './helpers/recorded-github.js';

const DIR = new URL('../fixtures/bench/', import.meta.url);
const load = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, DIR), 'utf8'));

export async function run(id) {
  return runCase(load(id));
}

async function runCase(c) {
  const id = c.id;
  const d = {
    collectJira: async () => structuredClone(c.ticket),
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: 'local' }),
    collectGithub, collectPrStats, fetchFn: fetchFrom(c.github),
  };
  const log = console.log;
  console.log = () => {};
  try {
    const { verdict } = await decide({ issueKey: c.ticket.key, claim: { id: `dev-${id}`, type: c.claim, text: '' } }, d);
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
  B09: 'cannot_verify', B11: 'cannot_verify', B12: 'cannot_verify', B13: 'contradicted', I06: 'contradicted',
  I07: 'contradicted', B10: 'cannot_verify', B14: 'cannot_verify', B15: 'cannot_verify', B16: 'cannot_verify',
  B23: 'supported', I03: 'supported', I04: 'supported',
};

for (const [id, want] of Object.entries(KEEP)) {
  test(`development case ${id} stays ${want}`, async () => {
    const v = await run(id);
    assert.equal(v.result, want, v.reason);
  });
}

test('every invalid case of set 1 is in the regression net or a named fix or limit', () => {
  const invalid = ['B01', 'B02', 'B03', 'B05', 'B06', 'B07', 'B08', 'B09', 'B11', 'B12', 'B13', 'B19', 'B20', 'I05', 'I06', 'I07', 'I10'];
  const fixOrLimit = ['B01', 'B05', 'B19', 'B20', 'I05', 'I10'];
  for (const id of invalid) assert.ok(id in KEEP || fixOrLimit.includes(id), id);
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
  const ctx = { ticket: { key: 'BENCH-27', domain: 'money_semantics', signoff: { by: 'acc-1', sha: 'abc', at: '2026-11-16T12:00:00Z' } }, pr: { merged: true, mergeSha: 'abc', headSha: 'def' } };
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
