// Five evidence levels in the verdict view (execution plan P1-3, review item A): CI passed; bug
// reproduced; the named AC test passed; each AC has a mechanical check that passed; the tests
// cover every case of each AC. A green test is not shown as proof that the behaviour is right:
// level 5 is never "proved" from a test pass (lead review: set 4 has 7 unsafe supported cases
// where the named test passed and the AC was not covered). View only: verdicts do not change.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { evidenceLevels, verdictView } from '../src/verdict-view.js';
import { VerdictSection } from '../src/frontend/verdict-section.js';
import { decide } from '../src/verify-claim.js';
import { fetchFrom } from './helpers/recorded-github.js';

const LEVELS = ['CI passed', 'Bug reproduced', 'The named AC test passed', 'Each AC has a mechanical check that passed', 'The tests cover every case of each AC'];
const L4 = LEVELS[3];
const L5 = LEVELS[4];
const ac = (acId, name, status, reason = 'r') => ({ acId, name, status, reason });
const record = (checks, extra = {}) => ({ claimId: 'c', type: 'done', result: 'supported', reason: 'all checks passed', checks, ...extra });
const byLevel = (levels) => Object.fromEntries(levels.map((l) => [l.level, l]));

test('a supported done claim: levels 1 to 4 proved; level 5 is "not checked" and says what could raise it', () => {
  const l = byLevel(evidenceLevels(record([
    { name: 'ci_green', status: 'pass', reason: 'pinned workflow passed on the head' },
    { name: 'reproduced', status: 'pass', reason: 'AC1 fails on base, passes on head' },
    { name: 'ac_mapped', status: 'pass', reason: '2 AC(s) met', parts: [ac('AC1', 'test_passes(test_BANK4_x)', 'pass'), ac('AC2', 'field_equals(customfield_1)', 'pass')] },
  ]).checks));
  assert.deepEqual(Object.keys(l), LEVELS);
  for (const name of LEVELS.slice(0, 4)) assert.equal(l[name].status, 'proved', name);
  assert.deepEqual(l[L4].acs.map((a) => [a.acId, a.status]), [['AC1', 'proved'], ['AC2', 'proved']]);
  assert.equal(l[L5].status, 'not checked');
  assert.match(l[L5].detail, /a passing test does not show it/);
  assert.match(l[L5].detail, /protected regression set/);
  assert.match(l[L5].detail, /sign-off/);
});

test('an AC with no mechanical check shows "not checked" at level 4', () => {
  const l = byLevel(evidenceLevels([
    { name: 'ac_mapped', status: 'unknown', reason: 'x', parts: [ac('AC1', 'test_passes(test_a)', 'pass'), ac('AC2', 'manual(the copy is clear)', 'unknown', 'needs a human: the copy is clear')] },
  ]));
  const ac2 = l[L4].acs.find((a) => a.acId === 'AC2');
  assert.equal(ac2.status, 'not checked');
  assert.match(ac2.detail, /no mechanical check/);
  assert.equal(l[L5].status, 'not checked');
  assert.equal(l[L4].status, 'not checked');
  assert.equal(l['The named AC test passed'].status, 'proved');
});

test('a failed named test fails levels 3 to 5; an unknown one is "not proved"', () => {
  const failed = byLevel(evidenceLevels([{ name: 'ac_mapped', status: 'fail', reason: 'x', parts: [ac('AC1', 'test_passes(test_a)', 'fail', 'test_a: failed')] }]));
  for (const name of LEVELS.slice(2, 4)) assert.equal(failed[name].status, 'failed', name);
  assert.equal(failed[L5].status, 'not checked');
  const unknown = byLevel(evidenceLevels([{ name: 'ac_mapped', status: 'unknown', reason: 'x', parts: [ac('AC1', 'test_passes(test_a)', 'unknown', 'report not trusted')] }]));
  assert.equal(unknown['The named AC test passed'].status, 'not proved');
  assert.equal(unknown[L4].status, 'not proved');
  assert.equal(unknown[L5].status, 'not checked');
});

test('a claim type that does not run a check shows that level as "not checked"', () => {
  const l = byLevel(evidenceLevels([{ name: 'ci_green', status: 'pass', reason: 'ok' }]));
  assert.equal(l['Bug reproduced'].status, 'not checked');
  assert.match(l['Bug reproduced'].detail, /not checked for this claim/);
  assert.equal(l['The named AC test passed'].status, 'not checked');
  assert.equal(l[L5].status, 'not checked');
});

