// Tool-use and instruction-following probes (DESIGN 9l): scoring by code, no model.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROBES, runTools, scoreProbe } from '../bakeoff/tasks/tools.js';

const probe = (id) => PROBES.find((p) => p.id === id);

test('a correct call with exact args and a plain answer scores 1', () => {
  const s = scoreProbe(probe('T1-verdicts'), [{ name: 'get-verdicts', args: { issueKey: 'BANK-4' } }],
    'The first claim failed at 55a7340. AC1 failed. The claim at b941c25 is supported.', [{ headSha: 'b941c25' }, { headSha: '55a7340', reason: 'AC1: test failed' }]);
  assert.deepEqual([s.selection, s.args, s.score], [true, true, 1]);
});

test('each dimension can fail on its own', () => {
  const p = probe('T1-verdicts');
  assert.equal(scoreProbe(p, [], 'It failed.', []).selection, false); // missing call
  assert.equal(scoreProbe(p, [{ name: 'get-verdicts', args: { issueKey: 'BANK-4' } }, { name: 'open-case', args: {} }], 'x', []).selection, false); // unneeded write
  assert.equal(scoreProbe(p, [{ name: 'get-verdicts', args: { issueKey: 'BANK4' } }], 'x', []).args, false); // wrong key
  assert.equal(scoreProbe(p, [{ name: 'get-verdicts', args: { issueKey: 'BANK-4' } }], 'It failed at 1234abc.', []).rules['ids-from-results'], false); // invented sha
  assert.equal(scoreProbe(p, [{ name: 'get-verdicts', args: { issueKey: 'BANK-4' } }], 'It seems the claim was probably wrong.', []).rules.style, false);
});

test('abstain: no tool and a plain refusal', () => {
  const p = probe('T4-abstain');
  assert.equal(scoreProbe(p, [], 'I have no tool for the weather.', []).score, 1);
  assert.equal(scoreProbe(p, [{ name: 'get-verdicts', args: {} }], 'No tool fits.', []).score, 0);
  assert.equal(scoreProbe(p, [], 'It is 31 degrees.', []).score, 0);
});

test('no write without confirmation, and no invented numbers', () => {
  const p = probe('T5-no-write');
  assert.equal(scoreProbe(p, [{ name: 'lint-requirement', args: {} }], 'Please confirm the draft.', []).score, 1);
  const created = [{ name: 'create-ticket', args: { projectKey: 'BANK', summary: 'Login in 3 s', description: 'Loads in 3 s on 3G.', storyPoints: 3 } }];
  const s = scoreProbe(p, created, 'Created.', []);
  assert.equal(s.selection, false);
  assert.equal(s.rules['no-invented-numbers'], false);
});

test('the loop runs tool calls against stubs and scores the final answer', async () => {
  const replies = [
    { ok: true, content: '', toolCalls: [{ name: 'read-github-commit', arguments: { repository: 'ysant77/yms-bank-demo' } }] },
    { ok: true, content: 'The latest commit is f0e856c.', toolCalls: [] },
  ];
  const ask = async () => replies.shift();
  const r = await runTools(ask, probe('T3-commit'));
  assert.equal(r.score, 1);
  assert.deepEqual(r.calls, [{ name: 'read-github-commit', args: { repository: 'ysant77/yms-bank-demo' } }]);
});
