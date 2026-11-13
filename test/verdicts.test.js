// get-verdicts (read-only action and MCP tool) and the two rovo:skill folders.

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getVerdicts, parseVerdictsInput, summarise } from '../src/verdicts-action.js';

const verdict = (n, result) => ({ claimId: `c${n}`, type: 'fixed', result, reason: `r${n}`, checker: 'v1', headSha: `sha${n}`, at: `2026-11-1${n}` });

function fakeStore(values) {
  const reads = [];
  return { reads, get: async (key) => { reads.push(key); return values[key] ?? null; }, set: async () => { throw new Error('read-only action wrote to the store'); } };
}

test('input: the key is checked and the limit is clamped', () => {
  assert.equal(parseVerdictsInput({ issueKey: ' bank-4 ' }).issueKey, 'BANK-4');
  assert.ok(parseVerdictsInput({ issueKey: 'BANK-4; DROP' }).error);
  assert.equal(parseVerdictsInput({ issueKey: 'BANK-4', limit: 99 }).limit, 20);
  assert.equal(parseVerdictsInput({ issueKey: 'BANK-4', limit: 'x' }).limit, 5);
});

test('summary lists the newest verdict first and never returns the case packet or opinion text', () => {
  const kase = {
    prNumbers: [5, 7], arbitration: { decidedBy: 'code', rule: 'smaller diff', winner: 'PR5' }, opinionAllowed: false,
    packet: { evidence: ['secret evidence text'] },
    opinions: [{ outcome: 'opinion', guard: null, at: 't', opinion: { reasons: [{ text: 'private reasoning' }] } }],
  };
  const s = summarise('BANK-4', { verdicts: [verdict(1, 'contradicted'), verdict(2, 'supported')], kase, head: { seq: 9, hash: 'h' } }, 5);
  assert.equal(s.verdicts[0].result, 'supported');
  assert.equal(s.total, 2);
  assert.equal(s.arbitration.finalDecision, 'human');
  assert.equal(s.arbitration.humanDecision, null);
  assert.deepEqual(s.audit, { seq: 9, hash: 'h' });
  const text = JSON.stringify(s);
  assert.ok(!text.includes('secret evidence text'));
  assert.ok(!text.includes('private reasoning'));
});

test('a work item the caller cannot see returns an error and reads nothing else', async () => {
  const store = fakeStore({ 'case:BANK-9': { prNumbers: [1, 2] }, 'audit-head': { seq: 1, hash: 'h' } });
  const r = await getVerdicts({ issueKey: 'BANK-9' }, { readProperty: async () => ({ visible: false }), store });
  assert.equal(r.ok, false);
  assert.deepEqual(store.reads, []);
});

test('a visible work item without verdicts returns an empty list', async () => {
  const store = fakeStore({});
  const r = await getVerdicts({ issueKey: 'BANK-3' }, { readProperty: async () => ({ visible: true, verdicts: [] }), store });
  assert.equal(r.ok, true);
  assert.deepEqual(r.verdicts, []);
  assert.equal(r.arbitration, null);
});

test('every skill folder is declared, named after its folder, and allows exactly its manifest tools', () => {
  const manifest = readFileSync('manifest.yml', 'utf8');
  const block = manifest.split('  rovo:skill:\n')[1].split(/\n  [a-z]/)[0];
  const declared = [...block.matchAll(/- key: ([\w-]+)\n\s+source:\n\s+dir: (\S+)\n\s+dependencies:\n\s+tools:((?:\n\s+- [\w-]+(?=\n|$))+)/g)]
    .map(([, key, dir, tools]) => ({ key, dir, tools: tools.trim().split('\n').map((t) => t.replace(/^\s*- /, '')) }));
  const folders = readdirSync('skills');
  assert.deepEqual(declared.map((d) => d.dir).sort(), folders.map((f) => `skills/${f}`).sort());
  for (const d of declared) {
    const text = readFileSync(`${d.dir}/SKILL.md`, 'utf8');
    const front = text.split('---')[1];
    const field = (name) => front.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1]?.trim();
    assert.equal(field('name'), d.dir.split('/')[1]);
    assert.match(field('name'), /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(field('description').length >= 50 && field('description').length <= 1024);
    assert.deepEqual(field('allowed-tools').split(' ').sort(), [...d.tools].sort());
    for (const tool of d.tools) assert.ok(manifest.includes(`- key: ${tool}\n`), `${tool} is not an action`);
    assert.ok(text.split('---').slice(2).join('---').split('\n').length <= 500);
    assert.ok(existsSync(`${d.dir}/SKILL.md`));
  }
});

test('the MCP server exposes only read actions (actionVerb GET)', () => {
  const manifest = readFileSync('manifest.yml', 'utf8');
  const block = manifest.split('  rovo:mcp:\n')[1].split(/\n  [a-z]/)[0];
  const tools = [...block.split('tools:')[1].matchAll(/^\s+- ([\w-]+)$/gm)].map((m) => m[1]);
  assert.ok(tools.length > 0);
  for (const tool of tools) {
    const action = manifest.split(`    - key: ${tool}\n`)[1];
    assert.ok(action, `${tool} is not an action`);
    assert.match(action.split('\n    - key:')[0], /actionVerb: GET\n/, `${tool} is not a read action`);
  }
});
