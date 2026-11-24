// Narrow ticket confirmation (owner decision 24 Nov; docs/DESIGN-TICKET-CONFIRMATION.md, middle
// way): a draft with a number, a currency or a money label is stored, not created. The person who
// drafted it creates it from the panel; the resolver checks the person, the time limit and the
// stored hash. Other drafts are created at once, as before.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextEvent } from '../src/audit.js';
import { confirmDraft, listDrafts, needsConfirmation, rejectDraft, storeDraft, DRAFT_TTL_MS } from '../src/ticket-draft.js';

function deps(now = 1_000_000) {
  const data = new Map();
  const events = [];
  let prev = null;
  const created = [];
  return {
    data, events, created, clock: { now },
    store: { get: async (k) => structuredClone(data.get(k)), set: async (k, v) => { data.set(k, structuredClone(v)); } },
    appendAudit: async (e) => { const ev = nextEvent(prev, { ...e, at: new Date(now).toISOString() }); prev = ev; events.push(ev); return ev; },
    create: async (draft, by) => { created.push({ draft, by }); return { ok: true, key: `BANK-${400 + created.length}` }; },
    now() { return this.clock.now; },
  };
}
const plain = { projectKey: 'BANK', summary: 'Show the customer name on the statement', description: 'The statement header shows the name.', issueType: 'Story', storyPoints: 3, acceptanceCriteria: [{ acId: 'AC1', text: 'the header has the customer name' }] };
const withNumber = { ...plain, summary: 'Refuse a transfer above 10000 EUR', acceptanceCriteria: [{ acId: 'AC1', text: 'an amount above 10000 gives 422' }] };

test('only a draft with a number, a currency or a money label needs confirmation', () => {
  assert.deepEqual(needsConfirmation(plain), []);
  assert.ok(needsConfirmation(withNumber).length > 0);
  assert.ok(needsConfirmation({ ...plain, description: 'Fees are charged in EUR.' }).includes('a currency'));
  assert.ok(needsConfirmation({ ...plain, description: 'The fee is shown in €.' }).includes('a currency'));
  assert.ok(needsConfirmation({ ...plain, labels: ['money_semantics'] }).includes('the label money_semantics'));
  // Story points are an estimate, not a number of the requirement.
  assert.deepEqual(needsConfirmation({ ...plain, storyPoints: 8 }), []);
});

test('a stored draft creates nothing and writes a ticket.drafted event with its hash', async () => {
  const d = deps();
  const r = await storeDraft({ by: 'pm-1', draft: withNumber, request: 'refuse transfers above 10000 EUR' }, d);
  assert.equal(r.ok, true);
  assert.equal(d.created.length, 0);
  assert.equal(d.events[0].event, 'ticket.drafted');
  assert.equal(d.events[0].data.hash, r.hash);
  const list = await listDrafts('pm-1', d);
  assert.deepEqual(list.map((x) => [x.draftId, x.draft.summary, x.request]), [[r.draftId, withNumber.summary, 'refuse transfers above 10000 EUR']]);
  assert.deepEqual(await listDrafts('someone-else', d), []);
});

test('the person who drafted it creates exactly the stored draft; a second Create returns the first work item', async () => {
  const d = deps();
  const { draftId, hash } = await storeDraft({ by: 'pm-1', draft: withNumber, request: 'r' }, d);
  const first = await confirmDraft({ draftId, accountId: 'pm-1' }, d);
  assert.equal(first.ok, true, first.error);
  assert.equal(first.key, 'BANK-401');
  assert.deepEqual(d.created[0], { draft: withNumber, by: 'pm-1' });
  const again = await confirmDraft({ draftId, accountId: 'pm-1' }, d);
  assert.deepEqual([again.ok, again.key, again.duplicate], [true, 'BANK-401', true]);
  assert.equal(d.created.length, 1);
  assert.ok(d.events.some((e) => e.event === 'ticket.draft_confirmed' && e.data.hash === hash && e.data.key === 'BANK-401'));
  assert.deepEqual(await listDrafts('pm-1', d), []);
});

test('another person, an expired draft, a changed stored draft or an unknown id is refused, and nothing is created', async () => {
  const d = deps();
  const { draftId } = await storeDraft({ by: 'pm-1', draft: withNumber, request: 'r' }, d);
  assert.match((await confirmDraft({ draftId, accountId: 'pm-2' }, d)).error, /only the person who drafted it/);
  assert.match((await confirmDraft({ draftId: 'nope', accountId: 'pm-1' }, d)).error, /no draft/);
  const stored = d.data.get(`ticket-draft:${draftId}`);
  d.data.set(`ticket-draft:${draftId}`, { ...stored, draft: { ...stored.draft, summary: 'Refuse a transfer above 99999 EUR' } });
  assert.match((await confirmDraft({ draftId, accountId: 'pm-1' }, d)).error, /changed after it was drafted/);
  d.data.set(`ticket-draft:${draftId}`, stored);
  d.clock.now += DRAFT_TTL_MS + 1;
  assert.match((await confirmDraft({ draftId, accountId: 'pm-1' }, d)).error, /expired/);
  assert.equal(d.created.length, 0);
});

test('Reject marks the draft rejected with an event; it can no longer be created', async () => {
  const d = deps();
  const { draftId } = await storeDraft({ by: 'pm-1', draft: withNumber, request: 'r' }, d);
  assert.match((await rejectDraft({ draftId, accountId: 'pm-2' }, d)).error, /only the person who drafted it/);
  assert.equal((await rejectDraft({ draftId, accountId: 'pm-1' }, d)).ok, true);
  assert.ok(d.events.some((e) => e.event === 'ticket.draft_rejected'));
  assert.match((await confirmDraft({ draftId, accountId: 'pm-1' }, d)).error, /rejected/);
  assert.equal(d.created.length, 0);
});

test('a failed create leaves the draft pending, so the person may try again', async () => {
  const d = deps();
  const { draftId } = await storeDraft({ by: 'pm-1', draft: withNumber, request: 'r' }, d);
  d.create = async () => ({ ok: false, error: 'Jira refused (HTTP 400)' });
  assert.equal((await confirmDraft({ draftId, accountId: 'pm-1' }, d)).ok, false);
  assert.equal((await listDrafts('pm-1', d)).length, 1);
});
