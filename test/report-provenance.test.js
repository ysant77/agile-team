// CI report provenance (design P0-3, 19 Nov; findings D1 and D3). The bank's report and
// publish-main-report jobs upload the report again as an artifact named
// ci-report-sha256-<hash>-attempt-<n> or main-report-sha256-<hash>-attempt-<n>. Only the run can
// upload to itself. The verifier accepts the PR report (or main.json) only when the run of the
// pinned workflow on that commit, at its current attempt, has exactly one marker, and the marker's
// hash equals the hash of the raw report text it read. Advisory until the repository is listed.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectGithub } from '../src/github-evidence.js';
import { reportProvenance } from '../src/verifier/checks.js';
import { verify } from '../src/verifier/verdict.js';
import { parseMarker, reportHash } from '../src/verifier/report.js';
import { configFor, VERIFY_CONFIG } from '../src/verify-claim.js';

// The shared test vector (also in the bank's tests/test_report_marker.py).
const VECTOR_TEXT = '{"schema": "aat-ci-report/2", "head_sha": "abc"}\n\n \t\r\n';
const VECTOR_HASH = '26557a85526d7658e174b7d4f8d8135894e0872a1633131809bf03d75d4b399d';

test('the report hash follows the shared rule and vector', () => {
  assert.equal(reportHash(VECTOR_TEXT), VECTOR_HASH);
  assert.equal(reportHash('{"schema": "aat-ci-report/2", "head_sha": "abc"}'), VECTOR_HASH);
  assert.notEqual(reportHash(' {"schema": "aat-ci-report/2", "head_sha": "abc"}'), VECTOR_HASH, 'leading white space counts');
});

test('marker names parse to kind, hash and attempt; anything else is not a marker', () => {
  assert.deepEqual(parseMarker(`ci-report-sha256-${VECTOR_HASH}-attempt-2`), { kind: 'ci', hash: VECTOR_HASH, attempt: 2 });
  assert.deepEqual(parseMarker(`main-report-sha256-${VECTOR_HASH}-attempt-1`), { kind: 'main', hash: VECTOR_HASH, attempt: 1 });
  for (const name of ['ci-report', `ci-report-sha256-${VECTOR_HASH}`, `ci-report-sha256-${VECTOR_HASH.toUpperCase()}-attempt-1`,
    `ci-report-sha256-${VECTOR_HASH}-attempt-0`, `x-ci-report-sha256-${VECTOR_HASH}-attempt-1`, `ci-report-sha256-${VECTOR_HASH.slice(1)}-attempt-1`]) {
    assert.equal(parseMarker(name), null, name);
  }
});

const HEAD = 'a'.repeat(40);
const MAIN = 'm'.repeat(40);
const RAW = '{"schema": "aat-ci-report/2", "head_sha": "' + HEAD + '"}';
const BASE_RAW = '{"schema": "aat-ci-report/2", "head_sha": "' + MAIN + '"}';
const prRun = (extra = {}) => ({ id: 11, attempt: 2, path: '.github/workflows/ci.yml', headSha: HEAD, event: 'pull_request', headRepo: 'ysant77/yms-bank-demo', ...extra });
const mainRun = (extra = {}) => ({ id: 21, attempt: 1, path: '.github/workflows/ci.yml', headSha: MAIN, event: 'push', headBranch: 'main', headRepo: 'ysant77/yms-bank-demo', ...extra });
const ciMarker = (raw, attempt = 2) => `ci-report-sha256-${reportHash(raw)}-attempt-${attempt}`;
const mainMarker = (raw, attempt = 1) => `main-report-sha256-${reportHash(raw)}-attempt-${attempt}`;

function ctxOf({ required = true, report = RAW, base = BASE_RAW, runs = [prRun()], baseRuns = [mainRun()], artifacts } = {}) {
  return {
    repo: 'ysant77/yms-bank-demo',
    config: { ...VERIFY_CONFIG, provenanceRequired: required },
    pr: { headSha: HEAD, baseRef: 'main' },
    report: report === null ? null : JSON.parse(report),
    reportRaw: report,
    baseReport: base === null ? null : JSON.parse(base),
    baseReportRaw: base,
    workflowRuns: runs,
    baseRuns,
    artifactsByRun: artifacts ?? { 11: ['ci-report', ciMarker(RAW)], 21: ['ci-report', mainMarker(BASE_RAW)] },
  };
}

