# Set 9: freeze note (fixed 25 Nov 2026, before the set 9 case file is opened)

## The case file

- Writer: blind. The writer saw no source, test, fixture or run folder of the app or the bank, and
  no result. The lead holds the file.
- sha256 of the case file, given by the lead before the release: (open; the lead gives it when the
  writer ends. It is filled in by one commit that changes only this line.)
- Checked after the copy into `CASES-9-INDEPENDENT.md`: (filled in `BUILD-9.md` after the release;
  this note does not change)

## Frozen code

| Part | Repository | Commit |
|---|---|---|
| The app under test (`--app`, `--app-main`) | agile-team `main` | `f3662f88aecfe05cdcca53b7f0d8a7553b90a38f` |
| Configuration (`VERIFY_CONFIG` of that commit) | agile-team `main` | `f3662f88aecfe05cdcca53b7f0d8a7553b90a38f` |
| Runner, scorer, summary (`benchmark/run`) | agile-team `main` | `f3662f88aecfe05cdcca53b7f0d8a7553b90a38f`; scorer changes up to 25 |
| Bench base, and `scripts/repro.py`, `scripts/changed_coverage.py`, `scripts/pinned.py` | yms-bank-demo `main` | `165b6893c351a098319112e0ed1eb27d5e77fbce` |
| Arm D | agile-team `main` | not run (arm C only) |

The frozen app commit is `main` after PR 122. It holds PR 117 and PR 118. `src/` and
`benchmark/run/` are the same as at 4bb45fb (after PR 120); PRs 121 and 122 change docs only.

From the frozen commit until `RESULTS-9.md` is pushed: no change to `src/verifier/`,
`src/verify-claim.js`, `src/github-evidence.js`, `src/jira-evidence.js`, `src/approvals.js`,
`src/approval-actions.js`, `src/review*.js`, `src/sign-off.js`, `src/pr-link.js` or the scorer.

## What changed since the set 8 freeze (6c4ec0c)

For the lead's record only; never given to the writer. The merged PRs that change the code under
test (`src/`) or the scorer.

| PR | Change | Claim path? |
|---|---|---|
| 116 | Set 8 results (`benchmark/`); no scorer change. | no |
| 117 | The AC record keeps the high-stake marks of the work item. A mark that a person other than the claimant recorded with the ACs and that is gone at the claim still asks for the sign-off; the issue changelog names the claimant when the claimant removed it (`readMarkRemoval`). `src/approval-actions.js`, `src/verifier/checks.js`, `src/verify-claim.js`, `src/jira-evidence.js`. Scorer change 25 serves `jira.acs.marks` and `jira.markRemoval`. | **yes**: on sets 1 to 8 only set 8 Y08 moves (`supported` to `cannot_verify`), with the change 25 fields (`run/evidence/impact-high-stake-mark-2026-11-24.txt`) |
| 118 | A main-report test counts as removed only when its module is in the PR's file list; with no readable file list, every one counts. `src/verifier/checks.js`. | **yes**: reasons change (set 8 Y06, Y14); no outcome moves on sets 1 to 8 (`run/evidence/impact-removed-test-pr-files-2026-11-24.txt`) |

Set 9 is the first held-out measure of PR 117 and PR 118. Expected effects, written before the
case file exists (`SET9-PREPARATION.md`):

- PR 117: a high-stake label recorded with the ACs by a person other than the claimant and removed
  by the claimant before the claim gives `cannot_verify`, with the mark and the claimant named;
  with a valid sign-off by another person, `supported`.
- PR 118: a test that a later PR of another ticket added to main, in a module that this PR does
  not change, is not read as removed; no false block from it.

Expected to stay: a label removed before a non-claimant AC record; an AC record from an app
without PR 117; a later test in a module that this PR also changes (read as removed); weak tests
and the AC text not read; a harmful change that no test exercises.

## Facts that the scorer cannot express (fixed before the case file is opened)

Scorer changes 22 to 25 serve the sign-off (with or without its audit event), one or more PR
links, the rate limits (403 and 429), a merge commit that CI did not run on (with its push run
conclusion), a push run in progress (with its attempt), a completed push run at a later attempt,
runs of other workflows on the merge commit, a note added to the bot comment after the run, the
high-stake marks of the AC record and the last removal of such a mark. A case that needs one of
the facts below is not buildable. It is counted apart, with its reason, and never rewritten.

- Two claims at the same time on one work item (the claim lease): the scorer runs one claim per
  case (`run/score.mjs`).
- An earlier claim on the same work item: the scorer serves and scores one claim.
- A Jira error or a Jira answer that is not the case data (`run/sim-jira.mjs`).
- A GitHub failure other than a 404 on the run list and the rate limit, for example a 5xx answer
  or a timeout.
- A failure of the app store or the audit chain while a claim runs.
- Advice from a model reviewer: arm C does not run a model.
- PR descriptions and code-host reviews: `score.mjs` gives `decide()` no review reader.
- The main report of a later merge of a different PR: the scorer serves one PR per case.
- The Jira change history other than the last removal of a high-stake mark (who changed an AC
  field, a label or a status, and when).
- The author of a PR; the last editor and the earlier revisions of a comment.
- A REST write as such: only its result (for example a sign-off property with no audit event) is
  served.
- A rate-limit reason holds a clock time; results are compared by outcome and checks, not by this
  time.
- Known limits that stay (stated, not fixed): the verifier does not read AC text; it has no check
  for a test that computes its expected value with the code under test, or for a side effect that
  no test asserts.

Builder's notes:

- A case that changes the signature of `read_statement` makes `tests/test_discovery_branch.py`
  fail: not buildable as written, scored as a build dispute with a built reading (set 7 ruling).
- A base fact of the form "no old test does X" is checked with the bank's full suite, property
  tests included, before the predictions are committed (set 8 Y12).

## Arms

- C: the app's `decide()` on stored evidence (`run/score.mjs`), every buildable case.
- D: not run.

## After the freeze

From the frozen commit until `RESULTS-9.md` is pushed: no change to the verifier files named
above. A scorer change is allowed only as a row in `run/SCORER-CHANGES.md` that states "seen the
set 9 case file" and "seen set 9 results: yes" or "no", with the results before and after the
change.

## Local only

No push, PR or merge on a demo repository, no deploy, and no Forge variable change for set 9.
The bench clone `bench-bank-9` has no remote.
