// Evidence scope in the verdict view (C2.3, 24 Nov 2026). A verdict describes the evidence it
// read: one head commit, one merge commit, one evidence record, at one time, by one checker. A
// later push, merge or AC change is not covered. The view says so, counts the checks by kind
// (verified, contradicted, unknown), and lists what the code checks never read, so a green
// verdict is not read as more than it is (set 6: W10 side effect and W18 weak test were supported).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NEVER_CHECKED, verdictView } from '../src/verdict-view.js';
import { VerdictSection } from '../src/frontend/verdict-section.js';

const HEAD = '1234567890abcdef1234567890abcdef12345678';
const MERGE = 'fedcba0987654321fedcba0987654321fedcba09';
const record = (extra = {}) => ({
  claimId: 'BANK-1:1', type: 'done', result: 'supported', reason: 'all checks passed', checker: 'v-test', at: '2026-11-24T08:00:00.000Z',
  headSha: HEAD, mergeSha: MERGE, evidenceHash: 'e'.repeat(64),
  checks: [
    { name: 'ci_green', status: 'pass', reason: 'ok' },
    { name: 'reproduced', status: 'pass', reason: 'fails on base, passes on head' },
    { name: 'on_main', status: 'unknown', reason: 'the main report is for another commit' },
    { name: 'no_removed_tests', status: 'fail', reason: 'a test was removed' },
  ],
  ...extra,
});

test('the scope names the head, the merge commit, the evidence record, the time and the checker', () => {
  const v = verdictView(record());
  assert.match(v.scope, /head 1234567/);
  assert.match(v.scope, /merge commit fedcba0/);
  assert.match(v.scope, /evidence record eeeeeeeeeeee/);
  assert.match(v.scope, /2026-11-24 08:00/);
  assert.match(v.scope, /checker v-test/);
  assert.match(v.scope, /later push, merge or change of the ACs is not covered/);
});

test('a verdict with no merge commit and no evidence record says so', () => {
  const v = verdictView(record({ mergeSha: null, evidenceHash: undefined, type: 'fixed' }));
  assert.match(v.scope, /no merge commit/);
  assert.match(v.scope, /no evidence record/);
});

test('the checks are counted by kind', () => {
  assert.deepEqual(verdictView(record()).kinds, { verified: 2, contradicted: 1, unknown: 1 });
});

test('the view lists what the code checks never read, on every verdict', () => {
  for (const result of ['supported', 'contradicted', 'cannot_verify']) {
    const v = verdictView(record({ result }));
    assert.deepEqual(v.neverChecked, NEVER_CHECKED);
  }
  const text = NEVER_CHECKED.join(' ');
  assert.match(text, /every case of the criterion/);
  assert.match(text, /side effect/);
  assert.match(text, /text of the acceptance criteria/);
  // Measured limits of set 7 (24 Nov): X07 and X15.
  assert.match(text, /expected value with the code it tests/);
  assert.match(text, /reaches a query/);
});

const names = ['Heading', 'Inline', 'Lozenge', 'SectionMessage', 'Stack', 'Text'];
const ui = Object.fromEntries(names.map((n) => [n, Object.defineProperty(() => null, 'name', { value: n })]));
function texts(el, out = []) {
  if (el === null || el === undefined || el === false) return out;
  if (Array.isArray(el)) { el.forEach((x) => texts(x, out)); return out; }
  if (typeof el === 'string' || typeof el === 'number') { out.push(String(el)); return out; }
  return texts(el.props?.children, out);
}

test('the panel shows the scope and the never-checked list', () => {
  const shown = texts(VerdictSection({ view: verdictView(record()), ui })).join('\n');
  assert.match(shown, /Evidence scope: .*head 1234567/);
  assert.match(shown, /Never checked by the code checks/);
  for (const line of NEVER_CHECKED) assert.ok(shown.includes(line), line);
  assert.match(shown, /Checks: 2 verified, 1 contradicted, 1 unknown/);
});

test('a claim that was not checked gets one plain line for the panel', async () => {
  const { notCheckedLine } = await import('../src/verdict-view.js');
  const line = notCheckedLine({ claimId: 'K-1:9', type: 'done', reason: 'GitHub rate limit reached (HTTP 403, 0 calls left this hour)', retryAt: '2026-11-24T10:41:00.000Z', at: '2026-11-24T10:00:12.000Z' });
  assert.equal(line, 'The last claim "done" (2026-11-24 10:00 UTC) was not checked: GitHub rate limit reached (HTTP 403, 0 calls left this hour). No verdict was recorded. Post the claim again after 2026-11-24 10:41 UTC.');
  assert.match(notCheckedLine({ type: 'fixed', reason: 'GitHub server error', retryAt: null, at: '2026-11-24T10:00:12.000Z' }), /Post the claim again in a few minutes\.$/);
  assert.equal(notCheckedLine(null), null);
});
