// Judge path (docs/JUDGE-PATH.md): the four real benchmark cases run through decide(), the verdict
// record, the verdict view and the panel's verdict section. The section is built as a React
// element tree with stand-in UI components, and the test reads every text a person would see.
// This is the local render check; it does not run Forge.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { decide } from '../src/verify-claim.js';
import { NOT_CHECKED_COVERAGE, SUPPORTED_MEANS, compactChecks, verdictView } from '../src/verdict-view.js';
import { VerdictSection } from '../src/frontend/verdict-section.js';
import { fetchFrom } from './helpers/recorded-github.js';

const load = (id) => JSON.parse(readFileSync(new URL(`../fixtures/judge/${id}.json`, import.meta.url), 'utf8'));

async function verdictOf(c) {
  const d = {
    collectJira: async () => ({ subtasks: [], links: [], ...structuredClone(c.ticket) }),
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: 'local' }),
    collectGithub, collectPrStats, fetchFn: fetchFrom(c.github),
    collectReviews: async () => structuredClone(c.reviews ?? []),
  };
  const log = console.log;
  console.log = () => {};
  try {
    const out = await decide({ issueKey: c.ticket.key, claim: { id: `judge-${c.id}`, type: c.claim, text: `${c.claim} claimed` } }, d);
    return out;
  } finally {
    console.log = log;
  }
}

// Stand-in UI Kit components: each is a named function, so the tree keeps the component name.
const names = ['Heading', 'Inline', 'Lozenge', 'SectionMessage', 'Stack', 'Text'];
const ui = Object.fromEntries(names.map((n) => [n, Object.defineProperty(() => null, 'name', { value: n })]));

// Expand function components that are not UI stand-ins, then collect [component, text] pairs.
function render(el, out = []) {
  if (el === null || el === undefined || el === false) return out;
  if (Array.isArray(el)) { el.forEach((x) => render(x, out)); return out; }
  if (typeof el === 'string' || typeof el === 'number') { out.push(['#text', String(el)]); return out; }
  if (typeof el.type === 'function' && !names.includes(el.type.name)) return render(el.type(el.props), out);
  const name = typeof el.type === 'function' ? el.type.name : String(el.type);
  const kids = [];
  render(el.props?.children, kids);
  const text = kids.filter(([n]) => n === '#text').map(([, t]) => t).join('');
  if (text) out.push([name, text, el.props]);
  for (const k of kids) if (k[0] !== '#text') out.push(k);
  return out;
}

async function screen(id) {
  const c = load(id);
  const { record, verdict } = await verdictOf(c);
  assert.ok(Array.isArray(record.checks), 'the stored record has its checks');
  const view = verdictView(record);
  const items = render({ type: VerdictSection, props: { view, ui } });
  return { c, record, verdict, view, items, texts: items.map(([, t]) => t) };
}

const after = (items, heading) => {
  const i = items.findIndex(([n, t]) => n === 'Heading' && t === heading);
  if (i < 0) return [];
  const j = items.findIndex(([n], k) => k > i && n === 'Heading');
  return items.slice(i + 1, j < 0 ? undefined : j).map(([, t]) => t);
};

function common(s) {
  assert.ok(s.texts.includes('Verdict'));
  assert.ok(s.texts.includes(SUPPORTED_MEANS), 'the meaning of "supported" is on screen');
  assert.ok(after(s.items, 'What was not checked').includes(NOT_CHECKED_COVERAGE));
  assert.ok(s.texts.includes('Human decision'));
  assert.ok(s.texts.some((t) => t.startsWith('Verdict set by code')));
}

test('U01 (set 4 control): Supported, and the passing AC test is listed as proved', async () => {
  const s = await screen('U01');
  assert.equal(s.verdict.result, 'supported');
  assert.equal(s.items.find(([n]) => n === 'Lozenge')[1], 'Supported');
  assert.equal(s.items.find(([n]) => n === 'Lozenge')[2].appearance, 'success');
  const proved = after(s.items, 'What was proved');
  assert.ok(proved.some((t) => t.includes('test_a_huge_account_id_is_404')), JSON.stringify(proved));
  assert.ok(!s.texts.includes('What failed'));
  common(s);
});

test('U04 (set 4): Contradicted, with the code reason and the failed check', async () => {
  const s = await screen('U04');
  assert.equal(s.verdict.result, 'contradicted');
  assert.equal(s.items.find(([n]) => n === 'Lozenge')[1], 'Contradicted');
  assert.ok(s.texts.includes('Why: test_transfer_accepts_a_typed_account_number passes on base, so it does not reproduce the problem'));
  assert.ok(after(s.items, 'What failed').some((t) => t.includes('passes on base')));
  common(s);
});

test('U20 (set 4): Cannot verify, and the wrong kind of failure is shown', async () => {
  const s = await screen('U20');
  assert.equal(s.verdict.result, 'cannot_verify');
  assert.equal(s.items.find(([n]) => n === 'Lozenge')[1], 'Cannot verify');
  assert.ok(s.texts.includes('Why: test_account_number_refuses_a_sequence_out_of_range fails on base by Failed, not by an assertion'));
  common(s);
});

test('T08 (set 3): Held by review, with the model\'s own defect text on screen', async () => {
  const s = await screen('T08');
  assert.equal(s.verdict.result, 'cannot_verify');
  assert.deepEqual(s.record.reviewHold, ['AC1']);
  assert.equal(s.items.find(([n]) => n === 'Lozenge')[1], 'Held by review');
  const why = s.texts.find((t) => t.startsWith('Why: '));
  assert.match(why, /Code does not handle kind=debit case for filtering lines\./);
  assert.ok(after(s.items, 'What was not checked').includes("The reviewer's finding on AC1 is not verified by code."));
  assert.match(after(s.items, 'Human decision')[0], /A review can hold a claim; it can never pass one/);
  common(s);
});

test('without the review, T08 is Supported by code alone (the set 3 gap)', async () => {
  const c = load('T08');
  const { record } = await verdictOf({ ...c, reviews: [] });
  assert.equal(record.result, 'supported');
  assert.equal(verdictView(record).label, 'Supported');
});

test('the stored checks of every judge case stay small', async () => {
  for (const id of ['U01', 'U04', 'U20', 'T08']) {
    const { record } = await verdictOf(load(id));
    assert.deepEqual(record.checks, compactChecks(record.checks));
    assert.ok(JSON.stringify(record).length < 12000, id);
  }
});
