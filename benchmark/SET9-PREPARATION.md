# Set 9: preparation (24 Nov 2026; no case is written here)

This page holds the values for a blind set 9 before any case file exists. Set 9 would be the first
held-out measure of PR 117 (the high-stake mark kept with the AC record) and PR 118 (the
removed-test reason reads only the modules of the PR). The rules are those of `PROTOCOL-5.md`, and
the steps are the checklist of `SET7-PREPARATION.md`, Part 2, with "7" read as "9". This page does
not change them.

The lead commissions the writer after this page is merged. The writer gets the same inputs as for
set 8 and sees no source, test, fixture, run folder or result. Nothing on this page goes to the
writer.

## Values for the freeze note

Fill in `benchmark/FREEZE-9.md` from the template of `SET7-PREPARATION.md`, Part 1, with these
values. Check each value again on the day of the freeze.

| Field | Value known on 24 Nov | Check on the day |
|---|---|---|
| App under test (`--app`, `--app-main`) | agile-team `main` 4bb45fb (after PR 120) or a later `main` | The frozen commit holds PR 117 and PR 118. A later commit that changes a file of the frozen list below is a new "what changed" row. |
| Configuration (`VERIFY_CONFIG`) | the same commit | as above |
| Runner, scorer, summary (`benchmark/run`) | the same commit; scorer changes up to 25 | A change 26 before the release gets its row and the identity check on sets 1 to 8. |
| Bench base and scripts (`repro.py`, `changed_coverage.py`, `pinned.py`) | yms-bank-demo `main` 165b689 (unchanged since 19 Nov) | `git log -1 origin/main` of the bank |
| Case file sha256 | given by the lead before the release | checked after the copy into `CASES-9-INDEPENDENT.md` |
| Arms | C only (`run/score.mjs`); D not run | — |

Frozen files from the frozen commit until `RESULTS-9.md` is pushed: `src/verifier/`,
`src/verify-claim.js`, `src/github-evidence.js`, `src/jira-evidence.js`, `src/approvals.js`,
`src/review*.js`, `src/sign-off.js`, `src/pr-link.js` and the scorer (`benchmark/run`).

## What changed since the set 8 freeze (6c4ec0c)

For the lead's record only; never given to the writer.

| PR | Change | Claim path? |
|---|---|---|
| 116 | Set 8 results; no scorer change. | no |
| 117 | The AC record keeps the high-stake marks of the work item (`marks` in the `acs.recorded` event). When a mark that a person other than the claimant recorded is gone at the claim, `checkHumanSignoff` still asks for the sign-off, and names the claimant when the issue changelog shows that the claimant removed the label (`readMarkRemoval`). `src/approval-actions.js` (the AC record), `src/verifier/checks.js`, `src/verify-claim.js`, `src/jira-evidence.js`. Scorer change 25 serves `jira.acs.marks` and `jira.markRemoval`. | **yes**: on sets 1 to 8, only set 8 Y08 moves (`supported` to `cannot_verify`), and only with the change 25 fields (`run/evidence/impact-high-stake-mark-2026-11-24.txt`) |
| 118 | `testsNotRemoved` reads a main-report test as removed only when its module is in the PR's file list (a renamed file counts by its old name). With no readable file list, every main-report test counts, as before. `src/verifier/checks.js`. | **yes**: reasons change (set 8 Y06, Y14 lose "removed without approval: ..."); no outcome moves on sets 1 to 8 (`run/evidence/impact-removed-test-pr-files-2026-11-24.txt`) |

Production does not hold PR 117 or PR 118 (`docs/OWNER-HELD-STEPS.md`). Set 9 is a local run on
the frozen commit, as all sets are, so this does not change the measure. It changes what the
submission may say: a set 9 figure for these fixes is for the code on `main` and on development
5.17.0, not for production until the owner deploys.

## Facts that the scorer cannot express (fixed before the case file is opened)

Scorer changes 22 to 25 serve: the sign-off (with or without its audit event), one or more PR
links, the rate limits (403 and 429), a merge commit that CI did not run on (with its push run
conclusion), a push run in progress (with its attempt), a completed push run at a later attempt,
runs of other workflows on the merge commit, a note added to the bot comment after the run, the
high-stake marks of the AC record and the last removal of such a mark. A case that needs one of
the facts below is not buildable. It is counted apart, with its reason, and never rewritten.

