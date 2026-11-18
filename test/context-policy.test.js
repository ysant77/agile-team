// Read-only code context for a model, decided by code (feature branch; not wired into the
// reviewer). The model asks for a call; the policy allows or refuses it and logs every decision.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { CONTEXT_TOOLS, decideContextCall } from '../src/context-policy.js';

const base = mkdtempSync(join(tmpdir(), 'ctx-policy-'));
after(() => rmSync(base, { recursive: true, force: true }));
const root = join(base, 'bank');
const outside = join(base, 'outside');
for (const d of [root, outside, join(root, 'src/bank'), join(root, '.git'), join(root, 'keys')]) mkdirSync(d, { recursive: true });
writeFileSync(join(root, 'src/bank/money.py'), 'def parse_amount(text):\n    return text\n');
writeFileSync(join(root, 'src/bank/big.json'), 'x'.repeat(300_000));
writeFileSync(join(root, '.env'), 'PLACEHOLDER=1\n');
writeFileSync(join(root, '.env.local'), 'PLACEHOLDER=1\n');
writeFileSync(join(root, 'keys/deploy.pem'), 'placeholder, not a key\n');
writeFileSync(join(root, 'keys/id_rsa'), 'placeholder, not a key\n');
writeFileSync(join(root, 'keys/server.key'), 'k\n');
writeFileSync(join(root, 'credentials.json'), '{}\n');
writeFileSync(join(root, '.git/config'), '[core]\n');
writeFileSync(join(outside, 'notes.txt'), 'outside\n');
symlinkSync(outside, join(root, 'src/linked'), 'dir');
symlinkSync(join(root, '.env'), join(root, 'src/settings.txt'));

const decide = (tool, args, extra = {}) => {
  const log = [];
  const d = decideContextCall({ tool, args }, { root, log, ...extra });
  return { d, log };
};

test('the allow-list is fixed: read_file, list_dir and search_symbol, all read-only', () => {
  assert.deepEqual(Object.keys(CONTEXT_TOOLS).sort(), ['list_dir', 'read_file', 'search_symbol']);
});

test('an allowed read inside the repository is allowed and logged with its reason', () => {
  const { d, log } = decide('read_file', { path: 'src/bank/money.py' });
  assert.equal(d.allow, true, d.reason);
  assert.equal(d.path, 'src/bank/money.py');
  assert.equal(log.length, 1);
  assert.equal(log[0].allow, true);
  assert.equal(log[0].tool, 'read_file');
  assert.ok(log[0].reason);
  assert.ok(decide('list_dir', { path: 'src/bank' }).d.allow);
  assert.ok(decide('search_symbol', { name: 'parse_amount' }).d.allow);
});

test('a ../ escape is refused', () => {
  const { d, log } = decide('read_file', { path: '../outside/notes.txt' });
  assert.equal(d.allow, false);
  assert.match(d.reason, /outside the repository/);
  assert.equal(log[0].allow, false);
});

test('an absolute path outside the repository is refused', () => {
  assert.match(decide('read_file', { path: join(outside, 'notes.txt') }).d.reason, /outside the repository/);
  assert.match(decide('read_file', { path: '/etc/passwd' }).d.reason, /outside the repository/);
});

test('a symlink that leads out of the repository is refused', () => {
  const { d } = decide('read_file', { path: 'src/linked/notes.txt' });
  assert.equal(d.allow, false);
  assert.match(d.reason, /outside the repository/);
  assert.equal(decide('list_dir', { path: 'src/linked' }).d.allow, false);
});

test('secret files inside the repository are refused, also through a symlink with a plain name', () => {
  for (const p of ['.env', '.env.local', 'keys/deploy.pem', 'keys/id_rsa', 'keys/server.key', 'credentials.json', '.git/config', '.git']) {
    const tool = p === '.git' ? 'list_dir' : 'read_file';
    const { d } = decide(tool, { path: p });
    assert.equal(d.allow, false, p);
    assert.match(d.reason, /secret|\.git/, p);
  }
  const { d } = decide('read_file', { path: 'src/settings.txt' });
  assert.equal(d.allow, false);
  assert.match(d.reason, /secret/);
});

test('a file over the size limit is refused', () => {
  const { d } = decide('read_file', { path: 'src/bank/big.json' }, { maxBytes: 200_000 });
  assert.equal(d.allow, false);
  assert.match(d.reason, /size limit/);
});

test('an unknown tool is refused and kept as a proposal for a person; nothing is installed', () => {
  const { d, log } = decide('code_graph_search', { query: 'callers of parse_amount', server: 'https://example.invalid/mcp' });
  assert.equal(d.allow, false);
  assert.match(d.reason, /not on the allow-list/);
  assert.deepEqual(d.proposal, { tool: 'code_graph_search', argKeys: ['query', 'server'], status: 'for a person to review' });
  assert.equal(log[0].proposal.tool, 'code_graph_search');
});

test('a write, shell or network tool is refused', () => {
  for (const tool of ['write_file', 'delete_file', 'run_shell', 'exec', 'http_get', 'fetch_url', 'git_push']) {
    const { d } = decide(tool, { path: 'src/bank/money.py' });
    assert.equal(d.allow, false, tool);
    assert.match(d.reason, /write, shell or network/, tool);
  }
});

test('bad arguments are refused: extra key, wrong type, empty path, NUL, option-like symbol', () => {
  assert.match(decide('read_file', { path: 'src/bank/money.py', mode: 'w' }).d.reason, /unknown argument mode/);
  assert.match(decide('read_file', { path: 7 }).d.reason, /path must be a string/);
  assert.match(decide('read_file', { path: '' }).d.reason, /path must be a string/);
  assert.match(decide('read_file', { path: 'src/bank/money.py\0.txt' }).d.reason, /path must be a string/);
  assert.match(decide('read_file', null).d.reason, /arguments must be an object/);
  assert.match(decide('search_symbol', { name: '--files-from=/etc/passwd' }).d.reason, /name must be an identifier/);
  assert.match(decide('read_file', { path: 'src/bank/missing.py' }).d.reason, /not found/);
  assert.match(decide('read_file', { path: 'src/bank' }).d.reason, /not a file/);
  assert.match(decide('list_dir', { path: 'src/bank/money.py' }).d.reason, /not a folder/);
});

test('every decision is logged once, refused or allowed', () => {
  const log = [];
  decideContextCall({ tool: 'read_file', args: { path: '.env' } }, { root, log });
  decideContextCall({ tool: 'read_file', args: { path: 'src/bank/money.py' } }, { root, log });
  decideContextCall({ tool: 'run_shell', args: {} }, { root, log });
  assert.deepEqual(log.map((e) => [e.tool, e.allow]), [['read_file', false], ['read_file', true], ['run_shell', false]]);
  for (const e of log) assert.ok(e.at && e.reason);
});
