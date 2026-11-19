// Dependency and pytest configuration files decide which plugins and options the test run
// loads. A PR that changes one can change the outcomes its own CI reports, so its report is not
// evidence (execution plan 19 Nov, finding D2). Same rule as a changed workflow or conftest.py.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_TRUST_PATHS, reportTrusted } from '../src/verifier/checks.js';
import { VERIFY_CONFIG } from '../src/verify-claim.js';

const H = 'a'.repeat(40);
const wf = { '.github/workflows/ci.yml': 'x' };
const ctxWith = (prFiles, config = VERIFY_CONFIG) => ({
  config,
  reportAuthor: 'github-actions[bot]',
  report: { head_sha: H, workflow_files: wf },
  pr: { headSha: H },
  baseWorkflowFiles: wf,
  truncated: { comments: false },
  prFiles,
  workflowRuns: [{ path: '.github/workflows/ci.yml', headSha: H, runStartedAt: '2026-11-19T00:00:00Z', createdAt: '2026-11-19T00:00:00Z', updatedAt: '2026-11-19T00:05:00Z' }],
  reportComment: { updatedAt: '2026-11-19T00:04:00Z' },
});

const CONFIG_FILES = ['pyproject.toml', 'uv.lock', 'pytest.ini', 'setup.cfg', 'tox.ini', 'requirements.txt', 'requirements-dev.txt', 'services/api/pyproject.toml'];

test('the report of a PR that changes only product code stays trusted', () => {
  const r = reportTrusted(ctxWith(['src/bank/ledger.py', 'tests/test_api.py']));
  assert.equal(r.status, 'pass', r.reason);
});

for (const file of CONFIG_FILES) {
  test(`a PR that changes ${file} is not trusted for its own report (deployed config and default)`, () => {
    for (const config of [VERIFY_CONFIG, {}]) {
      const r = reportTrusted(ctxWith(['src/bank/ledger.py', file], config));
      assert.equal(r.status, 'unknown', `${file}: ${r.reason}`);
      assert.match(r.reason, new RegExp(file.replace(/[.*]/g, '\\$&')));
    }
  });
}

test('a file that only looks like a config file is not matched', () => {
  for (const file of ['docs/pyproject.toml.md', 'src/bank/setup_cfg.py', 'tests/test_requirements.py']) {
    assert.equal(reportTrusted(ctxWith(['src/bank/ledger.py', file])).status, 'pass', file);
  }
});

test('the default trust paths hold the dependency and pytest config entries', () => {
  for (const entry of ['**/pyproject.toml', '**/uv.lock', '**/pytest.ini', '**/setup.cfg', '**/tox.ini', '**/requirements*.txt']) {
    assert.ok(DEFAULT_TRUST_PATHS.includes(entry), entry);
    assert.ok(VERIFY_CONFIG.reportTrustPaths.includes(entry), entry);
  }
});