test('both reports match the marker of their run at its current attempt: pass', () => {
  const r = reportProvenance(ctxOf());
  assert.equal(r.status, 'pass', r.reason);
  assert.ok(!r.advisory);
  assert.match(r.reason, /run 11 attempt 2/);
  assert.match(r.reason, /run 21 attempt 1/);
});

test('D1: a forged main.json does not match the marker of the push run on main: unknown', () => {
  const forged = '{"schema": "aat-ci-report/2", "head_sha": "' + MAIN + '", "tests": []}';
  const r = reportProvenance(ctxOf({ base: forged }));
  assert.equal(r.status, 'unknown');
  assert.match(r.reason, /main\.json/);
});

test('D3: a comment report that is not the run\'s report: unknown', () => {
  const other = '{"schema": "aat-ci-report/2", "head_sha": "' + HEAD + '", "tests": [{"id": "t", "outcome": "passed"}]}';
  const r = reportProvenance(ctxOf({ report: other }));
  assert.equal(r.status, 'unknown');
  assert.match(r.reason, /report comment/);
});

test('two markers with different hashes for one attempt: unknown, even when one matches', () => {
  const artifacts = { 11: [ciMarker(RAW), ciMarker('{"forged": 1}')], 21: [mainMarker(BASE_RAW)] };
  const r = reportProvenance(ctxOf({ artifacts }));
  assert.equal(r.status, 'unknown');
  assert.match(r.reason, /two report markers/);
});

test('re-run: only the marker of the current attempt counts', () => {
  // Attempt 1 left a marker; attempt 2 (the current one) has none: unknown.
  assert.equal(reportProvenance(ctxOf({ artifacts: { 11: [ciMarker(RAW, 1)], 21: [mainMarker(BASE_RAW)] } })).status, 'unknown');
  // Attempt 1 with another report and attempt 2 with this one: pass.
  assert.equal(reportProvenance(ctxOf({ artifacts: { 11: [ciMarker('{"old": 1}', 1), ciMarker(RAW, 2)], 21: [mainMarker(BASE_RAW)] } })).status, 'pass');
});

test('a run that is not the pinned run on this commit does not count', () => {
  for (const run of [prRun({ event: 'push' }), prRun({ headSha: 'b'.repeat(40) }), prRun({ path: '.github/workflows/other.yml' }), prRun({ headRepo: 'someone/fork' })]) {
    assert.equal(reportProvenance(ctxOf({ runs: [run] })).status, 'unknown', JSON.stringify(run));
  }
  for (const run of [mainRun({ headBranch: 'feature' }), mainRun({ event: 'pull_request' }), mainRun({ headSha: 'c'.repeat(40) })]) {
    assert.equal(reportProvenance(ctxOf({ baseRuns: [run] })).status, 'unknown', JSON.stringify(run));
  }
});

test('an artifact list that was not read, or no raw text: unknown', () => {
  assert.equal(reportProvenance(ctxOf({ artifacts: { 11: null, 21: [mainMarker(BASE_RAW)] } })).status, 'unknown');
  const noRaw = ctxOf();
  noRaw.reportRaw = undefined;
  assert.equal(reportProvenance(noRaw).status, 'unknown');
});

test('several pinned runs on one head: one matching run is enough', () => {
  const runs = [prRun(), prRun({ id: 12, attempt: 1 })];
  const artifacts = { 11: [ciMarker(RAW)], 12: [ciMarker('{"other run": 1}', 1)], 21: [mainMarker(BASE_RAW)] };
  assert.equal(reportProvenance(ctxOf({ runs, artifacts })).status, 'pass');
});

test('not required (the default): advisory, never counted, and the reason says what was found', () => {
  const r = reportProvenance(ctxOf({ required: false, base: '{"schema": "aat-ci-report/2", "head_sha": "' + MAIN + '", "forged": true}' }));
  assert.equal(r.advisory, true);
  assert.match(r.reason, /not counted/);
  assert.match(r.reason, /main\.json/);
});

test('verify: a merged claim on a forged main.json is cannot_verify when provenance is required', () => {
  const forged = '{"schema": "aat-ci-report/2", "head_sha": "' + MAIN + '", "tests": [], "workflow_files": {".github/workflows/ci.yml": "x"}}';
  const ctx = { ...ctxOf({ base: forged }), reportAuthor: 'github-actions[bot]', mergeSha: MAIN, mergeRequiredTests: [], ticket: { key: 'BANK-1' }, baseWorkflowFiles: { '.github/workflows/ci.yml': 'x' } };
  ctx.mergeReport = ctx.baseReport;
  const v = verify({ id: 'm', type: 'merged' }, ctx);
  assert.equal(v.result, 'cannot_verify', v.reason);
  assert.ok(v.checks.some((c) => c.name === 'report_provenance' && c.status === 'unknown'));
});

