// The panel's sign-off button (lead, 21 Nov): it calls the existing signOff action. The merged
// commit comes from the latest "done" verdict, not from the person. The claimant of that claim is
// refused, with the text shown in the panel. The audit event is written first, then the issue
// property, as for test approvals. The panel shows who signed, the commit and the audit sequence.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { nextEvent } from '../src/audit.js';
import { SIGNOFF_CLAIMANT_REFUSAL, signOffAction, signoffPanel } from '../src/sign-off.js';
import { SignOffSection } from '../src/frontend/sign-off-section.js';

const KEY = 'BANK-64';
const MERGE = 'c'.repeat(40);
const done = (extra = {}) => ({ claimId: 'c1', type: 'done', result: 'cannot_verify', reason: 'money_semantics: a person\'s sign-off of the merged change is required, and none is recorded',
  headSha: 'a'.repeat(40), mergeSha: MERGE, claimant: 'dev-a', at: '2026-11-21T01:00:00.000Z',
  checks: [{ name: 'human_signoff', status: 'unknown', reason: 'money_semantics: ...' }], ...extra });

function deps({ verdicts = [done()], canEdit = true, writeOk = true } = {}) {
  const calls = [];
  let prev = { seq: 40, hash: 'f'.repeat(64) };
  return {
    calls,
    canEdit: async () => canEdit,
    // The latest done verdict as the audit chain holds it (readLatestDone, src/sign-off.js).
    readLatestDone: async () => (verdicts ?? []).filter((v) => v && v.type === 'done').at(-1) ?? null,
    appendAudit: async (e) => {
      const ev = nextEvent(prev, { ...e, at: '2026-11-21T02:00:00.000Z' });
      prev = ev;
      calls.push(['audit', ev]);
      return ev;
    },
    writeSignoff: async (key, s) => {
      calls.push(['property', key, s]);
      return writeOk ? { ok: true } : { ok: false, status: 403 };
    },
  };
}
const act = (accountId, d, reason = 'the finance owner accepts zero decimals') => signOffAction({ key: KEY, accountId, payload: { reason } }, d);

test('a person other than the claimant signs off the merged commit of the latest done claim: audit first, then the property', async () => {
  const d = deps();
  const r = await act('finance-b', d);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(d.calls.map((c) => c[0]), ['audit', 'property']);
  const ev = d.calls[0][1];
  assert.deepEqual([ev.actor, ev.event, ev.data], ['finance-b', 'change.signed_off', { key: KEY, sha: MERGE, reason: 'the finance owner accepts zero decimals' }]);
  assert.deepEqual(d.calls[1][2], { by: 'finance-b', sha: MERGE, reason: 'the finance owner accepts zero decimals', at: ev.at, auditSeq: ev.seq });
  assert.equal(r.auditSeq, ev.seq);
  assert.deepEqual(r.signoff, d.calls[1][2]);
});

test('the claimant is refused with the panel text, and nothing is written', async () => {
  const d = deps();
  const r = await act('dev-a', d);
  assert.deepEqual(r, { ok: false, error: SIGNOFF_CLAIMANT_REFUSAL });
  assert.match(SIGNOFF_CLAIMANT_REFUSAL, /cannot sign it off/);
  assert.deepEqual(d.calls, []);
});

test('the commit is never taken from the person: a sha in the input is ignored', async () => {
  const d = deps();
  const r = await signOffAction({ key: KEY, accountId: 'finance-b', payload: { reason: 'accepted by finance', sha: 'd'.repeat(40) } }, d);
  assert.equal(r.ok, true);
  assert.equal(d.calls[1][2].sha, MERGE);
});

test('the latest done verdict decides; later verdicts of other types do not', async () => {
  const d = deps({ verdicts: [done({ mergeSha: 'e'.repeat(40), claimant: 'x' }), done(), { type: 'ready', claimant: 'finance-b', mergeSha: null }] });
  const r = await act('finance-b', d);
  assert.equal(r.ok, true, r.error);
  assert.equal(d.calls[1][2].sha, MERGE);
});

