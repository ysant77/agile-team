// The local repair harness (bakeoff/repair/, C3 of 24 Nov 2026): the rules that hold no matter
// what a model asks. The patch scope is checked without any local tree. The sandbox and the
// scripted end-to-end runs need the bank's Python and the investigated tree, given as
// REPAIR_PYTHON and REPAIR_TREE; without them those tests are skipped (CI has neither).

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkPatch } from '../bakeoff/repair/patch.mjs';
import { runPytest, runSandboxed, TEST_ID } from '../bakeoff/repair/sandbox.mjs';

const exists = (p) => ['src/bank/ledger.py', 'src/bank/api.py', 'tests/test_ledger.py', 'scripts/repro.py', 'pyproject.toml'].includes(p);
const diff = (path, { add = false } = {}) => `--- ${add ? '/dev/null' : `a/${path}`}\n+++ b/${path}\n@@ -1,1 +1,1 @@\n-x\n+y\n`;

test('a patch may change Python files under src/ and add an agent test', () => {
  assert.equal(checkPatch(diff('src/bank/ledger.py'), { exists }).ok, true);
  assert.equal(checkPatch(diff('tests/test_agent_statement_end_date.py', { add: true }), { exists }).ok, true);
  assert.equal(checkPatch(diff('src/bank/ledger.py') + diff('tests/test_agent_x.py', { add: true }), { exists }).files.length, 2);
});

test('a patch may not touch the protected oracle, the tooling or the config', () => {
  for (const [d, why] of [
    [diff('tests/test_ledger.py'), /protected/],
    [diff('scripts/repro.py'), /protected/],
    [diff('pyproject.toml'), /protected/],
    [diff('.github/workflows/ci.yml'), /protected|not exist|plain relative path/],
    [diff('tests/test_hidden_check.py', { add: true }), /agent test/],
    [diff('tests/conftest_agent.py', { add: true }), /agent test/],
    [diff('src/bank/../../etc/x.py'), /plain relative path/],
    [diff('/etc/passwd'), /plain relative path|protected/],
    ['--- a/src/bank/ledger.py\n+++ /dev/null\n', /deleting/],
    ['diff --git a/src/bank/ledger.py b/src/bank/x.py\nrename from src/bank/ledger.py\nrename to src/bank/x.py\n', /renames/],
    ['Binary files a/src/x.py and b/src/x.py differ\n', /binary/],
    [diff('src/bank/new.py', { add: true }).replace('/dev/null', 'a/src/bank/new.py'), /does not exist/],
    [diff('tests/test_agent_a.py', { add: true }).replace('test_agent_a', 'test_ledger'), /agent test|exists/],
    ['', /empty/],
    ['just words', /no file/],
    ['x'.repeat(20_001), /larger/],
  ]) {
    const r = checkPatch(d, { exists });
    assert.equal(r.ok, false, d.slice(0, 80));
    assert.match(r.error, why, d.slice(0, 80));
  }
});

test('a test id is a plain test path; nothing else reaches pytest', () => {
  for (const ok of ['tests/test_ledger.py', 'tests/test_ledger.py::test_statement_running_balance', 'tests/test_agent_x.py::test_a[1]']) assert.ok(TEST_ID.test(ok), ok);
  for (const bad of ['-k x', 'tests/../x.py', '/tmp/t.py', 'tests/test_x.py; rm -rf /', 'tests/test_x.py --pdb', 'src/bank/ledger.py']) assert.equal(TEST_ID.test(bad) && !bad.includes('..'), false, bad);
  assert.throws(() => runPytest({ copy: '/nonexistent', python: 'python', tests: ['--co'] }), /not a test id/);
});

const PY = process.env.REPAIR_PYTHON;
const TREE = process.env.REPAIR_TREE;
const local = PY && existsSync(PY) && existsSync('/usr/bin/sandbox-exec');

