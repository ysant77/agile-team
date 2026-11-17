// Rule fixes for the defects that independent set 2 found (agile-team-bench RESULTS-2.md): S17,
// S16, S18 and S03. Set 2 is not scored again with these fixes; a new blind set scores them.
// Each test takes a set 1 development fixture and changes only the fact under test.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { checkHumanSignoff, ciGreen } from '../src/verifier/checks.js';
import { decide } from '../src/verify-claim.js';
import { fetchFrom } from './helpers/recorded-github.js';

const load = (id) => JSON.parse(readFileSync(new URL(`../fixtures/bench/${id}.json`, import.meta.url), 'utf8'));

async function verdictOf(c) {
  const d = {
    collectJira: async () => structuredClone(c.ticket),
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: 'local' }),
    collectGithub, collectPrStats, fetchFn: fetchFrom(c.github),
  };
  const log = console.log;
  console.log = () => {};
  try {
    return (await decide({ issueKey: c.ticket.key, claim: { id: `fix-${c.id}`, type: c.claim, text: '' } }, d)).verdict;
  } finally {
    console.log = log;
  }
}

test('B23 is supported as recorded (the base of the changed fixtures below)', async () => {
  const v = await verdictOf(load('B23'));
  assert.equal(v.result, 'supported', v.reason);
});

// S17: a cancelled run gave no result. It is missing evidence, not evidence against the claim.
test('S17: a cancelled CI run on the head gives cannot_verify, never contradicted', async () => {
  // B18a: an open PR with a ready claim, supported as recorded.
  assert.equal((await verdictOf(load('B18a'))).result, 'supported');
  const c = load('B18a');
  c.github.runs = c.github.runs.map((r) => ({ ...r, conclusion: 'cancelled' }));
  const v = await verdictOf(c);
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /cancelled/);
});

test('S17: a cancelled run next to a successful run of the same workflow on the head is not held against the claim', () => {
  const head = 'a'.repeat(40);
  const run = (conclusion, id) => ({ id, path: '.github/workflows/ci.yml', headSha: head, status: 'completed', conclusion, createdAt: `2026-11-16T10:0${id}:00Z` });
  const ctx = { pr: { headSha: head }, prFiles: [], workflowRuns: [run('cancelled', 1), run('success', 2)] };
  assert.equal(ciGreen(ctx).status, 'pass', ciGreen(ctx).reason);
  assert.equal(ciGreen({ ...ctx, workflowRuns: [run('cancelled', 1)] }).status, 'unknown');
  assert.equal(ciGreen({ ...ctx, workflowRuns: [run('failure', 1), run('success', 2)] }).status, 'fail');
  assert.equal(ciGreen({ ...ctx, workflowRuns: [run('timed_out', 1)] }).status, 'fail');
});

// Review finding 13: an author can cancel a failing run and start a new one. The success counts
// only when it is the later run on the head; otherwise the result is unknown.
test('S17: a cancelled run passes only when a successful run on the head started after it', () => {
  const head = 'a'.repeat(40);
  const run = (conclusion, id, createdAt) => ({ id, path: '.github/workflows/ci.yml', headSha: head, status: 'completed', conclusion, createdAt });
  const ctx = (runs) => ({ pr: { headSha: head }, prFiles: ['src/a.py'], workflowRuns: runs });
  const later = ciGreen(ctx([run('cancelled', 1, '2026-11-16T10:00:00Z'), run('success', 2, '2026-11-16T10:05:00Z')]));
  assert.equal(later.status, 'pass', later.reason);
  const earlier = ciGreen(ctx([run('success', 1, '2026-11-16T10:00:00Z'), run('cancelled', 2, '2026-11-16T10:05:00Z')]));
  assert.equal(earlier.status, 'unknown', earlier.reason);
  assert.match(earlier.reason, /cancelled/);
  const same = ciGreen(ctx([run('cancelled', 1, '2026-11-16T10:00:00Z'), run('success', 2, '2026-11-16T10:00:00Z')]));
  assert.equal(same.status, 'unknown', same.reason);
  const noTime = ciGreen(ctx([run('cancelled', 1), run('success', 2)]));
  assert.equal(noTime.status, 'unknown', noTime.reason);
});

