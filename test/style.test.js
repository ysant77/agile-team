// Plain controlled English: the lint, every rendered text, the opinion gate, and the pass rates.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { styleGate, templateOpinion } from '../src/opinion-style.js';
import { lintText, sentences } from '../src/style.js';
import { MODEL_SAMPLES, renderedTexts } from './style-set.js';

test('the lint finds long sentences, passives, hedges, praise and missing sources', () => {
  const rules = (t, o) => lintText(t, o).findings.map((f) => f.rule);
  assert.deepEqual(rules('Add one check per line.'), []);
  assert.ok(rules('The balance is checked before the debit.').includes('passive'));
  assert.deepEqual(rules('The claim is supported.'), []); // a verdict name, not a passive
  assert.ok(rules('This seems fine.').includes('hedge'));
  assert.ok(rules('A robust fix.').includes('praise'));
  assert.ok(rules(`${'word '.repeat(21)}end.`, { kind: 'instruction' }).includes('long-sentence'));
  assert.deepEqual(rules(`${'word '.repeat(21)}end.`, { kind: 'description' }), []);
  assert.ok(rules('The model is ready.', { needSource: true }).includes('no-source'));
  assert.deepEqual(rules('PR-AUC is 0.39 (E1).', { needSource: true }), []);
  assert.equal(sentences('- one item\n- two. Three.').length, 3);
});

test('every text that code renders for a human passes the lint', () => {
  for (const [id, text] of renderedTexts()) assert.deepEqual(lintText(text).findings, [], id);
});

const record = (text, risks = []) => ({ outcome: 'opinion', opinion: { decision: 'PR7', reasons: [{ text, evidence: ['E3'] }], confidence: 0.8, risks } });

test('a plain opinion passes; a wordy one gets one retry, then a template', () => {
  assert.equal(styleGate(record('PR7 keeps one write path (E3).'), 0).record.style, 'pass');
  const first = styleGate(record('PR7 is clearly the better and more robust choice.'), 0);
  assert.equal(first.action, 'retry');
  assert.match(first.message, /praise/);
  const second = styleGate(record('PR7 is clearly the better and more robust choice.'), 1);
  assert.equal(second.action, 'accept');
  assert.equal(second.record.style, 'fallback');
  assert.equal(second.record.opinion.reasons[0].text, 'Reason 1 for PR7: see E3.');
  assert.equal(second.record.opinion.decision, 'PR7');
  assert.ok(lintText(second.record.opinion.reasons[0].text).pass);
  assert.deepEqual(templateOpinion(record('x', ['y']).opinion).risks, ['Risk 1: see the audited opinion input.']);
});

test('pass rates on the style set (reported in the PR)', () => {
  const rendered = renderedTexts().filter(([, t]) => lintText(t).pass).length;
  assert.equal(rendered, renderedTexts().length);
  // Model-style samples: without the gate about half pass; with lint, one retry and the template
  // fallback, every shown text passes (a retry cannot be replayed offline, so it counts as failed).
  const before = MODEL_SAMPLES.filter((s) => lintText(s.text, s).pass).length;
  assert.equal(before, 5);
  const after = MODEL_SAMPLES.map((s) => {
    const g = styleGate(record(s.text), 1);
    return lintText(g.record.opinion.reasons[0].text, { needSource: s.needSource }).pass;
  }).filter(Boolean).length;
  assert.equal(after, MODEL_SAMPLES.length);
});

test('live answers from 13 Nov pass the lint (claim type names are defined terms)', async () => {
  const { readFileSync } = await import('node:fs');
  const live = JSON.parse(readFileSync('test/fixtures-style/live-2026-11-13.json', 'utf8'));
  for (const s of live) assert.deepEqual(lintText(s.text, s).findings, [], s.id);
});
