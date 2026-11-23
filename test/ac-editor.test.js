// Fresh-site path, option 1a (docs/DESIGN-FRESH-SITE.md): a person enters the ACs in the panel
// and saves them; the app writes the ticket spec as the user and records the ACs with an audit
// event, with no REST console.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acHash } from '../src/approvals.js';
import { acEditorText, saveAcsAction } from '../src/ac-editor.js';
import { acLineErrors } from '../src/ticket-spec.js';
import { createTicket } from '../src/index.js';

const LINES = 'AC1 | credits only | test_passes(test_statement_can_show_credits_only)\nAC2 | debits too | test_passes(test_a, test_b)';

function deps({ canEdit = true, spec = { version: 1, domain: 'money_semantics', acceptanceCriteria: [] }, writeOk = true } = {}) {
  const calls = { writes: [], audits: [], store: new Map() };
  let stored = structuredClone(spec);
  return {
    calls,
    canEdit: async () => canEdit,
    readSpec: async () => structuredClone(stored),
    writeSpec: async (key, next) => {
      calls.writes.push({ key, next: structuredClone(next) });
      if (writeOk) stored = structuredClone(next);
      return writeOk ? { ok: true, status: 200 } : { ok: false, status: 403 };
    },
    // The verifier reads the ACs back from the property (as recordAcsAction does).
    readAcs: async () => structuredClone(stored?.acceptanceCriteria ?? []),
    appendAudit: async (e) => { calls.audits.push(e); return { seq: 40 + calls.audits.length, at: '2026-11-23T10:00:00.000Z' }; },
    store: { get: async (k) => calls.store.get(k), set: async (k, v) => { calls.store.set(k, v); } },
  };
}
const save = (d, text = LINES, accountId = 'po') => saveAcsAction({ key: 'KAN-1', accountId, payload: { text } }, d);

test('saving writes the ACs as typed, keeps the other spec fields, and records them with an audit event', async () => {
  const d = deps();
  const r = await save(d);
  assert.equal(r.ok, true, r.error);
  const written = d.calls.writes[0].next;
  assert.equal(written.domain, 'money_semantics');
  assert.deepEqual(written.acceptanceCriteria.map((a) => a.acId), ['AC1', 'AC2']);
  // The names are kept as typed: no {TOKEN} rename, and every name of test_passes stays.
  assert.deepEqual(written.acceptanceCriteria[1].check, { type: 'test_passes', args: ['test_a', 'test_b'] });
  assert.equal(d.calls.audits.at(-1).event, 'acs.recorded');
  assert.equal(d.calls.audits.at(-1).data.acHash, acHash(written.acceptanceCriteria));
  assert.equal(r.acsAuditSeq, 40 + d.calls.audits.length);
});

test('a person who cannot edit the work item cannot save ACs; nothing is written', async () => {
  const d = deps({ canEdit: false });
  const r = await save(d);
  assert.equal(r.ok, false);
  assert.match(r.error, /edit this work item/);
  assert.equal(d.calls.writes.length, 0);
  assert.equal(d.calls.audits.length, 0);
});

test('malformed lines and an empty test_passes() are refused with the create-ticket messages', async () => {
  for (const text of ['AC1 credits only', 'AC1 | x | test_passes()']) {
    const d = deps();
    const r = await save(d, text);
    assert.equal(r.ok, false, text);
    assert.equal(r.error, acLineErrors(text), text);
    assert.equal(d.calls.writes.length, 0);
  }
  const created = await createTicket({ projectKey: 'KAN', summary: 's', issueType: 'Story', storyPoints: 3, acceptanceCriteria: 'AC1 credits only' });
  assert.equal(created.error, acLineErrors('AC1 credits only'));
});

test('no AC line at all is refused', async () => {
  const r = await save(deps(), '   ');
  assert.equal(r.ok, false);
  assert.match(r.error, /at least one AC line/);
});

test('a refused write records nothing', async () => {
  const d = deps({ writeOk: false });
  const r = await save(d);
  assert.equal(r.ok, false);
  assert.match(r.error, /Jira refused the ACs \(HTTP 403\)/);
  assert.equal(d.calls.audits.length, 0);
});

test('a work item with no spec gets a new one', async () => {
  const d = deps({ spec: null });
  const r = await save(d);
  assert.equal(r.ok, true, r.error);
  assert.equal(d.calls.writes[0].next.version, 1);
});

test('the editor shows the stored ACs in the line form it accepts', () => {
  const acs = [{ acId: 'AC1', statement: 'credits only', check: { type: 'test_passes', args: ['test_x', 'test_y'] } }];
  const text = acEditorText(acs);
  assert.equal(text, 'AC1 | credits only | test_passes(test_x, test_y)');
  assert.equal(acLineErrors(text), null);
});
