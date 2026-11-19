// f5: the bake-off task for discovery from symptoms (benchmark/DISCOVERY-PROTOCOL.md). The task
// serves the GitHub calls from a local git work tree of the investigated branch, runs the same
// rules as the Forge actions (src/discovery.js), and scores each run by code.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadDiscoveryCases, localGithub, pmPrompt, runDiscovery, scoreDiscovery } from '../bakeoff/tasks/discovery.js';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'disc-task-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'investigate/symptoms');
  git('config', 'user.name', 'T');
  git('config', 'user.email', 't@example.invalid');
  mkdirSync(join(dir, 'src/bank/web'), { recursive: true });
  writeFileSync(join(dir, 'src/bank/ledger.py'), 'def withdraw():\n    check()\n    time.sleep(0.01)\n    write()\n');
  writeFileSync(join(dir, 'src/bank/web/app.css'), '#send-button { color: red; }\n');
  writeFileSync(join(dir, 'README.md'), 'Bank.\n');
  symlinkSync('../../README.md', join(dir, 'src/bank/link.py'));
  git('add', '-A');
  git('commit', '-q', '-m', 'x');
  return { dir, sha: git('rev-parse', 'HEAD').trim(), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('localGithub answers the four GitHub calls from the work tree at its commit', async () => {
  const r = repo();
  try {
    const get = localGithub(r.dir);
    const head = await get('/repos/local/investigated/commits/investigate%2Fsymptoms');
    assert.equal((await head.json()).sha, r.sha);
    assert.equal((await get('/repos/local/investigated/commits/main')).status, 404);
    const tree = await (await get(`/repos/local/investigated/git/trees/${r.sha}?recursive=1`)).json();
    assert.deepEqual(tree.tree.map((e) => e.path).sort(), ['README.md', 'src/bank/ledger.py', 'src/bank/link.py', 'src/bank/web/app.css']);
    const file = await (await get(`/repos/local/investigated/contents/src/bank/ledger.py?ref=${r.sha}`)).json();
    assert.equal(file.type, 'file');
    assert.match(Buffer.from(file.content, 'base64').toString(), /time\.sleep/);
    assert.equal((await (await get(`/repos/local/investigated/contents/src/bank/link.py?ref=${r.sha}`)).json()).type, 'symlink');
    assert.equal((await get(`/repos/local/investigated/contents/src/none.py?ref=${r.sha}`)).status, 404);
    assert.deepEqual((await (await get(`/repos/local/investigated/actions/runs?head_sha=${r.sha}&per_page=20`)).json()).workflow_runs, []);
  } finally {
    r.cleanup();
  }
});

test('the system prompt is the deployed PM agent prompt from the manifest', () => {
  const p = pmPrompt();
  assert.match(p, /^You are the product manager and scrum master/);
  assert.match(p, /call start-investigation with the user's words/i);
});

test('scoreDiscovery: a defect needs the pattern and the right file; the control needs no defect', () => {
  const race = { id: 'D1', truth: 'race' };
  const ok = { kind: 'defect', hypothesis: 'Two withdrawals at the same time both pass the balance check.', citations: [{ file: 'src/bank/ledger.py', line: 3 }] };
  assert.equal(scoreDiscovery(race, ok).score, 1);
  assert.equal(scoreDiscovery(race, { ...ok, citations: [{ file: 'src/bank/api.py', line: 3 }] }).score, 0);
  assert.equal(scoreDiscovery(race, { ...ok, hypothesis: 'The amount is parsed wrongly.' }).score, 0);
  assert.equal(scoreDiscovery(race, null).score, 0);
  const button = { id: 'D2', truth: 'button' };
  assert.equal(scoreDiscovery(button, { kind: 'defect', hypothesis: 'A media rule sets display: none on the Send button below 430px.', citations: [{ file: 'src/bank/web/app.css', line: 3 }] }).score, 1);
  const control = { id: 'D3', truth: 'none' };
  assert.equal(scoreDiscovery(control, { kind: 'no_defect', hypothesis: 'x' }).score, 1);
  assert.equal(scoreDiscovery(control, null).score, 1);
  assert.equal(scoreDiscovery(control, { ...ok }).score, 0);
  assert.equal(scoreDiscovery(control, { ...ok }).inventedDefect, true);
});

test('loadDiscoveryCases checks the case file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'disc-cases-'));
  try {
    const file = join(dir, 'cases.json');
    writeFileSync(file, JSON.stringify([{ id: 'D1', symptom: 'x', truth: 'race' }, { id: 'D3', symptom: 'y', truth: 'none' }]));
    assert.equal(loadDiscoveryCases(file).length, 2);
    writeFileSync(file, JSON.stringify([{ id: 'D1', symptom: 'x', truth: 'other' }]));
    assert.throws(() => loadDiscoveryCases(file), /truth/);
    assert.deepEqual(loadDiscoveryCases(undefined), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runDiscovery runs the tool loop with the real rules and stops at a recorded finding', async () => {
  const r = repo();
  try {
    const plan = [
      [{ name: 'start-investigation', arguments: { symptom: 'IGNORED' } }],
      [{ name: 'read-repo-file', arguments: { investigationId: '$ID', path: 'seeds/k1_race.patch' } }],
      [{ name: 'read-repo-file', arguments: { investigationId: '$ID', path: 'src/bank/ledger.py' } }],
      [{ name: 'record-finding', arguments: { investigationId: '$ID', finding: JSON.stringify({ kind: 'defect', hypothesis: 'withdraw checks the balance, then sleeps, so two withdrawals at the same time both pass.', citations: [{ file: 'src/bank/ledger.py', line: 2 }], reproducer: { testName: 'test_two_withdrawals_at_once', file: 'tests/test_ledger.py', asserts: 'one of two withdrawals succeeds' }, severity: { level: 'high', reason: 'overdraft' }, priority: { level: 'P1', reason: 'money' } }) } }],
      [],
    ];
    let id = null;
    let step = 0;
    const seen = [];
    const ask = async (messages, _format, tools) => {
      seen.push(messages.at(-1));
      const last = messages.at(-1);
      if (last.role === 'tool' && !id) id = JSON.parse(last.content).investigationId;
      const calls = (plan[step++] ?? []).map((c) => ({ name: c.name, arguments: JSON.parse(JSON.stringify(c.arguments).replaceAll('$ID', id)) }));
      assert.ok(tools.some((t) => t.function.name === 'record-finding'));
      return { ok: true, content: calls.length ? '' : 'done', toolCalls: calls };
    };
    const out = await runDiscovery(ask, { id: 'D1', symptom: 'My balance went below zero after two withdrawals.', truth: 'race' }, { tree: r.dir });
    assert.equal(out.score, 1, JSON.stringify(out));
    assert.equal(out.finding.kind, 'defect');
    assert.equal(out.toolCalls, 4);
    assert.equal(out.refusedCalls, 1);
    assert.equal(out.githubCalls, 2);
    // The symptom the model gets is the case's, not the model's argument.
    assert.equal(seen[0].content, 'My balance went below zero after two withdrawals.');
  } finally {
    r.cleanup();
  }
});