test('configFor: provenance is required per listed repository; the deployed list is empty', () => {
  assert.deepEqual(VERIFY_CONFIG.provenanceRequiredRepos, []);
  assert.equal(configFor('ysant77/yms-bank-demo').provenanceRequired, false);
  assert.equal(configFor('YSANT77/yms-bank-demo', [], ['ysant77/yms-bank-demo']).provenanceRequired, true);
  assert.equal(configFor('acme/x', [], ['ysant77/yms-bank-demo']).provenanceRequired, false);
});

// The collector reads the artifacts of the pinned PR run and of the push run on main for the
// main.json commit, and keeps the raw report texts.
test('collectGithub reads the run artifacts and the raw report texts', async () => {
  const seen = [];
  const prBody = '<!-- aat-ci-report -->\n```json\n' + RAW + '\n\n```';
  const fetchFn = async (url) => {
    seen.push(url.replace('https://api.github.com', ''));
    const u = new URL(url);
    const page = Number(u.searchParams.get('page') ?? 1);
    const body = /\/pulls\?/.test(url) ? (page === 1 ? [{ number: 5, title: 'BANK-1 fix', state: 'open', head: { ref: 'b', sha: HEAD, repo: { full_name: 'ysant77/yms-bank-demo' } }, base: { ref: 'main' } }] : [])
      : /\/actions\/runs\?head_sha=a/.test(url) ? { workflow_runs: [{ id: 11, run_attempt: 2, path: '.github/workflows/ci.yml', head_sha: HEAD, event: 'pull_request', head_branch: 'b', head_repository: { full_name: 'ysant77/yms-bank-demo' }, status: 'completed', conclusion: 'success' }] }
      : /\/actions\/runs\?head_sha=m/.test(url) ? { workflow_runs: [{ id: 21, run_attempt: 1, path: '.github/workflows/ci.yml', head_sha: MAIN, event: 'push', head_branch: 'main', head_repository: { full_name: 'ysant77/yms-bank-demo' }, status: 'completed', conclusion: 'success' }] }
      : /\/runs\/11\/artifacts/.test(url) ? { artifacts: [{ name: ciMarker(RAW) }] }
      : /\/runs\/21\/artifacts/.test(url) ? { artifacts: [{ name: mainMarker(BASE_RAW) }] }
      : /\/issues\/5\/comments/.test(url) ? (page === 1 ? [{ user: { id: 41898282, type: 'Bot' }, body: prBody, created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-19T00:00:00Z' }] : [])
      : /\/pulls\/5\/files/.test(url) ? [{ filename: 'src/x.py', status: 'modified' }]
      : /contents\/main\.json/.test(url) ? { content: Buffer.from(BASE_RAW + '\n').toString('base64') }
      : null;
    return body === null ? { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } } : { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
  };
  const gh = await collectGithub({ repo: 'ysant77/yms-bank-demo', key: 'BANK-1', fetchFn, provenance: { workflowPaths: ['.github/workflows/ci.yml'] } });
  assert.equal(gh.reportRaw, RAW + '\n');
  assert.equal(gh.baseReportRaw, BASE_RAW + '\n');
  assert.deepEqual(gh.workflowRuns.map((r) => [r.id, r.event, r.headRepo]), [[11, 'pull_request', 'ysant77/yms-bank-demo']]);
  assert.deepEqual(gh.baseRuns.map((r) => [r.id, r.event, r.headBranch]), [[21, 'push', 'main']]);
  assert.deepEqual(gh.artifactsByRun, { 11: [ciMarker(RAW)], 21: [mainMarker(BASE_RAW)] });
  assert.equal(seen.filter((p) => /\/artifacts|runs\?head_sha=m/.test(p)).length, 3, 'three more calls: two artifact lists and the main run list');
  const ctx = { ...gh, repo: 'ysant77/yms-bank-demo', config: { ...VERIFY_CONFIG, provenanceRequired: true } };
  assert.equal(reportProvenance(ctx).status, 'pass', reportProvenance(ctx).reason);
});
