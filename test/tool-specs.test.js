// The manifest's actions must agree with the one tool specification (DESIGN 9l).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ollamaTools, TOOL_SPECS } from '../src/tool-specs.js';

function manifestActions() {
  const text = readFileSync('manifest.yml', 'utf8');
  const block = text.split('\n  action:\n')[1].split(/\n  [a-z]/)[0];
  return `\n${block}`.split('\n    - key: ').slice(1).map((chunk) => {
    const key = chunk.split('\n')[0].trim();
    const verb = chunk.match(/actionVerb: (\w+)/)[1];
    const inputs = {};
    const inputsText = chunk.split('      inputs:\n')[1] ?? '';
    for (const m of inputsText.matchAll(/^ {8}(\w+):\n((?: {10}.*\n?)+)/gm)) {
      inputs[m[1]] = /required: true/.test(m[2]);
    }
    return { key, verb, inputs };
  });
}

test('every manifest action has a spec, and kinds, inputs and required flags agree', () => {
  const actions = manifestActions();
  assert.deepEqual(actions.map((a) => a.key).sort(), Object.keys(TOOL_SPECS).sort());
  for (const a of actions) {
    const spec = TOOL_SPECS[a.key];
    assert.equal(spec.kind, a.verb === 'GET' ? 'read' : 'write', a.key);
    assert.deepEqual(Object.keys(a.inputs).sort(), Object.keys(spec.args).sort(), a.key);
    for (const [name, required] of Object.entries(a.inputs)) assert.equal(spec.args[name].required, required, `${a.key}.${name}`);
  }
});

test('every spec has a purpose, use, avoid, and one good and one bad call', () => {
  for (const [key, s] of Object.entries(TOOL_SPECS)) {
    for (const f of ['purpose', 'use', 'avoid']) assert.ok(s[f]?.length > 10, `${key}.${f}`);
    assert.ok(s.good?.args && s.good.why && s.bad?.args && s.bad.why, key);
  }
});

test('the local tool list is built from the specs', () => {
  const [t] = ollamaTools(['get-verdicts']);
  assert.equal(t.function.name, 'get-verdicts');
  assert.deepEqual(t.function.parameters.required, ['issueKey']);
  assert.match(t.function.description, /^Returns the verifier's verdicts/);
});
