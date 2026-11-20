// Judge path (docs/JUDGE-PATH.md): the five real benchmark cases run through decide(), the verdict
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
import { nextEvent } from '../src/audit.js';
import { CASES, seedOf } from '../scripts/judge-seed.mjs';

const load = (id) => JSON.parse(readFileSync(new URL(`../fixtures/judge/${id}.json`, import.meta.url), 'utf8'));

// claimant: the Jira account that made the claim. signoff: the aat.signoff property and its audit
// event (as the panel's sign-off button writes them).
async function verdictOf(c, { claimant = 'dev-a', signoff = null } = {}) {
  const d = {
    collectJira: async () => ({ subtasks: [], links: [], ...structuredClone(c.ticket), ...(signoff ? { signoff: signoff.property } : {}) }),
    readAudit: async (seq) => (signoff && seq === signoff.event.seq ? [structuredClone(signoff.event)] : []),
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: 'local' }),
    collectGithub, collectPrStats, fetchFn: fetchFrom(c.github),
    collectReviews: async () => structuredClone(c.reviews ?? []),
  };
  const log = console.log;
  console.log = () => {};
  try {
    const out = await decide({ issueKey: c.ticket.key, claim: { id: `judge-${c.id}`, type: c.claim, text: `${c.claim} claimed`, by: claimant } }, d);
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

async function screen(id, opts) {
  const c = load(id);
  const { record, verdict } = await verdictOf(c, opts);
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

// The evidence of set 4 with the protected regression set (pinned base tests, bank PR 21). The PR
// makes an old assertion weaker; the base copy of that test fails on the head code.
test('U20 (set 4): Contradicted by the protected set, and the wrong kind of failure is also shown', async () => {
  const s = await screen('U20');
  assert.equal(s.verdict.result, 'contradicted');
  assert.equal(s.items.find(([n]) => n === 'Lozenge')[1], 'Contradicted');
  const why = s.texts.find((t) => t.startsWith('Why: '));
  assert.match(why, /pinned base test: test_account_numbers_are_obviously_fake: its base copy fails on the head code/);
  assert.match(why, /approval of the new pin by a person other than the claimant/);
  assert.ok(after(s.items, 'What failed').some((t) => t.includes('pinned_tests_hold')), JSON.stringify(after(s.items, 'What failed')));
  assert.ok(after(s.items, 'What was not checked').some((t) => t.includes('fails on base by Failed, not by an assertion')));
  common(s);
});

// U12 (set 4): a money rule (Jira label money_semantics). Code checks all pass, but "done" needs a
// person's sign-off of the merged commit, and the sign-off must come from another person.
const U12_SHA = () => load('U12').github.pulls[0].merge_commit_sha;
function signoffBy(by, { sha = U12_SHA(), key = load('U12').ticket.key } = {}) {
  const event = nextEvent({ seq: 40, hash: 'f'.repeat(64) }, { actor: by, event: 'change.signed_off', data: { key, sha, reason: 'the finance owner accepts zero decimals' }, at: '2026-11-20T09:00:00.000Z' });
  return { event, property: { by, sha, reason: 'the finance owner accepts zero decimals', at: event.at, auditSeq: event.seq } };
}

test('U12 (set 4): Cannot verify, because the money rule has no sign-off', async () => {
  const s = await screen('U12');
  assert.equal(s.verdict.result, 'cannot_verify');
  assert.equal(s.items.find(([n]) => n === 'Lozenge')[1], 'Cannot verify');
  assert.ok(s.texts.includes("Why: money_semantics: a person's sign-off of the merged change is required, and none is recorded"));
  assert.ok(after(s.items, 'What was proved').some((t) => t.startsWith('reproduced')), 'the code checks passed');
  common(s);
});

test('U12: a sign-off by the claimant does not count', async () => {
  const s = await screen('U12', { claimant: 'dev-a', signoff: signoffBy('dev-a') });
  assert.equal(s.verdict.result, 'cannot_verify');
  assert.match(s.texts.find((t) => t.startsWith('Why: ')), /the claimant signed off their own claim; another person must sign off/);
});

test('U12: a sign-off of another commit does not count', async () => {
  const s = await screen('U12', { signoff: signoffBy('finance-b', { sha: 'a'.repeat(40) }) });
  assert.equal(s.verdict.result, 'cannot_verify');
  assert.match(s.texts.find((t) => t.startsWith('Why: ')), /the sign-off is for aaaaaaa, not the merged commit/);
});

test('U12: after a sign-off of the merged commit by another person, the claim again is Supported', async () => {
  const s = await screen('U12', { claimant: 'dev-a', signoff: signoffBy('finance-b') });
  assert.equal(s.verdict.result, 'supported');
  assert.equal(s.items.find(([n]) => n === 'Lozenge')[1], 'Supported');
  assert.ok(after(s.items, 'What was proved').some((t) => t.startsWith('human_signoff') && t.includes('signed off by finance-b')), JSON.stringify(after(s.items, 'What was proved')));
  common(s);
});

test('the seed script covers the five judge cases; U12 needs the label and a second person', () => {
  assert.deepEqual(CASES, ['U01', 'U04', 'U20', 'U12', 'T08']);
  const u12 = seedOf(load('U12'), 'BANK-64');
  assert.deepEqual(u12.labels, ['money_semantics']);
  assert.equal(u12.branch, 'case/U12');
  assert.match(u12.expected, /cannot_verify/);
  assert.match(u12.expected, /another person/);
  assert.match(u12.prTitle, /^BANK-64 /);
  assert.equal(seedOf(load('U20'), 'BANK-62').expected.startsWith('contradicted'), true);
  assert.deepEqual(seedOf(load('U01'), 'BANK-60').labels, []);
  assert.match(seedOf(load('T08'), 'BANK-63').expected, /^supported; the reviewer's finding is shown as advice, not counted/);
});

test('T08 (set 3): Supported by code; the model\'s defect text is shown as advice, not counted', async () => {
  const s = await screen('T08');
  assert.equal(s.verdict.result, 'supported');
  assert.equal('reviewHold' in s.record, false);
  assert.equal(s.items.find(([n]) => n === 'Lozenge')[1], 'Supported');
  const advice = after(s.items, 'Advice from a model, not counted');
  assert.ok(advice.some((t) => /Code does not handle kind=debit case for filtering lines\./.test(t)), JSON.stringify(advice));
  assert.ok(advice.some((t) => /does not change the verdict/.test(t)), JSON.stringify(advice));
  assert.doesNotMatch(s.texts.find((t) => t.startsWith('Why: ')), /kind=debit/);
  common(s);
});

test('without the review, T08 is Supported by code alone (the set 3 gap)', async () => {
  const c = load('T08');
  const { record } = await verdictOf({ ...c, reviews: [] });
  assert.equal(record.result, 'supported');
  assert.equal(verdictView(record).label, 'Supported');
});

test('the stored checks of every judge case stay small', async () => {
  for (const id of ['U01', 'U04', 'U20', 'U12', 'T08']) {
    const { record } = await verdictOf(load(id));
    assert.deepEqual(record.checks, compactChecks(record.checks));
    assert.ok(JSON.stringify(record).length < 12000, id);
  }
});

// The live U12 flow through the panel action (lead, 21 Nov): claim, the claimant is refused, a
// second person signs off with the button, claim again, Supported. The verdict record names the
// claimant and the merged commit, so the button needs neither from the person.
test('U12 through the sign-off button: the claimant is refused, a second person signs off, the claim again is Supported', async () => {
  const { signOffAction, SIGNOFF_CLAIMANT_REFUSAL } = await import('../src/sign-off.js');
  const first = await verdictOf(load('U12'), { claimant: 'dev-a' });
  assert.equal(first.record.result, 'cannot_verify');
  assert.equal(first.record.claimant, 'dev-a');
  assert.equal(first.record.mergeSha, U12_SHA());
  let prev = { seq: 40, hash: 'f'.repeat(64) };
  const written = [];
  const deps = {
    canEdit: async () => true,
    readVerdicts: async () => [first.record],
    appendAudit: async (e) => { prev = nextEvent(prev, { ...e, at: '2026-11-21T02:00:00.000Z' }); written.push(prev); return prev; },
    writeSignoff: async (key, s) => { written.push(s); return { ok: true }; },
  };
  const key = load('U12').ticket.key;
  const self = await signOffAction({ key, accountId: 'dev-a', payload: { reason: 'my own change is fine' } }, deps);
  assert.deepEqual(self, { ok: false, error: SIGNOFF_CLAIMANT_REFUSAL });
  assert.equal(written.length, 0);
  const ok = await signOffAction({ key, accountId: 'finance-b', payload: { reason: 'the finance owner accepts zero decimals' } }, deps);
  assert.equal(ok.ok, true, ok.error);
  const [event, property] = written;
  const again = await verdictOf(load('U12'), { claimant: 'dev-a', signoff: { event, property } });
  assert.equal(again.record.result, 'supported', again.record.reason);
});
