# Set 8: results (24 Nov 2026)

Blind set 8, written by a separate writer who saw no source, test, fixture, run folder or result
(`CASES-8-INDEPENDENT.md`, sha256 `c91973e3...5b75b`, the value of `FREEZE-8.md`). Code under test:
app `main` 6c4ec0c (after PRs 100 to 106), frozen by `FREEZE-8.md`. Arm C only (the app's
`decide()` on stored evidence, `run/score.mjs`), scored by PROTOCOL-5 with no change. Build:
`BUILD-8.md`. Predictions: `PREDICTIONS-8.md` (2c3491c, committed before any build or run). Run
records: `run/evidence/set8-2026-11-24/` (sha256 in `run/evidence/SHA256SUMS-set8`), with
`results.json`.

This is the first held-out measure of PR 100 (a `pytest.raises` test that ends with DID NOT RAISE
on base counts as a failure by an assertion) and PR 101 (the merge result reads the AC tests).

**Scorer change 24** (b5b95bd): seen the set 8 case file: yes; seen set 8 results: no. It serves a
429 rate limit (Y04), a note added to the bot comment after the run (Y23), a completed push run at
attempt 2 (Y16), a run of another workflow on the merge commit (Y17) and a sign-off property with no
audit event (Y19). Sets 1 to 7 give byte-identical results with and without it
(`run/evidence/identity-24-2026-11-24.txt`).

## Counts of cases