From the set 8 freeze, still true:

- Two claims at the same time on one work item (the claim lease): the scorer runs one claim per
  case.
- A Jira error or a Jira answer that is not the case data.
- A GitHub failure other than a 404 on the run list and the rate limit, for example a 5xx answer
  or a timeout.
- A failure of the app store or the audit chain while a claim runs.
- Advice from a model reviewer: arm C does not run a model.
- PR descriptions and code-host reviews: `score.mjs` gives `decide()` no review reader.
- A rate-limit reason holds a clock time; results are compared by outcome and checks, not by this
  time.

Found in set 8, added here:

- The main report of a later merge of a different PR (set 8 Y22): the scorer serves one PR per
  case, so a case where the linked PR is merged and then another PR of the same work is merged
  before the claim cannot be served.
- The Jira change history other than the last removal of a high-stake mark: who added or changed
  an AC field, a label or a status, and when. Change 25 serves only `markRemoval`.
- The author of a PR (set 8 Y11): not served, and the app does not read it for a link.
- The last editor and the earlier revisions of a comment (set 8 Y23): the REST answer of a
  comment has no editor.
- An earlier claim on the same work item (set 8 Y12, the first claim): the scorer serves and
  scores one claim.
- A REST write by the claimant's token as such (set 8 Y19): only its result (a property with no
  audit event) is served.

Builder's notes:

- A case that changes the signature of `read_statement` makes `tests/test_discovery_branch.py`
  fail (its seed patch no longer applies): not buildable as written, scored as a build dispute with
  a built reading (set 7 ruling).
- A base fact of the form "no old test does X" is checked by running the full suite of the bank,
  property tests included, with the case's limit in place, before the predictions are committed
  (set 8 Y12: the property tests in `tests/test_ledger_properties.py` deposit above 1e8, and this
  was found only at the CI run).

## Expected effects, written before any case file exists

Effects that set 9 would measure, if the writer's cases exercise them:

1. **PR 117.** A product owner records the ACs while a high-stake label (for example
   `money_semantics`) is on the work item. The claimant removes the label before the claim, and no
   sign-off exists. Expected: `cannot_verify`, with a `human_signoff` reason that names the mark,
   says it was recorded with the ACs and is not on the work item, and names the claimant as the
   person who removed it. With a valid sign-off by a person other than the claimant: `supported`.
2. **PR 118.** A PR made on an older base, while another PR of another ticket adds a test in a
   module that the first PR does not change. Expected: the later test is not read as "removed
   without approval"; the claim is `supported` when everything else passes (before PR 118: a false
   block). When the PR does remove a test from a file that it changes, the reason stays.

Expected to stay (limits, not fixed):

1. **PR 117.** The bar stays low when:
   - the label was removed before any person other than the claimant recorded the ACs;
   - only the claimant recorded the ACs (then the claim is `cannot_verify` for that reason, not for
     the mark);
   - the AC record was made by an app version without PR 117 (no `marks` in the record);
   - the changelog cannot be read: the sign-off is still asked, but no one is named.
2. **PR 118.** A later test of another PR in a module that this PR also changes is still read as
   removed (a possible false block; set 7 X09 is such a case, and its reason does not move). With no readable file list every main-report test counts, as
   before.
3. Weak tests pass (a test that checks part of the criterion, transforms both sides before it
   compares, computes its expected value with the code it tests, or expects a wrong value). The
   app does not read the AC text (`docs/CLAIM-REGISTER.md`, row 7).
4. A harmful change that no test exercises can pass, for example a route with no ownership check
   (row 8).

The predicted counts are written per case in `PREDICTIONS-9.md` after the case file is opened and
before any build, as for set 8. The effects above are the only expectations fixed before the file
exists.

## Counting

The same as set 8: every case made stays in the denominator; a case that cannot be built is
counted apart with its reason; a build dispute is scored with its flag, and the headline is the
undisputed cases.
