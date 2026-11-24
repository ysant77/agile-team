// The first judge claims of 24 Nov logged "retries" 1 or 2 on four of six claims, but the log did
// not say which GitHub call was retried or why, and the calls could not be made to fail locally.
// The client now keeps, for each retry, the kind (network, server, secondary_limit), the HTTP
// status and the path without its query, at most 5 entries. It never keeps a header or a body.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { githubClient } from '../src/github-evidence.js';

const reply = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (h) => headers[String(h).toLowerCase()] ?? null },
  json: async () => body,
});

test('each retry is kept with its kind, status and path without the query', async () => {
  const answers = [() => { throw new Error('socket hang up'); }, () => reply(502), () => reply(200, { ok: 1 })];
  const { get, meta } = githubClient({ token: 't', fetchFn: async () => answers.shift()(), sleep: async () => {} });
  assert.deepEqual(await get('/repos/o/r/pulls?state=all&per_page=100&page=1'), { ok: 1 });
  assert.equal(meta.retries, 2);
  assert.deepEqual(meta.retried, [
    { kind: 'network', status: 0, path: '/repos/o/r/pulls' },
    { kind: 'server', status: 502, path: '/repos/o/r/pulls' },
  ]);
});

test('a secondary limit retry is kept too; a call with no retry keeps nothing', async () => {
  const answers = [() => reply(403, { message: 'You have exceeded a secondary rate limit' }, { 'retry-after': '1' }), () => reply(200, [])];
  const { get, meta } = githubClient({ token: 't', fetchFn: async () => answers.shift()(), sleep: async () => {} });
  await get('/repos/o/r/issues/7/comments?per_page=100&page=1');
  assert.deepEqual(meta.retried, [{ kind: 'secondary_limit', status: 403, path: '/repos/o/r/issues/7/comments' }]);
  const quiet = githubClient({ token: 't', fetchFn: async () => reply(200, {}), sleep: async () => {} });
  await quiet.get('/repos/o/r');
  assert.deepEqual(quiet.meta.retried, []);
});

test('at most 5 retries are kept, and the count still counts all', async () => {
  let n = 0;
  const { get, meta } = githubClient({ token: 't', fetchFn: async () => (++n % 3 === 0 ? reply(200, {}) : reply(503)), sleep: async () => {} });
  for (let i = 0; i < 4; i += 1) await get(`/repos/o/r/pulls/${i}`);
  assert.equal(meta.retries, 8);
  assert.equal(meta.retried.length, 5);
});