test('the sandbox refuses the network and writes outside the scratch copy, and kills a run over its time', { skip: !local && 'REPAIR_PYTHON not set' }, () => {
  const s = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'sbx-'));
  try {
    const run = (code, timeoutMs = 10_000) => runSandboxed({ scratch: s, argv: [PY, '-c', code], env: { PYTHONDONTWRITEBYTECODE: '1' }, timeoutMs });
    assert.notEqual(run('import socket; socket.create_connection(("127.0.0.1", 11434), timeout=2)').status, 0);
    assert.notEqual(run('import socket; socket.getaddrinfo("api.github.com", 443)').status, 0);
    const outside = join(process.env.HOME, `sbx-probe-${process.pid}.txt`);
    assert.notEqual(run(`open(${JSON.stringify(outside)}, "w").write("x")`).status, 0);
    assert.equal(existsSync(outside), false);
    assert.equal(run(`open(${JSON.stringify(join(s, 'ok.txt'))}, "w").write("x")`).status, 0);
    const slow = run('import time; time.sleep(30)', 1500);
    assert.equal(slow.timedOut, true);
    // The environment is replaced: no variable of the caller reaches the run.
    process.env.REPAIR_TEST_SECRET = 'must-not-pass';
    assert.doesNotMatch(run('import os; print(sorted(os.environ))').stdout, /REPAIR_TEST_SECRET/);
  } finally {
    delete process.env.REPAIR_TEST_SECRET;
    rmSync(s, { recursive: true, force: true });
  }
});

const scripted = (steps) => { let i = 0; return async () => (i < steps.length ? { ok: true, content: '', toolCalls: steps[i++] } : { ok: true, content: 'done', toolCalls: [] }); };
const call = (name, args) => ({ name, arguments: args });
const FIX = `--- a/src/bank/ledger.py
+++ b/src/bank/ledger.py
@@ -399,7 +399,11 @@
     if start > end:
         raise LedgerError("statement start is after its end")
     account = get_account(conn, account_id)
-    lower, upper = start.isoformat(), end.isoformat()
+    try:
+        upper = (end + timedelta(days=1)).isoformat()
+    except OverflowError:
+        raise LedgerError("statement end is out of range") from None
+    lower = start.isoformat()
     (opening,) = conn.execute(
`;
const D21 = { id: 'D2-1', truth: 'end_day', symptom: 'A statement for 1 to 31 October leaves out a payment made on 31 October.', protected: ['tests/test_ledger.py'], hidden: 'D2-1.py' };

test('scripted run (not an agent): a patch that restores the inclusive end date is judged repaired by checks the script never saw', { skip: !(local && TREE && existsSync(TREE)) && 'REPAIR_PYTHON or REPAIR_TREE not set', timeout: 600_000 }, async () => {
  const { runRepair } = await import('../bakeoff/repair/task.mjs');
  const r = await runRepair(scripted([
    [call('run-check', { test: 'tests/test_ledger.py::test_statement_running_balance', on: 'base' })],
    [call('propose-patch', { diff: FIX.replace('ledger.py\n@@', 'ledger.py\n@@'), reason: 'the end date must be inclusive' })],
    [call('run-check', { test: 'tests/test_ledger.py::test_statement_running_balance', on: 'candidate' })],
  ]), D21, { tree: TREE, python: PY });
  assert.equal(r.trace[0].result.outcome, 'passed');
  assert.equal(r.patches[0].applied, true, r.patches[0].error);
  assert.equal(r.evaluation.hiddenOnBase, 'failed');
  assert.equal(r.evaluation.hiddenOnCandidate, 'passed');
  assert.match(r.evaluation.verdict, /^repaired/);
});

test('scripted run: a patch to a protected test is refused, and with no candidate nothing is repaired', { skip: !(local && TREE && existsSync(TREE)) && 'REPAIR_PYTHON or REPAIR_TREE not set', timeout: 600_000 }, async () => {
  const { runRepair } = await import('../bakeoff/repair/task.mjs');
  const r = await runRepair(scripted([
    [call('propose-patch', { diff: diff('tests/test_ledger.py'), reason: 'make the test pass' })],
    [call('run-check', { test: 'tests/test_ledger.py', on: 'candidate' })],
    [call('run-check', { test: '-k statement', on: 'base' })],
  ]), D21, { tree: TREE, python: PY });
  assert.equal(r.patches[0].applied, false);
  assert.match(r.patches[0].error, /protected/);
  assert.match(r.trace[1].result.error, /no candidate/);
  assert.equal(r.trace[2].ok, false);
  assert.equal(r.evaluation.verdict, 'no candidate patch');
});
