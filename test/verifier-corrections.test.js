// Verifier corrections from the lead review of 23 Nov (Codegeist findings 5, 6, 8 and 9). Each
// rule has its own test; set 5 (development data now) is the regression check.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { nextEvent } from '../src/audit.js';
import { createTicket } from '../src/index.js';
import { LATEST_DONE_KEY, readLatestDone, signOffAction } from '../src/sign-off.js';
import { normaliseAcs, parseAcLines, testPassesArgErrors } from '../src/ticket-spec.js';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { decide, verifyClaim } from '../src/verify-claim.js';
import { fetchFrom } from './helpers/recorded-github.js';
import * as c from '../src/verifier/checks.js';

// Finding 5: test_passes(a, b) used to check a only. Every named test is checked now (U12 names
// three tests in one AC); the first name stays the reproducer.
async function u12(args) {
  const c = JSON.parse(readFileSync(new URL('../fixtures/judge/U12.json', import.meta.url), 'utf8'));
  if (args) c.ticket.acceptanceCriteria[0].check.args = args;
  const d = {
    collectJira: async () => ({ subtasks: [], links: [], ...c.ticket }), readAudit: async () => [],
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: 'local' }), collectGithub, collectPrStats,
    fetchFn: fetchFrom(c.github), collectReviews: async () => [],
  };
  return (await decide({ issueKey: c.ticket.key, claim: { id: 'u12', type: c.claim, by: 'dev-a' } }, d)).verdict;
}

test('test_passes with three test names: all are checked; a missing one is a fail', async (t) => {
  t.mock.method(console, 'log', () => {});
  const ok = await u12();
  const ac = ok.checks.find((k) => k.name === 'ac_mapped');
  assert.equal(ac.status, 'pass', ac.reason);
  assert.match(ac.parts[0].reason, /test_zero_decimals_are_accepted passed; test_non_zero_extra_decimals_are_still_refused passed; test_transfer_accepts_zero_decimals passed/);
  const v = await u12(['test_zero_decimals_are_accepted', 'test_that_does_not_exist']);
  assert.equal(v.result, 'contradicted');
  assert.match(v.reason, /test_that_does_not_exist is missing from the report/);
});

test('ticket creation keeps every test name of test_passes, and refuses an empty one', async () => {
  const kept = normaliseAcs(parseAcLines('AC1 | both rules | test_passes(test_a, test_b)'), 'KAN');
  assert.deepEqual(kept[0].check.args, ['test_{TOKEN}_a', 'test_{TOKEN}_b']);
  assert.deepEqual(testPassesArgErrors(parseAcLines('AC1 | x | test_passes()\nAC2 | y | test_passes(test_c)')), ['AC1']);
  const out = await createTicket({ projectKey: 'BANK', summary: 's', issueType: 'Story', storyPoints: 3, acceptanceCriteria: 'AC1 | no test | test_passes()' });
  assert.equal(out.ok, false);
  assert.match(out.error, /AC1: test_passes needs a test name/);
});

// Finding 6: the sign-off gate read the claimant and the merged commit from aat.verdicts, an
// issue property that any editor can write. It now reads the latest done verdict from the audit
// chain, through a pointer in the app's own store.
const MERGE = 'b'.repeat(40);
function auditStore() {
  const data = new Map();
  const events = [];
  let prev = null;
  return {
    data,
    events,
    store: { get: async (k) => structuredClone(data.get(k)), set: async (k, v) => { data.set(k, structuredClone(v)); }, delete: async (k) => { data.delete(k); } },
    appendAudit: async (e) => { const ev = nextEvent(prev, { ...e, at: '2026-11-23T01:00:00.000Z' }); prev = ev; events.push(ev); return ev; },
    readAudit: async (seq, n) => events.slice(seq, seq + n),
  };
}

