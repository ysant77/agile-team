// Benchmark arm D runner: a model tool call reaches a tool only when its name is on the runner's
// list and its arguments match src/tool-specs.js; the model server call has a time limit.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { checkToolCall, fetchWithTimeout } from '../benchmark/run/dispatch.mjs';
import { TOOL_SPECS } from '../src/tool-specs.js';

const ALLOWED = ['get-pr-diff', 'record-review', 'get-verdicts'];
const check = (name, args) => checkToolCall(TOOL_SPECS, ALLOWED, name, args);

test('a call with the spec arguments is accepted', () => {
  assert.deepEqual(check('get-pr-diff', { issueKey: 'BANK-4', prNumber: 61 }), { ok: true });
  assert.deepEqual(check('record-review', { issueKey: 'BANK-4', prNumber: 61, review: '{}' }), { ok: true });
  assert.deepEqual(check('get-verdicts', { issueKey: 'BANK-4' }), { ok: true });
});

test('an unknown tool, or a spec tool that is not on the runner list, is refused', () => {
  assert.match(check('run-shell', { cmd: 'ls' }).error, /unknown tool run-shell/);
  assert.match(check('create-ticket', { request: 'x' }).error, /not allowed in this run: create-ticket/);
  assert.match(check(undefined, {}).error, /unknown tool/);
});

test('a wrong argument type is refused', () => {
  assert.match(check('get-pr-diff', { issueKey: 'BANK-4', prNumber: '61' }).error, /prNumber must be a number/);
  assert.match(check('get-pr-diff', { issueKey: 4, prNumber: 61 }).error, /issueKey must be a string/);
  assert.match(check('get-pr-diff', { issueKey: 'BANK-4', prNumber: Number.NaN }).error, /prNumber must be a number/);
  assert.match(check('record-review', { issueKey: 'BANK-4', prNumber: 61, review: { findings: [] } }).error, /review must be a string/);
});

test('an extra argument, a missing required argument or a non-object is refused', () => {
  assert.match(check('get-pr-diff', { issueKey: 'BANK-4', prNumber: 61, path: '/etc/passwd' }).error, /unknown argument path/);
  assert.match(check('get-pr-diff', { issueKey: 'BANK-4' }).error, /prNumber is required/);
  assert.match(check('get-pr-diff', '{"issueKey":"BANK-4"}').error, /arguments must be an object/);
  assert.match(check('get-pr-diff', null).error, /arguments must be an object/);
  assert.match(check('get-pr-diff', ['BANK-4', 61]).error, /arguments must be an object/);
});

test('a model server call that does not answer in time fails with a clear error', async () => {
  const server = createServer(() => {}); // never answers
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/chat`;
    await assert.rejects(fetchWithTimeout(url, { method: 'POST', body: '{}' }, 100), /timed out after 100 ms/);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
