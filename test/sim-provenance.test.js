// The scorer's simulated GitHub for report provenance (SCORER-CHANGES 20). It must give what the
// bank CI gives since bank PR 22, so the app's check reads the same facts as on a live run.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mainArtifacts, prArtifacts, pushRun, simReportHash, withRunFacts } from '../benchmark/run/sim-provenance.mjs';
import { parseMarker, reportHash } from '../src/verifier/report.js';

const VECTOR_TEXT = '{"schema": "aat-ci-report/2", "head_sha": "abc"}\n\n \t\r\n';
const VECTOR_HASH = '26557a85526d7658e174b7d4f8d8135894e0872a1633131809bf03d75d4b399d';

test('the simulator hash is the shared rule, and equals the app hash', () => {
  assert.equal(simReportHash(VECTOR_TEXT), VECTOR_HASH);
  for (const t of ['{}', '{"a": 1}\n', 'x \t', '']) assert.equal(simReportHash(t), reportHash(t), JSON.stringify(t));
});

test('a PR run gets event, head branch and head repository; a fork case names the fork', () => {
  const run = { id: 9001, path: '.github/workflows/ci.yml', head_sha: 'a'.repeat(40), run_attempt: 2 };
  assert.deepEqual(withRunFacts(run, { headBranch: 'case-b01', repo: 'ysant77/yms-bank-demo' }),
    { ...run, event: 'pull_request', head_branch: 'case-b01', head_repository: { full_name: 'ysant77/yms-bank-demo' } });
  assert.equal(withRunFacts(run, { headBranch: 'x', repo: 'ysant77/yms-bank-demo', fork: true }).head_repository.full_name, 'someone/yms-bank-demo');
});

test('the PR run artifacts hold one marker of the report as CI wrote it, at the run attempt', () => {
  const written = '{"tests":[{"id":"t","outcome":"failed"}]}';
  const names = prArtifacts({ attempt: 2, ciText: written, marker: true }).artifacts.map((a) => a.name);
  assert.ok(names.includes('ci-report'));
  const markers = names.map(parseMarker).filter(Boolean);
  assert.deepEqual(markers, [{ kind: 'ci', hash: reportHash(written), attempt: 2 }]);
  // No marker: a run from another workflow, a fork, no bot report, or a cancelled run.
  assert.deepEqual(prArtifacts({ attempt: 1, ciText: written, marker: false }).artifacts.map((a) => parseMarker(a.name)).filter(Boolean), []);
});

test('the push run on main for main.json, and its marker of the bytes served', () => {
  const sha = 'e'.repeat(40);
  const run = pushRun({ id: 7001, sha, repo: 'ysant77/yms-bank-demo' });
  assert.deepEqual({ event: run.event, head_branch: run.head_branch, head_sha: run.head_sha, path: run.path, run_attempt: run.run_attempt },
    { event: 'push', head_branch: 'main', head_sha: sha, path: '.github/workflows/ci.yml', run_attempt: 1 });
  assert.equal(run.head_repository.full_name, 'ysant77/yms-bank-demo');
  const served = '{"head_sha":"' + sha + '"}';
  const markers = mainArtifacts(served).artifacts.map((a) => parseMarker(a.name)).filter(Boolean);
  assert.deepEqual(markers, [{ kind: 'main', hash: reportHash(served), attempt: 1 }]);
});