test('a done verdict leaves a pointer to its audit entry; the sign-off reads it from there', async (t) => {
  t.mock.method(console, 'log', () => {});
  const a = auditStore();
  const posted = [];
  const d = {
    store: a.store, appendAudit: a.appendAudit, readAudit: a.readAudit,
    env: () => ({ repo: null }),
    collectJira: async () => ({ key: 'T-1', type: 'Story', labels: [], subtasks: [], links: [], acceptanceCriteria: [] }),
    addVerdictProperty: async () => true,
    addComment: async (k, text) => { posted.push(text); },
    findComment: async () => false,
  };
  await verifyClaim({ issueKey: 'T-1', claim: { id: 'T-1:9', type: 'done', by: 'claimer' } }, d);
  const pointer = a.data.get(LATEST_DONE_KEY('T-1'));
  assert.equal(pointer.seq, a.events.find((e) => e.event === 'verdict').seq);
  const record = await readLatestDone('T-1', a);
  assert.equal(record.claimant, 'claimer');
  assert.equal(record.type, 'done');
});

test('readLatestDone refuses an entry that does not match its pointer or its hash', async () => {
  const a = auditStore();
  await a.appendAudit({ actor: 'team-lead-verifier', event: 'verdict', data: { issueKey: 'T-1', type: 'done', claimant: 'claimer', mergeSha: MERGE } });
  const e = a.events[0];
  await a.store.set(LATEST_DONE_KEY('T-1'), { seq: e.seq, hash: e.hash });
  assert.equal((await readLatestDone('T-1', a)).claimant, 'claimer');
  // Another work item's pointer, a changed entry, a wrong actor: none counts.
  assert.equal(await readLatestDone('T-2', a), null);
  a.events[0] = { ...e, data: { ...e.data, claimant: 'someone-else' } };
  assert.equal(await readLatestDone('T-1', a), null);
  a.events[0] = { ...e, actor: 'person' };
  assert.equal(await readLatestDone('T-1', a), null);
});

test('the claimant cannot sign off even when the verdict property names another claimant', async () => {
  const a = auditStore();
  await a.appendAudit({ actor: 'team-lead-verifier', event: 'verdict', data: { issueKey: 'T-1', type: 'done', claimant: 'claimer', mergeSha: MERGE } });
  await a.store.set(LATEST_DONE_KEY('T-1'), { seq: 0, hash: a.events[0].hash });
  const deps = {
    canEdit: async () => true,
    // The property is not read any more; a tampered copy changes nothing.
    readVerdicts: async () => [{ type: 'done', claimant: 'someone-else', mergeSha: 'c'.repeat(40) }],
    readLatestDone: (key) => readLatestDone(key, a),
    appendAudit: a.appendAudit,
    writeSignoff: async () => ({ ok: true, status: 200 }),
  };
  const own = await signOffAction({ key: 'T-1', accountId: 'claimer', payload: { reason: 'looks fine to me' } }, deps);
  assert.equal(own.ok, false);
  const other = await signOffAction({ key: 'T-1', accountId: 'reviewer', payload: { reason: 'looks fine to me' } }, deps);
  assert.equal(other.ok, true);
  assert.equal(other.signoff.sha, MERGE);
});

test('with no audited done verdict the sign-off is refused', async () => {
  const a = auditStore();
  const deps = { canEdit: async () => true, readLatestDone: (key) => readLatestDone(key, a), appendAudit: a.appendAudit, writeSignoff: async () => ({ ok: true }) };
  const r = await signOffAction({ key: 'T-1', accountId: 'reviewer', payload: { reason: 'looks fine to me' } }, deps);
  assert.equal(r.ok, false);
  assert.match(r.error, /no audited "done" verdict/);
});

// Finding 8 (V17): an approval named "file::Class::test_x" must match the test "test_x", and an
// audited change approval also covers the old name of a test that is renamed and edited.
function approvalCtx(test, kind = 'change') {
  let prev = null;
  const ev = nextEvent(prev, { actor: 'reviewer', event: kind === 'change' ? 'test.change_approved' : 'test.removal_approved', data: { key: 'T-1', test, reason: 'the AC moves the limit' }, at: 'x' });
  prev = ev;
  return {
    ticket: { key: 'T-1', acceptanceCriteria: [] },
    claimant: 'claimer',
    approvals: { [kind === 'change' ? 'changes' : 'removals']: [{ test, reason: 'the AC moves the limit', by: 'reviewer', auditSeq: ev.seq }] },
    approvalEvents: new Map([[ev.seq, ev]]),
  };
}

