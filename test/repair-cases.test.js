// The development cases of the repair harness are valid cases (bakeoff/repair/cases-dev.json):
// the hidden check of a defect case fails on its seeded tree and passes on the clean tree, and the
// bank's own tests pass on the seeded tree (green CI that does not show the defect). Needs the
// local trees REPAIR_TREE_D7 and REPAIR_TREE_D7C and REPAIR_PYTHON; skipped without them.

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const cases = JSON.parse(readFileSync(new URL('../bakeoff/repair/cases-dev.json', import.meta.url), 'utf8'));
const symptoms = JSON.parse(readFileSync(new URL('../bakeoff/repair/symptoms-dev.json', import.meta.url), 'utf8'));

test('every development case is labelled development, and each case of the builder has its symptom here', () => {
  for (const c of cases) {
    assert.match(c.label, /^development/, c.id);
    assert.doesNotMatch(c.label, /blind|held out(?!,)/i, c.id);
    if (c.symptom_source === 'symptoms-dev.json') assert.ok(symptoms.find((s) => s.id === c.id)?.symptom, c.id);
    if (c.truth === 'none') assert.equal(c.hidden, null, c.id);
    else assert.ok(existsSync(new URL(`../bakeoff/repair/hidden/${c.hidden}`, import.meta.url)), c.id);
  }
});

const { REPAIR_PYTHON: PY, REPAIR_TREE_D7: SEEDED, REPAIR_TREE_D7C: CLEAN } = process.env;
const local = PY && SEEDED && CLEAN && [PY, SEEDED, CLEAN].every((p) => existsSync(p));

test('D7-1: the hidden check fails on the seeded tree and passes on the clean one; the bank tests pass on both', { skip: !local && 'local trees not set', timeout: 300_000 }, async () => {
  const { makeCopy } = await import('../bakeoff/repair/patch.mjs');
  const { runPytest } = await import('../bakeoff/repair/sandbox.mjs');
  const kase = cases.find((c) => c.id === 'D7-1');
  const at = (tree) => {
    const w = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'case-'));
    try {
      const c = makeCopy(tree, join(w, 'c'));
      cpSync(new URL(`../bakeoff/repair/hidden/${kase.hidden}`, import.meta.url), join(c, 'tests/test_hidden_check.py'));
      return { own: runPytest({ copy: c, python: PY, tests: kase.protected }).outcome, hidden: runPytest({ copy: c, python: PY, tests: ['tests/test_hidden_check.py'] }).outcome };
    } finally {
      rmSync(w, { recursive: true, force: true });
    }
  };
  assert.deepEqual(at(SEEDED), { own: 'passed', hidden: 'failed' });
  assert.deepEqual(at(CLEAN), { own: 'passed', hidden: 'passed' });
});
