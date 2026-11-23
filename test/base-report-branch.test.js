// Fresh-site path, option 1c (docs/DESIGN-FRESH-SITE.md, way A): the base report is read for the
// PR's base branch. `main` keeps ci-reports/main.json; another base branch reads
// ci-reports/reports/<branch with "/" as "-">.json. A branch name the app cannot map gives no base
// report (the checks that need it say unknown).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseReportPath, collectGithub } from '../src/github-evidence.js';

test('the base report path follows the base branch; main is unchanged', () => {
  assert.equal(baseReportPath('main'), 'main.json');
  assert.equal(baseReportPath(null), 'main.json');
  assert.equal(baseReportPath('judge/U01'), 'reports/judge-U01.json');
  assert.equal(baseReportPath('release-2'), 'reports/release-2.json');
  for (const bad of ['../x', 'a b', 'x%2F', '', '.hidden']) assert.equal(baseReportPath(bad), null, bad);
});

const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, headers: { get: () => '4999' } });
function fetchFor(baseRef, log) {
  const pull = { number: 3, title: 'KAN-1 fix', state: 'closed', merged_at: '2026-11-23T07:00:00Z', merge_commit_sha: 'b'.repeat(40),
    head: { ref: 'KAN-1-fix', sha: 'a'.repeat(40), repo: { full_name: 'o/r' } }, base: { ref: baseRef }, html_url: 'x', user: { login: 'u', id: 1 } };
  return async (url) => {
    log.push(url);
    if (/\/pulls\?/.test(url)) return resp(200, [pull]);
    if (/\/pulls\/3\/files/.test(url)) return resp(200, []);
    if (/actions\/runs\?head_sha/.test(url)) return resp(200, { workflow_runs: [] });
    if (/comments/.test(url)) return resp(200, []);
    if (/\/contents\//.test(url)) return resp(200, { content: Buffer.from(JSON.stringify({ head_sha: 'b'.repeat(40), tests: [] })).toString('base64') });
    return resp(404, {});
  };
}

test('a PR on main reads main.json, as before', async () => {
  const log = [];
  await collectGithub({ repo: 'o/r', key: 'KAN-1', fetchFn: fetchFor('main', log), sleep: async () => {} });
  assert.ok(log.some((u) => u.endsWith('/contents/main.json?ref=ci-reports')), log.join('\n'));
});

test('a PR on a judge branch reads the report file of that branch', async () => {
  const log = [];
  const gh = await collectGithub({ repo: 'o/r', key: 'KAN-1', fetchFn: fetchFor('judge/U01', log), sleep: async () => {} });
  assert.ok(log.some((u) => u.endsWith('/contents/reports/judge-U01.json?ref=ci-reports')), log.join('\n'));
  assert.ok(!log.some((u) => u.includes('/contents/main.json')));
  assert.equal(gh.baseReport.head_sha, 'b'.repeat(40));
});

test('a base branch name the app cannot map reads no base report', async () => {
  const log = [];
  const gh = await collectGithub({ repo: 'o/r', key: 'KAN-1', fetchFn: fetchFor('a b', log), sleep: async () => {} });
  assert.ok(!log.some((u) => u.includes('/contents/')));
  assert.equal(gh.baseReport, null);
});