// Rename rule (lead, 23 Nov, after set 6 W13): a change approval covers a test that is gone from
// the head only when the report links this test to its successor: a pinned entry whose head_id is
// another id in the same module, which the base did not have. "The module gained any new id" is
// not enough. No link: unknown, never pass. A plain deletion with a change approval only is not
// approved.
const OLD = 'tests/test_idempotency.py::TestKeys::test_keys_expire_after_24_hours';
const NEW = 'tests/test_idempotency.py::TestKeys::test_keys_expire_after_48_hours';
const KEPT = 'tests/test_idempotency.py::TestKeys::test_a_failed_attempt_stores_no_key';
const pinnedReport = (headIds, oldEntry) => ({
  tests: headIds.map((id) => ({ id, outcome: 'passed' })),
  pinned: { version: 1, modules: ['tests/test_idempotency.py'], tests: [
    oldEntry,
    { id: KEPT, head_id: KEPT, base_hash: 'b'.repeat(64), head_hash: 'b'.repeat(64), outcome: 'passed' },
  ] },
});
const unlinked = { id: OLD, head_id: null, base_hash: 'a'.repeat(64), head_hash: null, outcome: 'not_run' };
const linked = { id: OLD, head_id: NEW, base_hash: 'a'.repeat(64), head_hash: 'c'.repeat(64), outcome: 'failed' };
const pinned = (ctx, report) => c.pinnedTestsHold({ ...ctx, config: { pinnedRequired: true } }, report);

test('a change approval covers a pinned test that the report links to its renamed, edited successor', () => {
  const r = pinned(approvalCtx(OLD), pinnedReport([KEPT, NEW], linked));
  assert.equal(r.status, 'pass', r.reason);
});

test('a module that gains an unrelated new test no longer counts as a rename: unknown (W13)', () => {
  const r = pinned(approvalCtx(OLD), pinnedReport([KEPT, 'tests/test_idempotency.py::TestKeys::test_purge'], unlinked));
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /test_keys_expire_after_24_hours .*no link from the old test to a new one/);
});

test('V17 shape: an edited rename that the pinned block does not link gives unknown, not pass', () => {
  const r = pinned(approvalCtx(OLD), pinnedReport([KEPT, NEW], unlinked));
  assert.equal(r.status, 'unknown', r.reason);
});

test('a link to an id the base already had, or to another module, is not a rename', () => {
  const toKept = { ...linked, head_id: KEPT };
  assert.notEqual(pinned(approvalCtx(OLD), pinnedReport([KEPT, NEW], toKept)).status, 'pass');
  const otherModule = { ...linked, head_id: 'tests/test_other.py::test_keys_expire_after_48_hours' };
  assert.notEqual(pinned(approvalCtx(OLD), pinnedReport([KEPT, 'tests/test_other.py::test_keys_expire_after_48_hours'], otherModule)).status, 'pass');
});

test('a removal approval still covers a deleted pinned test', () => {
  const r = pinned(approvalCtx(OLD, 'removal'), pinnedReport([KEPT], unlinked));
  assert.equal(r.status, 'pass', r.reason);
});

const removalCtx = (headIds, entry) => {
  const base = ['tests/test_idempotency.py::test_keys_expire_after_24_hours', 'tests/test_idempotency.py::test_kept'];
  return {
    ...approvalCtx('tests/test_idempotency.py::test_keys_expire_after_24_hours'),
    baseReport: { tests: base.map((id) => ({ id, outcome: 'passed' })) },
    report: {
      tests: headIds.map((id) => ({ id, outcome: 'passed' })),
      repro: { base_test_ids: base, base_collect: { rc: 0, modules_without_ids: [] } },
      ...(entry ? { pinned: { version: 1, modules: ['tests/test_idempotency.py'], tests: [entry] } } : {}),
    },
  };
};
const OLD2 = 'tests/test_idempotency.py::test_keys_expire_after_24_hours';
const NEW2 = 'tests/test_idempotency.py::test_keys_expire_after_48_hours';

