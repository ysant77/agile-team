// The panel's view of a stored discovery finding (lead, 23 Nov). A finding had no screen: a person
// saw it only in the Rovo chat. The panel section takes a finding id and shows the stored record:
// a defect with the rule file it cites, or "unclear" with the rule question. The view only reads
// the record; it never changes the kind or the status.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { RULE_QUESTION } from '../src/discovery.js';
import { FINDING_NOT_FOUND, findingView, getFindingAction } from '../src/finding-view.js';
import { FindingSection } from '../src/frontend/finding-section.js';

const COMMIT = 'c'.repeat(40);
const base = {
  findingId: 'F-0123456789ab-89abcdef', investigationId: 'INV-0123456789ab', symptom: 'A customer withdrew 80.00 twice from 100.00.',
  repo: 'o/demo', commit: COMMIT, by: 'pm-1', status: 'unconfirmed', filesRead: ['src/bank/ledger.py', 'docs/rules.md'], calls: 4,
  hash: 'h'.repeat(64), at: '2026-11-23T10:00:00.000Z',
};
const defect = {
  ...base, kind: 'defect', hypothesis: 'The balance check and the debit are not one step.',
  citations: [{ file: 'src/bank/ledger.py', line: 255 }, { file: 'docs/rules.md', line: 3 }],
  reproducer: { testName: 'test_two_withdrawals_never_overdraw', file: 'tests/test_ledger.py', asserts: 'the balance never goes below 0' },
  severity: { level: 'high', reason: 'money is lost' }, priority: { level: 'P2', reason: 'one site' }, openQuestions: [],
};
const unclear = {
  ...base, kind: 'unclear', proposedKind: 'defect', hypothesis: 'The debit sleeps before it writes.',
  citations: [{ file: 'src/bank/ledger.py', line: 255 }], reproducer: null, severity: null, priority: null,
  openQuestions: ['Is the sleep on purpose?', RULE_QUESTION],
};

test('a defect shows the rule file it cites apart from the code it cites, and its reproducer', () => {
  const v = findingView(defect);
  assert.equal(v.kind, 'defect');
  assert.equal(v.title, 'F-0123456789ab-89abcdef: defect (unconfirmed)');
  assert.deepEqual(v.ruleCitations, ['docs/rules.md:3']);
  assert.deepEqual(v.codeCitations, ['src/bank/ledger.py:255']);
  assert.equal(v.reproducer, 'tests/test_ledger.py, test_two_withdrawals_never_overdraw: the balance never goes below 0');
  assert.equal(v.severity, 'Severity high: money is lost. Priority P2: one site.');
  assert.equal(v.readAt, 'Read at commit ccccccc of o/demo, by pm-1 on 2026-11-23.');
  assert.equal(v.ruleQuestion, null);
  assert.equal(v.noRuleNote, null);
});

test('an unclear finding that the model proposed as a defect shows why, and the rule question', () => {
  const v = findingView(unclear);
  assert.equal(v.kind, 'unclear');
  assert.equal(v.title, 'F-0123456789ab-89abcdef: unclear (unconfirmed)');
  assert.deepEqual(v.ruleCitations, []);
  assert.deepEqual(v.codeCitations, ['src/bank/ledger.py:255']);
  assert.match(v.noRuleNote, /proposed a defect/);
  assert.match(v.noRuleNote, /cites no rule/);
  assert.equal(v.ruleQuestion, RULE_QUESTION);
  assert.deepEqual(v.openQuestions, ['Is the sleep on purpose?']);
  assert.equal(v.reproducer, null);
  assert.equal(v.severity, null);
});

test('the rule files are the same as the discovery rule: docs/, a README, or a test', () => {
  const v = findingView({ ...defect, citations: [
    { file: 'README.md', line: 1 }, { file: 'src/bank/README.md', line: 2 }, { file: 'tests/test_a.py', line: 3 },
    { file: 'src/bank/test_b.py', line: 4 }, { file: 'docs/x/y.md', line: 5 }, { file: 'src/bank/docs.py', line: 6 },
  ] });
  assert.deepEqual(v.ruleCitations, ['README.md:1', 'src/bank/README.md:2', 'tests/test_a.py:3', 'src/bank/test_b.py:4', 'docs/x/y.md:5']);
  assert.deepEqual(v.codeCitations, ['src/bank/docs.py:6']);
});

test('the view never makes a finding more than it is: the status stays as stored, and an odd record gives no view', () => {
  assert.equal(findingView({ ...defect, status: 'reproduced' }).title, 'F-0123456789ab-89abcdef: defect (reproduced)');
  for (const bad of [null, undefined, 'x', [], {}, { findingId: 'F-1', kind: 'other' }]) assert.equal(findingView(bad), null);
});

test('the action reads the stored record by id for its investigator; an unknown or malformed id gives the not-found text', async () => {
  const store = new Map([[`finding:${defect.findingId}`, defect]]);
  // Review of 24 Nov (finding access): the caller is part of the read. Here the investigator reads.
  const d = { store: { get: async (k) => structuredClone(store.get(k)) }, accountId: defect.by, canBrowse: async () => false };
  const ok = await getFindingAction({ findingId: ` ${defect.findingId} ` }, d);
  assert.equal(ok.ok, true);
  assert.equal(ok.view.kind, 'defect');
  for (const id of ['F-0123456789ab-00000000', 'finding:x', '', null, undefined]) {
    assert.deepEqual(await getFindingAction({ findingId: id }, d), { ok: false, error: FINDING_NOT_FOUND });
  }
  assert.deepEqual(await getFindingAction(undefined, d), { ok: false, error: FINDING_NOT_FOUND });
});

// The section is written with React.createElement and given the components as an argument, as
// the sign-off section is, so the test reads every text a person sees.
const ui = Object.fromEntries(['Button', 'Heading', 'Inline', 'SectionMessage', 'Stack', 'Text', 'Textfield'].map((n) => [n, n]));
function texts(node) {
  if (node === null || node === undefined || node === false) return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(texts);
  return texts(node.props?.children);
}
const section = (props) => FindingSection({ ui, findingRef: '', onRef: () => {}, onShow: () => {}, ...props });

test('the section shows the rule file for a defect, and the rule question for unclear', () => {
  const d = texts(section({ view: findingView(defect) })).join('\n');
  assert.match(d, /Discovery finding/);
  assert.match(d, /F-0123456789ab-89abcdef: defect \(unconfirmed\)/);
  assert.match(d, /Rule cited: docs\/rules\.md:3/);
  assert.match(d, /Code cited: src\/bank\/ledger\.py:255/);
  assert.match(d, /Reproducer: tests\/test_ledger\.py/);
  assert.doesNotMatch(d, /Which rule does this break/);

  const u = texts(section({ view: findingView(unclear) })).join('\n');
  assert.match(u, /F-0123456789ab-89abcdef: unclear \(unconfirmed\)/);
  assert.match(u, /Rule cited: none/);
  assert.match(u, /proposed a defect/);
  assert.match(u, /Which rule does this break\? Cite a line of docs, a README or a test that states it\./);
  assert.match(u, /Is the sleep on purpose\?/);
});

test('the section with no finding shows the field and the button; an error shows as an error', () => {
  const empty = section({});
  assert.match(texts(empty).join('\n'), /Discovery finding/);
  assert.match(texts(empty).join('\n'), /Show finding/);
  const err = texts(section({ error: FINDING_NOT_FOUND })).join('\n');
  assert.match(err, /No stored finding has this id/);
});
