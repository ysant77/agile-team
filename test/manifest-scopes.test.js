// forge lint refuses a deploy when code calls a Jira endpoint whose scope the manifest does not
// declare. currentAccountId() (src/action-guard.js) calls GET /rest/api/3/myself, which needs
// read:jira-user. This test keeps the manifest and that call in step without the Forge CLI.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function declaredScopes() {
  const text = readFileSync('manifest.yml', 'utf8');
  const block = /\n {2}scopes:\n((?: {4}- [^\n]+\n)+)/.exec(text);
  assert.ok(block, 'manifest.yml has a permissions.scopes list');
  return block[1].split('\n').map((l) => l.replace(/^ {4}- /, '').trim()).filter(Boolean);
}

test('the manifest declares read:jira-user, needed by GET /rest/api/3/myself', () => {
  const guard = readFileSync('src/action-guard.js', 'utf8');
  assert.ok(guard.includes('/rest/api/3/myself'), 'src/action-guard.js still calls /myself');
  assert.ok(declaredScopes().includes('read:jira-user'));
});

test('the manifest keeps the scopes it had before, and adds no write scope beyond write:jira-work', () => {
  const scopes = declaredScopes();
  for (const s of ['read:jira-work', 'write:jira-work', 'read:project:jira', 'storage:app']) {
    assert.ok(scopes.includes(s), `${s} is declared`);
  }
  assert.deepEqual(scopes.filter((s) => s.startsWith('write:')), ['write:jira-work']);
});