test('the removal check: a change approval covers the old name only with a rename link', () => {
  const ok = removalCtx(['tests/test_idempotency.py::test_kept', NEW2], { id: OLD2, head_id: NEW2, base_hash: 'a'.repeat(64), head_hash: 'c'.repeat(64), outcome: 'failed' });
  assert.equal(c.testsNotRemoved(ok, ok.report).status, 'pass');
  const noLink = removalCtx(['tests/test_idempotency.py::test_kept', NEW2], { id: OLD2, head_id: null, base_hash: 'a'.repeat(64), head_hash: null, outcome: 'not_run' });
  const r = c.testsNotRemoved(noLink, noLink.report);
  assert.equal(r.status, 'unknown', r.reason);
  assert.match(r.reason, /no link from the old test to a new one/);
  const noPinned = removalCtx(['tests/test_idempotency.py::test_kept', NEW2], null);
  assert.equal(c.testsNotRemoved(noPinned, noPinned.report).status, 'unknown');
});

test('an AC test that the PR deletes is named as deleted, not only as missing', () => {
  const ctx = removalCtx(['tests/test_idempotency.py::test_kept'], null);
  const r = c.deletedTestNote(ctx, 'test_keys_expire_after_24_hours');
  assert.match(r, /the PR deletes it/);
  assert.equal(c.deletedTestNote(ctx, 'test_never_existed'), null);
});

test('an approval by the claimant still does not count after the name is normalised', () => {
  const ctx = approvalCtx('tests/t.py::test_x');
  ctx.claimant = 'reviewer';
  const report = { pinned: { version: 1, modules: ['tests/t.py'], tests: [{ id: 'tests/t.py::test_x', head_id: null, base_hash: 'a'.repeat(64), head_hash: null, outcome: 'not_run' }] } };
  assert.equal(c.pinnedTestsHold({ ...ctx, config: { pinnedRequired: true } }, report).status, 'fail');
});

