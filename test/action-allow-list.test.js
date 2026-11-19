// Allow-list of what a model or a page can reach. In Forge only the functions that the manifest
// declares can run; an agent can call only the actions in its own list; the panel resolver
// answers only the keys it defines. These tests fix those lists, so a new entry needs a test change
// (a review point).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { TOOL_SPECS } from '../src/tool-specs.js';

const MANIFEST = readFileSync('manifest.yml', 'utf8');

// The items of a block "<indent>key: <name>" ... "<indent+2>actions:" (or tools:) list.
function listOf(moduleKey, field) {
  const start = MANIFEST.indexOf(`- key: ${moduleKey}\n`);
  assert.ok(start >= 0, moduleKey);
  const rest = MANIFEST.slice(start).split('\n');
  const at = rest.findIndex((l, i) => i > 0 && l.trim() === `${field}:`);
  const next = rest.findIndex((l, i) => i > 0 && /^\s*- key: /.test(l));
  assert.ok(at > 0 && (next < 0 || at < next), `${moduleKey} has no ${field}`);
  const items = [];
  for (const l of rest.slice(at + 1)) {
    const m = l.match(/^\s+- ([\w-]+)$/);
    if (!m) break;
    items.push(m[1]);
  }
  return items;
}

function functionHandlers() {
  const block = MANIFEST.split('\n  function:\n')[1].split(/\n {2}[a-z]/)[0];
  return [...block.matchAll(/- key: (\w+)\n\s+handler: ([\w.]+)/g)].map((m) => ({ key: m[1], handler: m[2] }));
}

test('each agent can call only its fixed list of actions', () => {
  assert.deepEqual(listOf('pm-agent', 'actions'), ['lint-requirement', 'create-ticket', 'read-github-commit']);
  assert.deepEqual(listOf('lead-agent', 'actions'), ['read-github-commit', 'open-case', 'record-opinion', 'get-verdicts']);
  assert.deepEqual(listOf('reviewer-agent', 'actions'), ['get-pr-diff', 'record-review', 'get-verdicts']);
});

test('the reviewer agent cannot reach a ticket, case or opinion write', () => {
  const writes = listOf('reviewer-agent', 'actions').filter((a) => TOOL_SPECS[a].kind === 'write');
  assert.deepEqual(writes, ['record-review']);
});

test('the MCP server exposes read actions only', () => {
  const tools = listOf('agile-team-mcp', 'tools');
  assert.deepEqual(tools, ['lint-requirement', 'get-verdicts', 'read-github-commit']);
  for (const t of tools) assert.equal(TOOL_SPECS[t].kind, 'read', t);
});

test('the manifest declares a fixed set of functions, and each handler is an exported function', async () => {
  const fns = functionHandlers();
  assert.deepEqual(fns.map((f) => f.handler).sort(), [
    'consumer.handler', 'index.createTicket', 'index.getPrDiff', 'index.getVerdicts', 'index.lintRequirementAction',
    'index.onComment', 'index.openCase', 'index.readGithubCommit', 'index.recordOpinion', 'index.recordReview',
    'resolvers.handler',
  ]);
  for (const { handler } of fns) {
    const [file, name] = handler.split('.');
    if (file === 'resolvers') {
      // The resolver module needs the Forge bundler to load (default import of @forge/resolver).
      assert.match(readFileSync('src/resolvers.js', 'utf8'), /^export const handler = resolver\.getDefinitions\(\);$/m);
      continue;
    }
    const mod = await import(`../src/${file}.js`);
    assert.equal(typeof mod[name], 'function', handler);
  }
});

test('an exported helper that is not a declared handler cannot be invoked by Forge', async () => {
  const declared = new Set(functionHandlers().filter((f) => f.handler.startsWith('index.')).map((f) => f.handler.slice(6)));
  const index = await import('../src/index.js');
  const helpers = Object.keys(index).filter((k) => typeof index[k] === 'function' && !declared.has(k));
  // These run only when a declared handler calls them; the list is fixed so that a new export is
  // a decision, not an accident.
  assert.ok(helpers.includes('ticketGrounding'), helpers.join(', '));
  for (const h of helpers) assert.ok(!MANIFEST.includes(`handler: index.${h}\n`), h);
});

test('the panel resolver defines a fixed set of keys, and the resolver refuses any other key', async () => {
  const src = readFileSync('src/resolvers.js', 'utf8');
  const keys = [...src.matchAll(/resolver\.define\('(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['approveTest', 'recordAcs', 'getPanel', 'approve', 'signOff', 'adoptCheck', 'getMonitor']);
  // Same library and same keys as src/resolvers.js (that module needs the Forge bundler to load).
  const lib = await import('@forge/resolver');
  const Resolver = lib.default.default ?? lib.default;
  const resolver = new Resolver();
  for (const k of keys) resolver.define(k, async () => ({ ok: true, key: k }));
  const handler = resolver.getDefinitions();
  assert.deepEqual(await handler({ call: { functionKey: 'getPanel', payload: {} }, context: {} }, {}), { ok: true, key: 'getPanel' });
  await assert.rejects(handler({ call: { functionKey: 'deleteAudit', payload: {} }, context: {} }, {}), /no definition for 'deleteAudit'/);
});