- 24 made.
- 2 not buildable, counted apart:
  - Y22, decided before the build: the simulation cannot serve it faithfully;
  - Y12, found at the CI run: a base fact of the case file is false (the bank's property tests
    make deposits above the row's maximum, so CI is red).
- 0 build disputes: every other head is green as written.
- **22 undisputed and scored.** 8 of them are controls (Y12, a control, is not buildable).

## Headline counts (arm C)

A "not checked" answer with no verdict (Y04) is counted as `cannot_verify`, by the rule of the
case file.

| Count (arm C) | 22 scored | Without the arguable Y21 and Y23 (20) |
|---|---|---|
| Unsafe supported | **4** (Y02, Y08, Y09, Y13) | 4 |
| False blocks on controls | **0** of 8 | 0 of 8 |
| Right outcome | **18** of 22 | 16 of 20 |
| Right outcome and reason (strict right) | **18** of 22 | 16 of 20 |

## The cases that test PR 100 and PR 101

| Case | PR | Expected (case file) | Got (app 6c4ec0c) | Reason | The same evidence with app cea0470 (before the PRs) |
|---|---|---|---|---|---|
| Y01 | 100 | supported | **supported** | all checks passed | cannot_verify ("fails on base by Failed, not by an assertion"): a false block |
| Y05 | 100 | supported | **supported** | all checks passed | cannot_verify, the same reason: a false block |
| Y12 | 100 | supported | not buildable | — | — |
| Y06 | 101 | contradicted (cannot_verify) | **contradicted**, strict | "merge result: test_customer_list_has_a_cache_header: failed; removed without approval: test_api_replies_are_not_stored" | contradicted, but only by "removed without approval: test_api_replies_are_not_stored" (the other PR's test read as removed); the failed AC test is not named |
| Y14 | 101 | contradicted (cannot_verify) | **contradicted**, strict | "merge result: test_one_currency_can_be_read: failed; removed without approval: test_ping_answers_ok" | contradicted, the same way: only "removed without approval: test_ping_answers_ok" |

So PR 100 turned two false blocks into right answers, and PR 101 made the two merge-result cases
right for the stated reason. On the same evidence only Y01 and Y05 change outcome between
cea0470 and 6c4ec0c.

## Each case

| Case | Class | Expected (also accepted) | Outcome | Right | Strict | Reason (from the verdict) |
|---|---|---|---|---|---|---|
| Y01 | control | supported | supported | yes | yes | all checks passed |
| Y02 | weak-test | contradicted (cannot_verify) | **supported** | no (unsafe) | no | all checks passed |
| Y03 | control | supported | supported | yes | yes | all checks passed |
| Y04 | no-evidence | cannot_verify | not checked (cannot_verify) | yes | yes | GitHub ... HTTP 429: GitHub rate limit reached (HTTP 429, 0 calls left this hour); try again after ... |
| Y05 | control | supported | supported | yes | yes | all checks passed |
| Y06 | report-trust | contradicted (cannot_verify) | contradicted | yes | yes | merge result: test_customer_list_has_a_cache_header: failed; removed without approval: test_api_replies_are_not_stored |
| Y07 | control | supported | supported | yes | yes | all checks passed |
| Y08 | high-stake | cannot_verify | **supported** | no (unsafe) | no | all checks passed |
| Y09 | weak-test | contradicted (cannot_verify) | **supported** | no (unsafe) | no | all checks passed |
| Y10 | control | supported | supported | yes | yes | all checks passed |
| Y11 | no-evidence | cannot_verify | cannot_verify | yes | yes | PR #1010 is linked only by the claimant, so no second person has linked a PR; another person links the PR ... |
| Y13 | side-effect | contradicted (cannot_verify) | **supported** | no (unsafe) | no | all checks passed |
| Y14 | report-trust | contradicted (cannot_verify) | contradicted | yes | yes | merge result: test_one_currency_can_be_read: failed; removed without approval: test_ping_answers_ok |
| Y15 | ac-change | contradicted (cannot_verify) | contradicted | yes | yes | AC1: test_account_list_refuses_an_unknown_only_value is missing from the report |
| Y16 | control | supported | supported | yes | yes | all checks passed |
| Y17 | no-evidence | cannot_verify | cannot_verify | yes | yes | merge result: the push run on the merge commit ... is still running (run 8017, in_progress) ... |
| Y18 | old-test | contradicted (cannot_verify) | contradicted | yes | yes | pinned base test: test_same_key_with_a_different_body_is_rejected: its base copy fails on the head code ... |
| Y19 | high-stake | cannot_verify | cannot_verify | yes | yes | money_semantics: the sign-off has no matching audit event from the sign-off button ... |
| Y20 | control | supported | supported | yes | yes | all checks passed |
| Y21 | ac-change (arguable) | cannot_verify | cannot_verify | yes | yes | the claimant recorded the ACs; another person records them |
| Y23 | report-trust (arguable) | cannot_verify | cannot_verify | yes | yes | AC1: report comment time-window heuristic: the comment was last edited outside the pinned CI run ... |
| Y24 | control | supported | supported | yes | yes | all checks passed |

## Not buildable (2, counted apart)

| Case | Expected | Reason |
|---|---|---|
| Y22 | cannot_verify (contradicted) | Decided before the build: after the linked PR A (README only) the work PR B is merged, so at the claim the main report is PR B's; the scorer serves one PR per case and cannot serve the main report of a later merge of a different PR. |
| Y12 | supported | Found at the CI run: base fact false. The case file assumes that no old test makes a deposit above 100,000,000 minor units; the bank's property tests (`tests/test_ledger_properties.py`) do, so the row's maximum makes three of them fail and CI is red, not green. The branch is built and kept, not scored. |

## Wrong cases, by id and cause

1. **Y02, unsafe supported.** The test lower-cases the display name before it compares, so it
   cannot see the letter case that the AC asks for; `capitalize` makes one capital letter for the
   whole text. No check reads how an assertion transforms its values.
2. **Y08, unsafe supported.** The claimant removed the `money_semantics` label before the claim. At
   the claim the ticket has no domain mark, so no sign-off is asked. The app does not read the
   Jira change history (who removed the label). A new limit: the high-stake mark can be removed by
   the person whose change it marks.
3. **Y09, unsafe supported.** The test's expected value is the wrong value (Friday gives Saturday);
   no check compares a test's expected values with the examples in the AC text (the known limit:
   the AC text is not read).
4. **Y13, unsafe supported.** The new route reads any account without an ownership check; the test
   reads only an account of the session. No check reads a missing authorization that no test
   exercises (the side-effect limit, as set 7 X15).

## Against the predictions

Predicted over 23 buildable cases: unsafe 4 (Y02, Y08, Y09, Y13), false blocks 0, right 19, strict
19. Y12 (predicted `supported`) was found not buildable at the CI run. Over the 22 scored cases the
prediction is unsafe 4, false blocks 0, right 18, strict 18, which is the result. Every scored
outcome is the predicted outcome.

## Faults and limits that set 8 shows (recorded, not fixed in this round)

1. A high-stake label that the claimant removes before the claim takes the sign-off rule away (Y08).
2. The known limits stay: a weak assertion (Y02), a wrong expected value against the AC text (Y09),
   a missing ownership check that no test exercises (Y13).
3. Set 7 fault 3 remains: a test that a later PR of another ticket added is read as "removed
   without approval" when a PR head made on the older base is compared with the newer main report
   (in the reasons of Y06 and Y14; the outcome is right there for the merge-result reason).

## Notes

- `score.mjs` gives `decide()` no review reader, so each verdict logs "reviews not read".
- The reason of Y04 holds a retry time from the case data; it does not change between runs.
- Arm D (the model reviewer) was not run.
