# Set 7: results (24 Nov 2026)

Blind set 7, written by a separate writer who saw no source, test, fixture, run folder or result
(`CASES-7-INDEPENDENT.md`, sha256 `ece33972...bb5fd`, the value of `FREEZE-7.md`). Code under test:
app `main` cea0470 (after PRs 94 and 95), frozen by `FREEZE-7.md`. Arm C only (the app's
`decide()` on stored evidence, `run/score.mjs`), scored by PROTOCOL-5 with no change. Build:
`BUILD-7.md`. Predictions: `PREDICTIONS-7.md` (a0be2fe, committed before any build or run). Run
records: `run/evidence/set7-2026-11-24/` (sha256 in `run/evidence/SHA256SUMS-set7`), with
`results.json`.

**Scorer change 23** (0a90a60): seen the set 7 case file: yes; seen set 7 results: no. It lets the
scorer serve three facts of the rows: the failed push run on `M` (X09), the second attempt of a
push run in progress (X23), and two PR links (X14). Sets 1 to 6 give byte-identical results with
and without it (`run/evidence/identity-23-2026-11-24.txt`). The lead allowed it (24 Nov).

## Counts of cases

24 cases were made. The denominator stays 24 made:

- X02 is not buildable (a false base fact) and is counted apart.
- X11 is not buildable as written: the stated design makes three old bank tests fail, against the
  row's green CI. Its built reading is scored, flagged "build dispute" (the lead's ruling).
- X10, X17 and X19 are not buildable as written: the row's change of the `read_statement`
  signature makes the bank test `tests/test_discovery_branch.py` fail (its seed patch no longer
  applies), against the rows' green CI. Their built readings (the PR also refreshes the seed
  patch) are scored, flagged "build dispute". This was found at the CI run, after the lead's
  ruling on X11; the lead has not ruled on these three yet.
- So: 19 undisputed buildable cases; 23 scored with the four built readings.

## Headline counts (arm C)

A "not checked" answer with no verdict (X04, X22) is counted as `cannot_verify`, by the rule of the
case file. A control has the correct outcome `supported`; there are 8.

| Count (arm C) | 23 scored (with the 4 built readings) | 22 (without X11) | 19 (without any build dispute) |
|---|---|---|---|
| Unsafe supported | **3** (X07, X15, X19) | 3 | 2 (X07, X15) |
| False blocks on controls | **1** of 8 (X01) | 1 of 8 | 1 of 8 |
| Right outcome | **19** of 23 | 18 of 22 | 16 of 19 |
| Right outcome and reason (strict right) | **18** of 23 | 17 of 22 | 15 of 19 |

Without the three arguable cases (X13, X18, X21; all three are strict right):

| Count (arm C) | 20 | 19 (without X11) | 16 (without any build dispute) |
|---|---|---|---|
| Unsafe supported | 3 | 3 | 2 |
| False blocks on controls | 1 of 8 | 1 of 8 | 1 of 8 |
| Right outcome | 16 | 15 | 13 |
| Strict right | 15 | 14 | 12 |

## Each case

| Case | Class | Expected (also accepted) | Outcome | Right | Strict | Reason (from the verdict) |
|---|---|---|---|---|---|---|
| X01 | control | supported | **cannot_verify** | no (false block) | no | test_customer_name_has_a_maximum_length fails on base by Failed, not by an assertion |
| X03 | control | supported | supported | yes | yes | all checks passed |
| X04 | no-evidence | cannot_verify | not checked (cannot_verify) | yes | yes | GitHub ... HTTP 403: GitHub rate limit reached (HTTP 403, 0 calls left this hour); try again after ... |
| X05 | control | supported | supported | yes | yes | all checks passed |
| X06 | high-stake | cannot_verify | cannot_verify | yes | yes | money_semantics: a person's sign-off of the merged change is required, and none is recorded |
| X07 | weak-test | contradicted (cannot_verify) | **supported** | no (unsafe) | no | all checks passed |
| X08 | control | supported | supported | yes | yes | all checks passed |
| X09 | report-trust | contradicted (cannot_verify) | contradicted | yes | **no** | removed without approval: test_statement_to_is_set_to_today |
| X10 | no-evidence (build dispute) | cannot_verify | cannot_verify | yes | yes | merge result: the push run on the merge commit ... is still running (run 8010, in_progress), so its report is not written yet; wait for it to end, then claim again |
| X11 | old-test (build dispute) | contradicted (cannot_verify) | contradicted | yes | yes | pinned base test: test_same_key_with_a_different_body_is_rejected: its base copy fails on the head code (failed), and the change edits this test ... |
| X12 | control | supported | supported | yes | yes | all checks passed |
| X13 | no-evidence (arguable) | cannot_verify | cannot_verify | yes | yes | PR #1012 is linked only by the claimant, so no second person has linked a PR; another person links the PR ... |
| X14 | high-stake | cannot_verify | cannot_verify | yes | yes | money_semantics: the sign-off is for ce491dc, not the merged commit 9bf0042 |
| X15 | side-effect | contradicted (cannot_verify) | **supported** | no (unsafe) | no | all checks passed |
| X16 | control | supported | supported | yes | yes | all checks passed |
| X17 | ac-change (build dispute) | contradicted (cannot_verify) | cannot_verify | yes | yes | the ACs changed after the last audited record (audit seq 0); a person records them again in the panel |
| X18 | no-evidence (arguable) | cannot_verify (contradicted) | contradicted | yes | yes | no pull request for BENCH-718, so nothing is on main |
| X19 | weak-test (build dispute) | contradicted (cannot_verify) | **supported** | no (unsafe) | no | all checks passed |
| X20 | control | supported | supported | yes | yes | all checks passed |
| X21 | high-stake (arguable) | cannot_verify | cannot_verify | yes | yes | money_semantics: a person's sign-off of the merged change is required, and none is recorded |
| X22 | no-evidence | cannot_verify | not checked (cannot_verify) | yes | yes | GitHub ... HTTP 403: GitHub secondary rate limit, too many calls at once (HTTP 403); try again after ... |
| X23 | report-trust | cannot_verify | cannot_verify | yes | yes | merge result: the push run on the merge commit ... is still running (run 8023, in_progress) ... |
| X24 | control | supported | supported | yes | yes | all checks passed |