test('refusals: short reason, unknown person, no edit permission, no done claim, no merged commit, a failed write', async () => {
  const cases = [
    [() => act('finance-b', deps(), 'ok'), /at least 5 characters/],
    [() => act(null, deps()), /person is not known/],
    [() => act('finance-b', deps({ canEdit: false })), /only a person who can edit this work item/],
    [() => act('finance-b', deps({ verdicts: [] })), /no audited "done" verdict on this work item yet/],
    [() => act('finance-b', deps({ verdicts: null })), /no audited "done" verdict on this work item yet/],
    [() => act('finance-b', deps({ verdicts: [done({ mergeSha: null })] })), /no merged commit/],
    [() => act('finance-b', deps({ verdicts: [done({ mergeSha: 'abc' })] })), /no merged commit/],
    [() => act('finance-b', deps({ writeOk: false })), /Jira refused the sign-off \(HTTP 403\)/],
  ];
  for (const [run, error] of cases) {
    const r = await run();
    assert.equal(r.ok, false);
    assert.match(r.error, error);
  }
});

test('the panel model: needed when the latest done verdict has a sign-off check; a sign-off shows who, the commit and the seq', () => {
  assert.equal(signoffPanel([], null), null);
  assert.equal(signoffPanel([done({ checks: [{ name: 'ci_green', status: 'pass', reason: 'ok' }] })], null), null);
  const p = signoffPanel([done()], null);
  assert.deepEqual(p, { needed: true, mergeSha: MERGE, claimant: 'dev-a', signed: null });
  const s = { by: 'finance-b', sha: MERGE, reason: 'accepted', at: '2026-11-21T02:00:00.000Z', auditSeq: 41 };
  const q = signoffPanel([done()], s);
  assert.deepEqual(q.signed, { by: 'finance-b', sha7: 'ccccccc', date: '2026-11-21 02:00', auditSeq: 41, current: true });
  assert.equal(signoffPanel([done({ mergeSha: 'e'.repeat(40) })], s).signed.current, false);
  for (const bad of [{ by: 3 }, 'x', { by: 'a', sha: 'b', auditSeq: 'n' }]) assert.equal(signoffPanel([done()], bad).signed, null);
});

// ---- The section as a person sees it (stand-in UI components, as in the judge-path test) ----
const names = ['Button', 'Heading', 'Inline', 'SectionMessage', 'Stack', 'Text', 'TextArea'];
const ui = Object.fromEntries(names.map((n) => [n, Object.defineProperty(() => null, 'name', { value: n })]));
function texts(el, out = []) {
  if (el === null || el === undefined || el === false) return out;
  if (Array.isArray(el)) { el.forEach((x) => texts(x, out)); return out; }
  if (typeof el === 'string' || typeof el === 'number') { out.push(String(el)); return out; }
  if (typeof el.type === 'function' && !names.includes(el.type.name)) return texts(el.type(el.props), out);
  texts(el.props?.children, out);
  return out;
}
const section = (panel, extra = {}) => SignOffSection({ panel, reason: '', onReason: () => {}, onSignOff: () => {}, error: null, ui, ...extra });

test('the section shows the button and the merged commit, then who signed and the audit sequence', () => {
  assert.equal(section(null), null);
  const open = texts(section(signoffPanel([done()], null))).join('\n');
  assert.match(open, /Sign-off of the merged change/);
  assert.match(open, /Merged commit ccccccc/);
  assert.match(open, /Sign off the merged change/);
  assert.match(open, /The person who made the claim cannot sign off/);
  const s = { by: 'finance-b', sha: MERGE, reason: 'accepted', at: '2026-11-21T02:00:00.000Z', auditSeq: 41 };
  const signed = texts(section(signoffPanel([done()], s))).join('\n');
  assert.match(signed, /Signed off by finance-b for commit ccccccc on 2026-11-21 02:00\. Audit seq 41\./);
  assert.doesNotMatch(signed, /Sign off the merged change/);
});

test('the refusal text is shown in the section', () => {
  const t = texts(section(signoffPanel([done()], null), { error: SIGNOFF_CLAIMANT_REFUSAL })).join('\n');
  assert.ok(t.includes(SIGNOFF_CLAIMANT_REFUSAL));
});

test('the section is a React element tree', () => {
  assert.ok(React.isValidElement(section(signoffPanel([done()], null))));
});