// S16: the high-stake domain can come from a Jira label, not only from the stored ticket spec.
test('S16: a money_semantics label starts the sign-off rule when the spec has no domain', async () => {
  const c = load('B27');
  c.ticket.domain = undefined;
  c.ticket.labels = ['money_semantics'];
  const v = await verdictOf(c);
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /money_semantics.*sign-off/);
});

test('S16: a label that is not a high-stake domain does not start the sign-off rule', () => {
  const ctx = { ticket: { key: 'X-1', labels: ['frontend'] }, pr: { headSha: 'abc' } };
  assert.equal(checkHumanSignoff(ctx), null);
  assert.equal(checkHumanSignoff({ ...ctx, ticket: { key: 'X-1', labels: ['fairness'] } }).status, 'unknown');
});

// S18: a changed source file that the coverage data does not have is not covered; the coverage
// block names it (bank scripts/changed_coverage.py, field unmeasured_files).
test('S18: a changed file missing from the coverage data gives cannot_verify with the file named', async () => {
  const c = load('B23');
  c.github.report.coverage = { ...c.github.report.coverage, unmeasured_files: ['src/bank/ledger.py'] };
  const v = await verdictOf(c);
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.match(v.reason, /src\/bank\/ledger\.py.*coverage data/);
});

test('S18: an empty unmeasured_files list changes nothing', async () => {
  const c = load('B23');
  c.github.report.coverage = { ...c.github.report.coverage, unmeasured_files: [] };
  assert.equal((await verdictOf(c)).result, 'supported');
});

// S03: a Story that adds a function to an existing module. The AC test fails on base with
// AttributeError because the function is missing: that is new behaviour, as for a new module.
// The base row carries the exception text (exc_message), as pytest's excinfo.exconly() gives it.
const NO_ATTR = "AttributeError: module 'bank.ledger' has no attribute 'strip_reference'";
function withNewFunction(c, { type = 'Story', addDef = true, def = 'def strip_reference(text):', use = 'ledger.strip_reference(" a ")', message = NO_ATTR } = {}) {
  c.ticket.type = type;
  const acs = new Set(c.ticket.acceptanceCriteria.map((a) => a.check.args[0]));
  for (const t of c.github.report.repro.tests) {
    if (acs.has(t.id.split('::')[1])) t.base = { outcome: 'failed', exc_type: 'AttributeError', ...(message ? { exc_message: message } : {}) };
  }
  for (const f of c.github.files) {
    if (addDef && f.filename.startsWith('src/') && f.patch) f.patch += `\n+${def}\n+    return text.strip()`;
    if (f.filename.startsWith('tests/') && f.patch) f.patch += `\n+    assert ${use} == "a"`;
  }
  return c;
}

test('S03: a Story test that fails on base with AttributeError for a function the PR adds reproduces', async () => {
  const v = await verdictOf(withNewFunction(load('B23')));
  assert.equal(v.result, 'supported', v.reason);
});

test('S03: the same AttributeError is still cannot_verify for a Bug, or when the PR adds no such function', async () => {
  for (const opts of [{ type: 'Bug' }, { addDef: false }]) {
    const v = await verdictOf(withNewFunction(load('B23'), opts));
    assert.equal(v.result, 'cannot_verify', `${JSON.stringify(opts)}: ${v.reason}`);
    assert.match(v.reason, /AttributeError/);
  }
});

// Review finding 12: the new function must be the one the test calls on the changed module, and
// the base error must name it. Any added def name in any added test line is not enough.
test('S03: an unrelated new function, a call on another object, or an error that names another attribute does not count', async () => {
  const cases = {
    'other object': { def: 'def get(text):', use: 'cfg.get(" a ")', message: "AttributeError: 'Config' object has no attribute 'get'" },
    'no exception text': { message: null },
    'other attribute': { message: "AttributeError: module 'bank.ledger' has no attribute 'post_entry'" },
    'method, not module function': { def: '    def strip_reference(self, text):' },
  };
  for (const [name, opts] of Object.entries(cases)) {
    const v = await verdictOf(withNewFunction(load('B23'), opts));
    assert.equal(v.result, 'cannot_verify', `${name}: ${v.reason}`);
    assert.match(v.reason, /AttributeError/);
  }
});

test('S03: a call through the full module path also counts', async () => {
  const v = await verdictOf(withNewFunction(load('B23'), { use: 'bank.ledger.strip_reference(" a ")' }));
  assert.equal(v.result, 'supported', v.reason);
});