// Finding 9 (V18): the AC test sets a module-level name that the PR adds, so the shipped value is
// never tested.
const V18_SRC = '@@ -33,6 +33,7 @@\n SEED_FLAG = "demo_seeded"\n+DEBUG_ROUTES = True\n \n \n def seed_demo_data(conn) -> None:';
const V18_TEST = '@@ -234,3 +234,15 @@\n+def test_debug_accounts_route_follows_the_flag(bank, monkeypatch):\n+    monkeypatch.setattr("bank.api.DEBUG_ROUTES", True, raising=False)\n+    assert True';
const v18 = (src = V18_SRC) => ({
  ticket: { key: 'T-1', type: 'Story', acceptanceCriteria: [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_debug_accounts_route_follows_the_flag'] } }] },
  report: { tests: [{ id: 'tests/test_api.py::test_debug_accounts_route_follows_the_flag', outcome: 'passed' }] },
  prPatches: { 'src/bank/api.py': src, 'tests/test_api.py': V18_TEST },
});

test('V18: an AC test that sets a module-level name the PR adds gives unknown', () => {
  const r = c.acTestsRunNewCode(v18());
  assert.equal(r?.status, 'unknown');
  assert.match(r.reason, /DEBUG_ROUTES/);
});

test('V18: a name that the PR only reads, or an indented assignment, is not counted', () => {
  assert.equal(c.acTestsRunNewCode(v18('@@ -1 +1 @@\n SEED_FLAG = 1\n+    DEBUG_ROUTES = True')), null);
  assert.equal(c.acTestsRunNewCode(v18('@@ -1 +1 @@\n DEBUG_ROUTES = True\n+x = DEBUG_ROUTES')), null);
});

// Finding 9 (V12): the PR removes a security argument from a call.
const V12_SRC = '@@ -146,7 +146,7 @@\n-        response.set_cookie(COOKIE, str(customer["id"]), httponly=True, samesite="lax")\n+        response.set_cookie(COOKIE, str(customer["id"]), max_age=1800, samesite="lax")';

test('V12: a removed httponly=True gives unknown and names the file', () => {
  const r = c.securityArgsKept({ prPatches: { 'src/bank/api.py': V12_SRC } });
  assert.equal(r?.status, 'unknown');
  assert.match(r.reason, /httponly=True.*src\/bank\/api\.py/);
});

test('V12: a kept security argument, a test file, or no patch gives no check', () => {
  const kept = '@@ -1 +1 @@\n-        response.set_cookie(C, v, httponly=True)\n+        response.set_cookie(C, v, httponly=True, max_age=1800)';
  assert.equal(c.securityArgsKept({ prPatches: { 'src/bank/api.py': kept } }), null);
  assert.equal(c.securityArgsKept({ prPatches: { 'tests/test_api.py': V12_SRC } }), null);
  assert.equal(c.securityArgsKept({ prPatches: {} }), null);
});

test('V12: the done claim runs the security argument check', async () => {
  const { CLAIM_CHECKS } = await import('../src/verifier/verdict.js');
  const ctx = { ticket: { key: 'T-1', type: 'Story', acceptanceCriteria: [{ acId: 'AC1', check: { type: 'test_passes', args: ['test_x'] } }] }, prPatches: { 'src/bank/api.py': V12_SRC } };
  for (const type of ['done', 'fixed', 'ready']) {
    assert.ok(CLAIM_CHECKS[type](ctx).some((k) => k?.name === 'security_args_kept' && k.status === 'unknown'), type);
  }
});

// Set 6, W10 (owner decision 23 Nov): the security check also sees a changed or removed value of
// a listed cookie argument (samesite). An added middleware, or any change outside the list, is not
// seen (stated in docs/claims.md).
const W10_SRC = '@@ -146,7 +146,7 @@\n-        response.set_cookie(COOKIE, str(customer["id"]), httponly=True, samesite="lax")\n+        response.set_cookie(COOKIE, str(customer["id"]), httponly=True, samesite="none")';

test('W10: a changed samesite value gives unknown and names both values', () => {
  const r = c.securityArgsKept({ prPatches: { 'src/bank/api.py': W10_SRC } });
  assert.equal(r?.status, 'unknown');
  assert.match(r.reason, /samesite from "lax" to "none" in src\/bank\/api\.py/);
});

test('W10: a removed samesite gives unknown; the same value kept, or a test file, gives no check', () => {
  const removed = '@@ -1 +1 @@\n-        response.set_cookie(C, v, httponly=True, samesite="lax")\n+        response.set_cookie(C, v, httponly=True)';
  assert.match(c.securityArgsKept({ prPatches: { 'src/bank/api.py': removed } })?.reason ?? '', /removes samesite="lax"/);
  const kept = '@@ -1 +1 @@\n-        response.set_cookie(C, v, samesite="lax")\n+        response.set_cookie(C, v, samesite="lax", max_age=1800)';
  assert.equal(c.securityArgsKept({ prPatches: { 'src/bank/api.py': kept } }), null);
  assert.equal(c.securityArgsKept({ prPatches: { 'tests/test_api.py': W10_SRC } }), null);
  const quotes = "@@ -1 +1 @@\n-    response.set_cookie(C, v, samesite='lax')\n+    response.set_cookie(C, v, samesite=\"lax\")";
  assert.equal(c.securityArgsKept({ prPatches: { 'src/bank/api.py': quotes } }), null);
});

test('V12 still gives only the removed httponly=True', () => {
  const r = c.securityArgsKept({ prPatches: { 'src/bank/api.py': V12_SRC } });
  assert.match(r.reason, /httponly=True/);
  assert.doesNotMatch(r.reason, /samesite/);
});
