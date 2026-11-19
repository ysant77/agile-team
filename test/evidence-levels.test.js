// Five evidence levels in the verdict view (execution plan P1-3, review item A): CI passed; bug
// reproduced; the named AC test passed; the AC is covered; all ACs covered. A green test is not
// shown as proof that the behaviour is right: each level says what it rests on, and an AC with no
// mechanical check shows "not checked". View only: the verdict and the checks do not change.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { evidenceLevels, verdictView } from '../src/verdict-view.js';
import { VerdictSection } from '../src/frontend/verdict-section.js';
import { decide } from '../src/verify-claim.js';
import { fetchFrom } from './helpers/recorded-github.js';

const LEVELS = ['CI passed', 'Bug reproduced', 'The named AC test passed', 'The AC is covered', 'All ACs covered'];
const ac = (acId, name, status, reason = 'r') => ({ acId, name, status, reason });
const record = (checks, extra = {}) => ({ claimId: 'c', type: 'done', result: 'supported', reason: 'all checks passed', checks, ...extra });
const byLevel = (levels) => Object.fromEntries(levels.map((l) => [l.level, l]));

test('a supported done claim: every level proved, and level 5 still says what is not checked', () => {
  const l = byLevel(evidenceLevels(record([
    { name: 'ci_green', status: 'pass', reason: 'pinned workflow passed on the head' },
    { name: 'reproduced', status: 'pass', reason: 'AC1 fails on base, passes on head' },
    { name: 'ac_mapped', status: 'pass', reason: '2 AC(s) met', parts: [ac('AC1', 'test_passes(test_BANK4_x)', 'pass'), ac('AC2', 'field_equals(customfield_1)', 'pass')] },
  ]).checks));
  assert.deepEqual(Object.keys(l), LEVELS);
  for (const name of LEVELS) assert.equal(l[name].status, 'proved', name);
  assert.deepEqual(l['The AC is covered'].acs.map((a) => [a.acId, a.status]), [['AC1', 'proved'], ['AC2', 'proved']]);
  assert.match(l['All ACs covered'].detail, /whether each test covers every case of its AC is not checked/);
});

test('an AC with no mechanical check shows "not checked", and so does "All ACs covered"', () => {
  const l = byLevel(evidenceLevels([
    { name: 'ac_mapped', status: 'unknown', reason: 'x', parts: [ac('AC1', 'test_passes(test_a)', 'pass'), ac('AC2', 'manual(the copy is clear)', 'unknown', 'needs a human: the copy is clear')] },
  ]));
  const ac2 = l['The AC is covered'].acs.find((a) => a.acId === 'AC2');
  assert.equal(ac2.status, 'not checked');
  assert.match(ac2.detail, /no mechanical check/);
  assert.equal(l['All ACs covered'].status, 'not checked');
  assert.equal(l['The named AC test passed'].status, 'proved');
});

test('a failed named test fails levels 3 to 5; an unknown one is "not proved"', () => {
  const failed = byLevel(evidenceLevels([{ name: 'ac_mapped', status: 'fail', reason: 'x', parts: [ac('AC1', 'test_passes(test_a)', 'fail', 'test_a: failed')] }]));
  for (const name of LEVELS.slice(2)) assert.equal(failed[name].status, 'failed', name);
  const unknown = byLevel(evidenceLevels([{ name: 'ac_mapped', status: 'unknown', reason: 'x', parts: [ac('AC1', 'test_passes(test_a)', 'unknown', 'report not trusted')] }]));
  assert.equal(unknown['The named AC test passed'].status, 'not proved');
  assert.equal(unknown['All ACs covered'].status, 'not proved');
});

test('a claim type that does not run a check shows that level as "not checked"', () => {
  const l = byLevel(evidenceLevels([{ name: 'ci_green', status: 'pass', reason: 'ok' }]));
  assert.equal(l['Bug reproduced'].status, 'not checked');
  assert.match(l['Bug reproduced'].detail, /not checked for this claim/);
  assert.equal(l['The named AC test passed'].status, 'not checked');
  assert.equal(l['All ACs covered'].status, 'not checked');
});

test('an AC list with no named test: level 3 is "not checked", other mechanical checks still cover', () => {
  const l = byLevel(evidenceLevels([{ name: 'ac_mapped', status: 'pass', reason: 'x', parts: [ac('AC1', 'subtasks_done', 'pass')] }]));
  assert.equal(l['The named AC test passed'].status, 'not checked');
  assert.equal(l['The AC is covered'].acs[0].status, 'proved');
  assert.equal(l['All ACs covered'].status, 'proved');
});

test('a record without stored checks: every level "not checked"; malformed input does not throw', () => {
  for (const checks of [undefined, null, 'x', [], [null, 7, { name: 3 }]]) {
    const levels = evidenceLevels(checks);
    assert.deepEqual(levels.map((l) => l.level), LEVELS);
    for (const l of levels) assert.equal(l.status, 'not checked', JSON.stringify(checks));
  }
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

test('U01: the panel shows "Evidence levels" with the five levels, all proved for this supported claim', async () => {
  const c = JSON.parse(readFileSync(new URL('../fixtures/judge/U01.json', import.meta.url), 'utf8'));
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
  assert.equal(rec.result, 'supported');
  const shown = texts({ type: VerdictSection, props: { view: verdictView(rec), ui } });
  assert.ok(shown.includes('Evidence levels'));
  for (const name of LEVELS) assert.ok(shown.some((t) => t.startsWith(`${name}: `)), name);
  assert.ok(shown.some((t) => t.startsWith('All ACs covered: proved')), shown.join('\n'));
});
