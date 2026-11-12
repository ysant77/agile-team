import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lintRequirement } from '../src/lint.js';

test('lint accepts a plural actor', () => {
  const draft = (description) => ({ summary: 'Send button on phones', description,
    acceptanceCriteria: [{ acId: 'AC1', statement: 's', check: { type: 'manual', args: [] } }] });
  const rules = (d) => lintRequirement(draft(d)).findings.map((f) => f.rule);
  assert.ok(!rules('On phones, users see the Send button').includes('no-actor'));
  assert.ok(rules('On phones, the Send button is visible').includes('no-actor'));
});