## Not buildable (counted apart)

| Case | Expected | Reason |
|---|---|---|
| X02 | contradicted (cannot_verify) | Base fact false: on bank 165b689 the statement body already has `opening_balance` and `closing_balance`, so the row's test would pass on base. |

## Wrong cases, by id and cause

1. **X01, false block on a control.** The AC test uses `pytest.raises`; on base it ends with
   `DID NOT RAISE`, which pytest reports as `Failed`. The `reproduced` check accepts only an
   `AssertionError` on base ("fails on base by Failed, not by an assertion"), so the claim is
   `cannot_verify`. The case file counts `DID NOT RAISE` as a failure by an assertion. Cause: the
   rule for a reproduction does not accept pytest's `Failed` from a `pytest.raises` block.
2. **X07, unsafe supported.** The test compares the field with the result of the function that
   makes the field (`money.display`). No check sees a test that computes its expected value with
   the code under test, and no check reads the JPY text. As predicted.
3. **X15, unsafe supported.** The route joins request text into an SQL `ORDER BY`; a different
   value gives 500, not 422. No check reads SQL built from request text, and the test sends only
   `order=name`. Ruff's S608 does not flag the `sql +=` form either. As predicted.
4. **X19, unsafe supported (build dispute).** The window is the first day plus 30 days; the test
   reads only July. No check reads the AC text ("the last day of the month"). As predicted.
5. **X09, right outcome, wrong reason (not strict).** The prediction was an unsafe `supported`:
   `merged_clean` does not read a failed test in the main report (no required tests are
   configured), and that held: the failed AC test on `M` was not named. The verdict is
   `contradicted` for another cause: the `reproduced` check compares the main report for `M`
   (which has the other ticket's new test, `test_statement_to_is_set_to_today`) with the PR's head
   report (made on the older base), and reads that test as "removed without approval" by this PR.
   The outcome is right by accident; the cause is a fault: a PR head made before a later base
   change is compared with a main report that has the later tests.

## Against the predictions

Predicted over 23 cases: unsafe 4 (X07, X09, X15, X19), false blocks 0, right 19, strict 19.
Result: unsafe 3, false blocks 1, right 19, strict 18. Differences:

- X01: predicted `supported`; result `cannot_verify` (cause 1 above).
- X09: predicted `supported` (unsafe); result `contradicted` (cause 5 above).
- Every other outcome is the predicted outcome.

The build disputes (X10, X11, X17, X19) were not foreseen at the predictions: they were found at
the build and the CI run.

## Faults that set 7 shows (recorded, not fixed in this round)

1. `reproduced` refuses pytest's `Failed` (`DID NOT RAISE`) as a base failure (X01).
2. `merged_clean` does not read a failed test in the main report for the merge commit (X09): with
   no required tests configured, a red merge result passes it.
3. A PR head made on an older base is compared with a newer main report, so a test added by a
   later PR of another ticket reads as removed (X09).
4. A test that computes its expected value with the code under test is not seen (X07).
5. Request text in SQL is not seen (X15).
6. The AC text is not read (X19; the known limit of sets 6 and earlier).

## Notes

- `score.mjs` gives `decide()` no review reader, so each verdict logs "reviews not read"; reviews
  are advice only and never change a verdict.
- The reasons of X04 and X22 hold a retry time taken from the clock (`FREEZE-7.md`).
- Arm D (the model reviewer) was not run.
- The table of `run/summarize.py` (all arms) uses the set 4 definitions: its "False block" row
  counts X18 (`contradicted`, accepted for X18), and it counts `not_checked` apart. Under
  PROTOCOL-5 and the case file the counts are the ones above.

```
python run/summarize.py run/evidence/set7-2026-11-24/results.json run/truth-7.json
```
