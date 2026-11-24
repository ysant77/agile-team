# Set 8: freeze note (fixed 24 Nov 2026, before the set 8 case file is opened)

## The case file

- Writer: blind. The writer saw no source, test, fixture or run folder of the app or the bank, and
  no set 8 result. The lead holds the file.
- sha256 of the case file: **open**. The lead sends it when the writer finishes; it is added to
  this file in the same PR, before the merge. No other line changes when it is added.
- Checked after the copy into `CASES-8-INDEPENDENT.md`: (filled in `BUILD-8.md` after the release;
  this note does not change)

## Frozen code

| Part | Repository | Commit |
|---|---|---|
| The app under test (`--app`, `--app-main`) | agile-team `main` | `6c4ec0c14630321477807a60ae43fa5ed0f36a56` |
| Configuration (`VERIFY_CONFIG` of that commit) | agile-team `main` | `6c4ec0c14630321477807a60ae43fa5ed0f36a56` |
| Runner, scorer, summary (`benchmark/run`) | agile-team `main` | `6c4ec0c14630321477807a60ae43fa5ed0f36a56`; scorer changes up to 23 |
| Bench base, and `scripts/repro.py`, `scripts/changed_coverage.py`, `scripts/pinned.py` | yms-bank-demo `main` | `165b6893c351a098319112e0ed1eb27d5e77fbce` |
| Arm D | agile-team `main` | not run (arm C only) |

The frozen app commit is `main` after PR 111.

From the frozen commit until `RESULTS-8.md` is pushed: no change to `src/verifier/`,
`src/verify-claim.js`, `src/github-evidence.js`, `src/jira-evidence.js`, `src/approvals.js`,
`src/review*.js`, `src/sign-off.js`, `src/pr-link.js` or the scorer.

## What changed since the set 7 freeze (cea0470)

For the lead's record only; never given to the writer. The merged PRs that change the code under
test (`src/`) or the scorer.

| PR | Change | Claim path? |
|---|---|---|
| 98 | Scorer change 23 (with the set 7 results): the push run conclusion of a merge result, the attempt of a push run in progress, more than one PR link. `benchmark/run/`. | scorer only |
| 100 | `reproduced` counts pytest's own "Failed: DID NOT RAISE" on base as a failure by an assertion (set 7 X01). `src/verifier/checks.js`. | **yes**: it changes verdicts (on sets 1 to 7 only X01 moved) |
| 101 | `merged_clean` reads each AC test in the report for the merge commit: a failed one fails the merge result, a missing one is unknown (set 7 X09). `src/verifier/checks.js`. | **yes**: it changes verdicts and reasons (on sets 1 to 7 no outcome moved) |
| 102 | Two more lines under "Never checked by the code checks" (set 7 X07, X15). `src/verdict-view.js`. | no: panel text only |
| 103 | Ticket drafts with a number or money wait for the person who asked ("Drafts waiting for you"). `src/index.js` (create-ticket), `src/ticket-draft.js`, `src/resolvers.js`, panel. | no: ticket creation, not a claim |
| 106 | A claim that GitHub could not answer is kept apart (`not-checked:<key>`) and shown in the panel. `src/verify-claim.js` (the transient branch of `verifyClaim`), `src/verdict-view.js`, `src/resolvers.js`, panel. | in `verifyClaim`, after `decide()`: it stores a record and writes no verdict; arm C scores `decide()`, so the score is not changed by it |

Set 8 is the first held-out measure of PRs 100 and 101. Expected effects, written before the case
file is opened (`docs/COMPARISON-PLAN.md`): fewer false blocks on controls with a `pytest.raises`
test; a red merge result for an AC test that fails on the merge commit. Expected to stay: weak
tests and harmful changes that no test exercises can pass.

## Facts that the scorer cannot express (fixed before the case file is opened)

Scorer changes 22 and 23 serve the sign-off, the PR links (one or more), the rate limits, the
merge commit that CI did not run on (with its push run conclusion) and a push run in progress (with
its attempt). A case that needs one of the facts below is not buildable. It is counted apart, with
its reason, and never rewritten.

- Two claims at the same time on one work item (the claim lease): the scorer runs one claim per
  case (`run/score.mjs`).
- A Jira error or a Jira answer that is not the case data: the simulated Jira gives only the case
  data (`run/sim-jira.mjs`).
- A GitHub failure other than 404 on the run list (`github.runs404`) and the rate limit
  (`github.rateLimited`), for example a 5xx answer or a timeout (`run/score.mjs`, `run/sim-set7.mjs`).
- A failure of the app store or the audit chain while a claim runs (`run/sim-jira.mjs`).
- Advice from a model reviewer: arm C does not run a model (`run/score.mjs`).
- The Jira change history, PR descriptions and code-host reviews: the frozen app does not read
  them for a verdict, and the scorer has no field for them.
- A rate-limit reason holds a clock time ("try again after ..."): the app adds the simulated
  `retry-after` header to the time of the run, so two runs of one case can differ in that text
  only. Results are compared by outcome and checks, not by this time.
- Known limits that stay (stated, not fixed): the verifier does not read AC text; it has no check
  for a test that computes its expected value with the code under test, or for a side effect that
  no test asserts.

Builder's note from set 7: a case that changes the signature of `read_statement` makes the bank's
`tests/test_discovery_branch.py` fail (its seed patch no longer applies). Such a case is "not
buildable as written" and is scored as a build dispute with a built reading, as ruled for set 7.

## Arms

- C: the app's `decide()` on stored evidence (`run/score.mjs`), every buildable case.
- D: not run.

## After the freeze

From the frozen commit until `RESULTS-8.md` is pushed: no change to the verifier files named
above. A scorer change is allowed only as a row in `run/SCORER-CHANGES.md` that states "seen the
set 8 case file" and "seen set 8 results: yes" or "no", with the results before and after the
change.

## Local only

No push, PR or merge on a demo repository, no deploy, and no Forge variable change for set 8.
The bench clone `bench-bank-8` has no remote.
