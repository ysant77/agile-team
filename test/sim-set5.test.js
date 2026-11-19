// Scorer change 21 (set 5): the simulated Jira and GitHub facts that the app reads and the scorer
// did not give before. One unit test per part.
// (a) the audited approvals store and the audit reader; (b) the claimant on the claim;
// (c) a report comment edited after the run (V15); (d) a failed push run on the merge commit
// whose marker is the genuine main report, while the served main.json is another file (V21).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simJira } from '../benchmark/run/sim-jira.mjs';
import { editedComment, genuineMainReport, mainArtifacts, pushRun } from '../benchmark/run/sim-provenance.mjs';
import { acHash } from '../src/approvals.js';
import { acsRecorded } from '../src/verifier/checks.js';
import { parseMarker, reportHash } from '../src/verifier/report.js';

const KEY = 'BENCH-517';
const ACS = [{ acId: 'AC1', text: 'a retry within 48 hours replays', check: { type: 'test_passes', args: ['test_a_key_is_still_known_after_47_hours'] } }];

test('(a) the approvals store and the audit reader give entries whose audit events match', async () => {
  const j = simJira({
    claimant: 'acct-claimant',
    changes: [{ test: 'tests/test_idempotency.py::test_keys_expire_after_24_hours', reason: 'AC 2 moves the expiry to 48 hours', by: 'acct-reviewer', at: 'T-4h' }],
    acs: { by: 'acct-po', at: 'T-5d', acceptanceCriteria: ACS },
  }, KEY);
  const approvals = await j.readApprovals(KEY);
  assert.equal(approvals.changes.length, 1);
  assert.equal(approvals.removals.length, 0);
  assert.equal(approvals.acs.acHash, acHash(ACS));
  const [e] = await j.readAudit(approvals.changes[0].auditSeq, 1);
  assert.equal(e.event, 'test.change_approved');
  assert.equal(e.actor, 'acct-reviewer');
  assert.deepEqual(e.data, { key: KEY, test: 'tests/test_idempotency.py::test_keys_expire_after_24_hours', reason: 'AC 2 moves the expiry to 48 hours' });
  // The app's own check accepts the AC record: the event matches and another person made it.
  const events = new Map();
  for (const seq of [approvals.acs.auditSeq]) events.set(seq, (await j.readAudit(seq, 1))[0]);
  const ok = acsRecorded({ ticket: { key: KEY, acceptanceCriteria: ACS }, approvals, approvalEvents: events, claimant: 'acct-claimant' });
  assert.equal(ok.status, 'pass', ok.reason);
  // A changed AC list no longer matches the record.
  const changed = acsRecorded({ ticket: { key: KEY, acceptanceCriteria: [] }, approvals, approvalEvents: events, claimant: 'acct-claimant' });
  assert.equal(changed.status, 'unknown');
});

test('(b) the claimant is given, and a case with no Jira data gives nothing', () => {
  assert.equal(simJira({ claimant: 'acct-claimant' }, KEY).claimant, 'acct-claimant');
  assert.equal(simJira(undefined, KEY), null);
});

test('(c) the edited comment differs from the report CI wrote in one base outcome', () => {
  const report = { tests: [{ id: 't::a', outcome: 'passed' }], repro: { tests: [{ id: 't::a', base: { outcome: 'passed', exc_type: null }, head: { outcome: 'passed' } }] } };
  const edited = editedComment(report, { test: 't::a', baseOutcome: 'failed', excType: 'AssertionError' });
  assert.deepEqual(edited.repro.tests[0].base, { outcome: 'failed', exc_type: 'AssertionError' });
  assert.equal(report.repro.tests[0].base.outcome, 'passed', 'the CI report is not changed');
  assert.notEqual(reportHash(JSON.stringify(edited)), reportHash(JSON.stringify(report)));
});

test('(d) the push run on the merge commit failed, and its marker is the genuine main report', () => {
  const sha = 'm'.repeat(40);
  const run = pushRun({ id: 7001, sha, repo: 'ysant77/yms-bank-demo', conclusion: 'failure' });
  assert.equal(run.conclusion, 'failure');
  assert.equal(pushRun({ id: 7001, sha, repo: 'r' }).conclusion, 'success', 'the default stays success');
  const served = { head_sha: sha, tests: [{ id: 't::ac', outcome: 'passed', exc_type: null }] };
  const genuine = genuineMainReport(served, { test: 't::ac', excType: 'AssertionError' });
  assert.deepEqual(genuine.tests[0], { id: 't::ac', outcome: 'failed', exc_type: 'AssertionError' });
  const [marker] = mainArtifacts(JSON.stringify(genuine)).artifacts.map((a) => parseMarker(a.name)).filter(Boolean);
  assert.equal(marker.hash, reportHash(JSON.stringify(genuine)));
  assert.notEqual(marker.hash, reportHash(JSON.stringify(served)));
});
