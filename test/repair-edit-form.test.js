// C3 follow-up (lead's go, 24 Nov): propose-patch takes edits { path, old, new } in place of a
// unified diff. In repair-dev-1, 8 of 14 diffs did not apply because their context lines did not
// match. The harness applies an edit only when "old" occurs exactly once; all edits of one call
// apply, or none.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyEdits, PATCH_LIMITS } from '../bakeoff/repair/patch.mjs';

const SRC = 'def statement(start, end):\n    lower, upper = start, end\n    return rows(lower, upper)\n\n\ndef other():\n    return 1\n';
function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'edit-'));
  mkdirSync(join(dir, 'src/bank'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'src/bank/ledger.py'), SRC);
  writeFileSync(join(dir, 'tests/test_ledger.py'), 'def test_x():\n    assert True\n');
  return dir;
}
const read = (dir, p) => readFileSync(join(dir, p), 'utf8');

test('an edit whose old text occurs once is applied, and the resulting diff is returned', () => {
  const dir = copy();
  const r = applyEdits(dir, [{ path: 'src/bank/ledger.py', old: '    lower, upper = start, end\n', new: '    lower, upper = start, end + 1\n' }]);
  assert.equal(r.ok, true, r.error);
  assert.match(read(dir, 'src/bank/ledger.py'), /end \+ 1/);
  assert.deepEqual(r.files, [{ path: 'src/bank/ledger.py', kind: 'modify' }]);
  assert.match(r.diff, /^--- a\/src\/bank\/ledger.py/m);
  assert.match(r.diff, /^\+    lower, upper = start, end \+ 1$/m);
});

test('old text that occurs 0 or 2 times is refused with the count, and nothing changes', () => {
  const dir = copy();
  const none = applyEdits(dir, [{ path: 'src/bank/ledger.py', old: 'not there', new: 'x' }]);
  assert.equal(none.ok, false);
  assert.match(none.error, /occurs 0 times/);
  const twice = applyEdits(dir, [{ path: 'src/bank/ledger.py', old: 'return ', new: 'return  ' }]);
  assert.match(twice.error, /occurs 2 times/);
  assert.equal(read(dir, 'src/bank/ledger.py'), SRC);
});

test('all edits of one call apply, or none', () => {
  const dir = copy();
  const r = applyEdits(dir, [
    { path: 'src/bank/ledger.py', old: '    return 1\n', new: '    return 2\n' },
    { path: 'src/bank/ledger.py', old: 'missing', new: 'y' },
  ]);
  assert.equal(r.ok, false);
  assert.equal(read(dir, 'src/bank/ledger.py'), SRC);
});

test('a new agent test is created only with empty old text and only when absent', () => {
  const dir = copy();
  const ok = applyEdits(dir, [{ path: 'tests/test_agent_end_day.py', old: '', new: 'def test_end_day():\n    assert False\n' }]);
  assert.equal(ok.ok, true, ok.error);
  assert.ok(existsSync(join(dir, 'tests/test_agent_end_day.py')));
  assert.deepEqual(ok.files, [{ path: 'tests/test_agent_end_day.py', kind: 'add' }]);
  assert.match(applyEdits(dir, [{ path: 'tests/test_agent_end_day.py', old: '', new: 'x' }]).error, /exists/);
  assert.match(applyEdits(dir, [{ path: 'src/bank/ledger.py', old: '', new: 'x' }]).error, /exists/);
});

test('protected files, unsafe paths and other kinds of file are refused', () => {
  const dir = copy();
  for (const [path, re] of [['tests/test_ledger.py', /protected/], ['../etc/x.py', /plain relative path/], ['.github/workflows/ci.yml', /protected/],
    ['tests/conftest.py', /protected/], ['src/bank/new_module.txt', /protected|Python/]]) {
    const r = applyEdits(dir, [{ path, old: 'a', new: 'b' }]);
    assert.equal(r.ok, false, path);
    assert.match(r.error, re, path);
  }
  assert.equal(read(dir, 'tests/test_ledger.py'), 'def test_x():\n    assert True\n');
});

test('old text copied with the "N: " line numbers of read-repo-file is matched once without them', () => {
  const dir = copy();
  const r = applyEdits(dir, [{ path: 'src/bank/ledger.py', old: '2:     lower, upper = start, end\n3:     return rows(lower, upper)', new: '    lower, upper = start, end + 1\n    return rows(lower, upper)' }]);
  assert.equal(r.ok, true, r.error);
  assert.match(read(dir, 'src/bank/ledger.py'), /end \+ 1\n    return rows/);
});

test('the limits hold: no edits, too many files, or a result too large is refused', () => {
  const dir = copy();
  assert.match(applyEdits(dir, []).error, /no edit/);
  assert.match(applyEdits(dir, 'x').error, /no edit/);
  const many = Array.from({ length: PATCH_LIMITS.maxFiles + 1 }, (_, i) => ({ path: `tests/test_agent_t${i}.py`, old: '', new: 'def test_a():\n    pass\n' }));
  assert.match(applyEdits(dir, many).error, /more than/);
  const big = applyEdits(dir, [{ path: 'src/bank/ledger.py', old: '    return 1\n', new: `    return 1\n${'# x\n'.repeat(PATCH_LIMITS.maxBytes / 4)}` }]);
  assert.match(big.error, /larger than/);
  assert.equal(read(dir, 'src/bank/ledger.py'), SRC);
});
