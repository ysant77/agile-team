// The live judge route replayed with no network (scripts/judge-live.mjs): the five judge PRs of
// the cases repository, the panel's own AC, PR-link and sign-off actions, and verifyClaim. The
// GitHub answers are recorded real answers (fixtures/judge-live/). The verdicts must be the ones
// of docs/FIRST-JUDGE-CLAIM.md, which the live development site gave on 24 Nov.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CASES, REPO, fixturePath, recordedFetch, runCase } from '../scripts/judge-live.mjs';

const recording = (id) => JSON.parse(readFileSync(fixturePath(id), 'utf8'));

for (const id of Object.keys(CASES)) {
  test(`judge ${id} (PR ${CASES[id].pr}): the replayed claims give ${CASES[id].expect.join(', then ')}`, async () => {
    const { responses } = recording(id);
    const read = [];
    const { verdicts, records } = await runCase(id, recordedFetch(responses, read));
    assert.deepEqual(verdicts.map((v) => v.result), CASES[id].expect);
    // Every recorded answer is read, and nothing that is not recorded.
    assert.deepEqual([...new Set(read)].sort(), Object.keys(responses).sort());
    // Each verdict names the head and merge commits that GitHub gave for the judge PR.
    const pr = responses[`/repos/${REPO}/pulls/${CASES[id].pr}`].body;
    assert.equal(records.length, CASES[id].expect.length);
    for (const r of records) {
      assert.equal(r.headSha, pr.head.sha);
      assert.equal(r.mergeSha, pr.merge_commit_sha);
      assert.equal(r.claimant, 'judge-account-b');
    }
  });
}
