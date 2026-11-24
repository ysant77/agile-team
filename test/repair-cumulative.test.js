// Lead's rulings on the repair harness (24 Nov, after development run 2): (1) the patches of one run
// build on each other, and a "reset" call returns to the base; (2) on a control, "invented a
// defect" means a change of src/ or a recorded defect; a test-only candidate that passes on base is
// counted apart as "added a test, no defect claimed". Run 2 stays scored by its frozen rule.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { controlVerdict, runRepair } from '../bakeoff/repair/task.mjs';

function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'cumul-'));
  mkdirSync(join(dir, 'src/bank'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'src/bank/a.py'), 'X = 1\nY = 2\n');
  writeFileSync(join(dir, 'tests/test_a.py'), 'def test_a():\n    assert True\n');
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'base');
  return dir;
}
const scripted = (steps) => { let i = 0; return async () => (i < steps.length ? { ok: true, content: '', toolCalls: steps[i++] } : { ok: true, content: 'done', toolCalls: [] }); };
const call = (name, args) => ({ name, arguments: args });
const kase = { id: 'T', truth: 'x', symptom: 's', protected: [], hidden: null };

test('a second patch applies to the state after the first; the final state is the candidate', async () => {
  const r = await runRepair(scripted([
    [call('propose-patch', { edits: [{ path: 'src/bank/a.py', old: 'X = 1\n', new: 'X = 10\n' }], reason: 'one' })],
    [call('propose-patch', { edits: [{ path: 'src/bank/b.py', old: '', new: 'Z = 3\n' }], reason: 'two' })],
  ]), kase, { tree: tree(), python: process.execPath, keep: true });
  assert.deepEqual(r.candidateFiles, ['src/bank/a.py', 'src/bank/b.py']);
  assert.equal(readFileSync(join(r.candidateDir, 'src/bank/a.py'), 'utf8'), 'X = 10\nY = 2\n');
  assert.equal(readFileSync(join(r.candidateDir, 'src/bank/b.py'), 'utf8'), 'Z = 3\n');
});

test('an edit that refers to text an earlier patch changed sees the changed text', async () => {
  const r = await runRepair(scripted([
    [call('propose-patch', { edits: [{ path: 'src/bank/a.py', old: 'X = 1\n', new: 'X = 10\n' }], reason: 'one' })],
    [call('propose-patch', { edits: [{ path: 'src/bank/a.py', old: 'X = 10\n', new: 'X = 11\n' }], reason: 'two' })],
  ]), kase, { tree: tree(), python: process.execPath, keep: true });
  assert.equal(r.patches[1].applied, true, r.patches[1].error);
  assert.equal(readFileSync(join(r.candidateDir, 'src/bank/a.py'), 'utf8'), 'X = 11\nY = 2\n');
});

test('a refused patch leaves the candidate as it was; reset returns to the base', async () => {
  const r = await runRepair(scripted([
    [call('propose-patch', { edits: [{ path: 'src/bank/a.py', old: 'X = 1\n', new: 'X = 10\n' }], reason: 'one' })],
    [call('propose-patch', { edits: [{ path: 'tests/test_a.py', old: 'def', new: 'def ' }], reason: 'protected' })],
    [call('reset', {})],
    [call('propose-patch', { edits: [{ path: 'src/bank/a.py', old: 'Y = 2\n', new: 'Y = 20\n' }], reason: 'three' })],
  ]), kase, { tree: tree(), python: process.execPath, keep: true });
  assert.equal(r.patches[1].applied, false);
  assert.equal(r.trace[2].tool, 'reset');
  assert.equal(r.trace[2].ok, true);
  assert.equal(readFileSync(join(r.candidateDir, 'src/bank/a.py'), 'utf8'), 'X = 1\nY = 20\n');
  assert.deepEqual(r.candidateFiles, ['src/bank/a.py']);
});

test('control rule: a src change or a recorded defect is invented; a test-only candidate is counted apart', () => {
  assert.equal(controlVerdict({ candidateFiles: ['src/bank/a.py'], finding: null }), 'invented a defect: the candidate changes src/');
  assert.equal(controlVerdict({ candidateFiles: [], finding: { kind: 'defect' } }), 'invented a defect: a defect was recorded');
  assert.equal(controlVerdict({ candidateFiles: ['tests/test_agent_x.py'], finding: { kind: 'unclear' }, agentTests: [{ onBase: 'passed' }] }), 'added a test, no defect claimed');
  assert.equal(controlVerdict({ candidateFiles: ['tests/test_agent_x.py'], finding: null, agentTests: [{ onBase: 'failed' }] }), 'invented a defect: an added test fails on base');
  assert.equal(controlVerdict({ candidateFiles: [], finding: null }), 'no change (as a clean control should)');
});
