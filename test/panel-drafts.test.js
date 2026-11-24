// The panel section for stored ticket drafts: it shows the draft beside the request and offers
// Create and Reject; with no draft it shows nothing.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { DraftSection } from '../src/frontend/draft-section.js';

const ui = Object.fromEntries(['Box', 'Button', 'Heading', 'Inline', 'SectionMessage', 'Stack', 'Text'].map((n) => [n, n]));
function texts(el, out = []) {
  if (el == null || typeof el === 'boolean') return out;
  if (typeof el === 'string' || typeof el === 'number') { out.push(String(el)); return out; }
  if (Array.isArray(el)) { el.forEach((x) => texts(x, out)); return out; }
  texts(el.props?.children, out);
  return out;
}
const draft = { draftId: 'd1', request: 'refuse transfers above 10000 EUR', expiresAt: Date.parse('2026-11-24T12:00:00Z'), why: ['a number', 'a currency'],
  draft: { projectKey: 'BANK', issueType: 'Story', summary: 'Refuse a transfer above 10000 EUR', description: 'Refused above the limit.', acceptanceCriteria: [{ acId: 'AC1', text: 'above 10000 EUR gives 422' }] } };

test('a draft is shown with its request, its ACs, why it waits, and Create and Reject', () => {
  const calls = [];
  const el = DraftSection({ drafts: [draft], onCreate: (id) => calls.push(['create', id]), onReject: (id) => calls.push(['reject', id]), ui });
  const t = texts(el).join('\n');
  assert.match(t, /Drafts waiting for you/);
  assert.match(t, /BANK Story: Refuse a transfer above 10000 EUR/);
  assert.match(t, /Request: refuse transfers above 10000 EUR/);
  assert.match(t, /AC1: above 10000 EUR gives 422/);
  assert.match(t, /it states a number and a currency/);
  assert.match(t, /Expires 2026-11-24 12:00 UTC/);
  assert.match(t, /Create/);
  assert.match(t, /Reject/);
});

test('with no draft the section shows nothing', () => {
  assert.equal(DraftSection({ drafts: [], onCreate() {}, onReject() {}, ui }), null);
});