test('an AC list with no named test: level 3 is "not checked", other mechanical checks still cover', () => {
  const l = byLevel(evidenceLevels([{ name: 'ac_mapped', status: 'pass', reason: 'x', parts: [ac('AC1', 'subtasks_done', 'pass')] }]));
  assert.equal(l['The named AC test passed'].status, 'not checked');
  assert.equal(l[L4].acs[0].status, 'proved');
  assert.equal(l[L4].status, 'proved');
  assert.equal(l[L5].status, 'not checked');
});

test('a record without stored checks: every level "not checked"; malformed input does not throw', () => {
  for (const checks of [undefined, null, 'x', [], [null, 7, { name: 3 }]]) {
    const levels = evidenceLevels(checks);
    assert.deepEqual(levels.map((l) => l.level), LEVELS);
    for (const l of levels) assert.equal(l.status, 'not checked', JSON.stringify(checks));
  }
});

test('level 5 names the pinned tests that held, but stays "not checked"; a review never lowers or raises it', () => {
  const pinned = { name: 'pinned_tests_hold', status: 'pass', reason: '12 pinned base test(s) hold on the head code' };
  const l = byLevel(evidenceLevels([pinned]));
  assert.equal(l[L5].status, 'not checked');
  assert.match(l[L5].detail, /old behaviour held by 12 pinned tests/);
  const advisory = byLevel(evidenceLevels([{ ...pinned, advisory: true, reason: 'not run: no pinned block' }]));
  assert.doesNotMatch(advisory[L5].detail, /held by/);
  const old = verdictView(record([pinned], { result: 'cannot_verify', reviewHold: ['AC1'] }));
  const l5 = old.levels.find((x) => x.level === L5);
  assert.equal(l5.status, 'not checked');
  assert.doesNotMatch(l5.detail, /reviewer/);
  assert.deepEqual(old.levels, evidenceLevels([pinned]));
});

test('the view carries the levels and does not change the verdict or the other lists', () => {
  const r = record([{ name: 'ci_green', status: 'pass', reason: 'ok' }]);
  const v = verdictView(r);
  assert.deepEqual(v.levels, evidenceLevels(r.checks));
  assert.equal(v.state, 'supported');
  assert.deepEqual(v.proved, ['ci_green: ok']);
});

// The real U01 evidence (judge path): the panel shows the five levels under one heading.
const names = ['Heading', 'Inline', 'Lozenge', 'SectionMessage', 'Stack', 'Text'];
const ui = Object.fromEntries(names.map((n) => [n, Object.defineProperty(() => null, 'name', { value: n })]));
function texts(el, out = []) {
  if (el === null || el === undefined || el === false) return out;
  if (Array.isArray(el)) { el.forEach((x) => texts(x, out)); return out; }
  if (typeof el === 'string' || typeof el === 'number') { out.push(String(el)); return out; }
  if (typeof el.type === 'function' && !names.includes(el.type.name)) return texts(el.type(el.props), out);
  // A leaf (only text children) gives its joined text; a container gives each child's texts.
  const children = [el.props?.children].flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false);
  if (children.length && children.every((x) => typeof x === 'string' || typeof x === 'number')) out.push(children.join(''));
  else texts(children, out);
  return out;
}

async function replay(file) {
  const c = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
  const log = console.log;
  console.log = () => {};
  let rec;
  try {
    ({ record: rec } = await decide({ issueKey: c.ticket.key, claim: { id: 'u01', type: c.claim } }, {
      collectJira: async () => ({ subtasks: [], links: [], ...structuredClone(c.ticket) }),
      env: () => ({ repo: 'ysant77/yms-bank-demo', token: 'local' }),
      collectGithub, collectPrStats, fetchFn: fetchFrom(c.github), collectReviews: async () => [],
    }));
  } finally {
    console.log = log;
  }
  return rec;
}

// U01 (a valid claim) and U15, U23 (set 4, invalid: the named test passes, the AC is not covered;
// arm C says supported). On all three the verdict stays supported and level 5 is "not checked".
for (const [id, file] of [['U01', '../fixtures/judge/U01.json'], ['U15', '../fixtures/levels/U15.json'], ['U23', '../fixtures/levels/U23.json']]) {
  test(`${id}: supported, and the panel shows level 5 as "not checked"`, async () => {
    const rec = await replay(file);
    assert.equal(rec.result, 'supported');
    const shown = texts({ type: VerdictSection, props: { view: verdictView(rec), ui } });
    assert.ok(shown.includes('Evidence levels'));
    for (const name of LEVELS) assert.ok(shown.some((t) => t.startsWith(`${name}: `)), name);
    assert.ok(shown.some((t) => t.startsWith(`${L5}: not checked`)), shown.join('\n'));
    assert.ok(!shown.some((t) => t.startsWith(`${L5}: proved`)));
    assert.ok(shown.some((t) => t.startsWith('The named AC test passed: proved')));
  });
}
