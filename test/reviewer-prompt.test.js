// The reviewer prompt and the review skill must tell the model the two rules that the review
// guards enforce for proposed checks (src/review.js): no check for an AC that has a code check,
// and no number in `asserts` that the packet does not hold. On 22 Nov a live review was refused
// as a whole (guard ungrounded-number) for a count in the asserts of a check for such an AC.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const RULE = 'Do not propose a check for an AC that has a code check, and write no count or other number in asserts unless that number is in the AC or a hunk.';
const flat = (t) => t.replace(/`/g, '').replace(/\s+/g, ' ');

function reviewerPrompt() {
  const manifest = readFileSync('manifest.yml', 'utf8');
  const agent = manifest.split('    - key: reviewer-agent\n')[1];
  assert.ok(agent, 'manifest.yml has the reviewer-agent');
  const prompt = agent.split('      prompt: >\n')[1]?.split('      conversationStarters:')[0];
  assert.ok(prompt, 'the reviewer-agent has a folded prompt');
  return flat(prompt);
}

test('the reviewer prompt states the rule for proposed checks', () => {
  assert.ok(reviewerPrompt().includes(RULE));
});

test('the review skill states the rule for proposed checks', () => {
  assert.ok(flat(readFileSync('skills/review-pull-request/SKILL.md', 'utf8')).includes(RULE));
});
