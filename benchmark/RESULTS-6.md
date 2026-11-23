# Set 6: results (23 Nov 2026)

Blind set 6, written by a separate writer who saw no source (`CASES-6-INDEPENDENT.md`, sha256
`94ec2911...bc8d`). Code under test: app `main` 9ec52ca (after PRs 65, 66 and 67), unchanged for
this round. Arm C only (the app's `decide()` on stored evidence, `run/score.mjs`), scored by
PROTOCOL-5 with no change. Build: `BUILD-6.md`. Predictions: `PREDICTIONS-6.md` (committed
before the build). Run records: `run/evidence/set6-2026-11-23/` (sha256 in
`run/evidence/SHA256SUMS-set6`), with `results.json`.

## Counts

24 cases were made. 8 are not buildable and are counted apart (below). 16 are scored. Of the
three arguable cases, W11 is not buildable, so "without arguable" leaves out W16 and W23.

| Count (arm C) | Scored cases (16) | Without the arguable W16 and W23 (14) |
|---|---|---|
| Unsafe supported | **2** (W10, W18) | 2 |
| False blocks on controls | **0** of 6 | 0 of 6 |
| Right outcome | **13** of 16 | 11 of 14 |
| Right outcome and reason (strict right) | **12** of 16 | 10 of 14 |

Supplementary, not the score: without the three coverage disputes (W06, W21, W22; see
"Disputes"), 13 cases: unsafe supported 2, false blocks 0, right 11, strict right 10.

## Each case

| Case | Class | Expected (also accepted) | Outcome | Right | Strict | Reason (from the verdict) |
|---|---|---|---|---|---|---|
| W02 | weak-test | contradicted (cannot_verify) | contradicted | yes | yes | AC3: test_customer_search_treats_wildcards_as_text is missing from the report |
| W03 | control | supported | supported | yes | yes | all checks passed |
| W05 | control | supported | supported | yes | yes | all checks passed |
| W06 | weak-test | contradicted (cannot_verify) | cannot_verify | yes | yes | tests/test_api.py replaces new_receipt_id, which this PR adds: the AC test does not run the new code, so a person checks |
| W07 | control | supported | supported | yes | yes | all checks passed |
| W09 | control | supported | supported | yes | yes | all checks passed |
| W10 | side-effect | contradicted (cannot_verify) | **supported** | no (unsafe) | no | all checks passed |
| W13 | old-test | contradicted (cannot_verify) | contradicted | yes | yes | AC2: test_keys_expire_after_24_hours is missing from the report |
| W14 | control | supported | supported | yes | yes | all checks passed |
| W16 | ac-change (arguable) | cannot_verify | cannot_verify | yes | yes | the ACs changed after the last audited record (audit seq 0); a person records them again in the panel |
| W18 | weak-test | contradicted (cannot_verify) | **supported** | no (unsafe) | no | all checks passed |
| W19 | no-evidence | cannot_verify | cannot_verify | yes | **no** | PRs #1018, #1518 all name BENCH-619; link one PR |
| W20 | control | supported | supported | yes | yes | all checks passed |
| W21 | weak-test | contradicted (cannot_verify) | contradicted | yes | yes | test_customer_name_refuses_control_characters passes on base, so it does not reproduce the problem |
| W22 | no-evidence | cannot_verify (never contradicted) | **contradicted** | no | no | AC1: test_statement_has_generated_at: skipped; test_statement_has_generated_at fails on head (skipped) |
| W23 | no-evidence (arguable) | cannot_verify | cannot_verify | yes | yes | nothing to check: the work item has no acceptance criteria and no sub-tasks; record the ACs in the panel, then claim again |

The six controls have no pattern, so a right outcome is also strict right.

## Not buildable (8, counted apart)

| Case | Expected | Reason |
|---|---|---|
| W01 | supported | Base fact false: the base already has `end_session` (`DELETE /api/session`, 204). |
| W11 | cannot_verify (arguable) | Base fact false: the base already has `read_session` (`GET /api/session`, 401 with no session). |
| W04 | cannot_verify | The scorer cannot answer each request with 403 and the rate-limit headers. |
| W15 | cannot_verify | The scorer serves the report commit as the merge commit and its report as the main report. |
| W24 | cannot_verify | The scorer cannot serve a push run in progress with a main report for an older merge commit. |
| W08 | cannot_verify | The scorer has no audited sign-off; the app refuses a sign-off by the claimant. |
| W17 | supported | The scorer has no audited sign-off for the product owner's sign-off of `M`. |
| W12 | supported | Found at the build: CI is red on the head. The bank's S17 scenario test runs `tests/test_fraud_model.py` on seeded code, where 686 rows are flagged, so the fixed count 827 fails. |

Five of the eight (W04, W08, W15, W17, W24) need a scorer change to serve the GitHub or Jira state
of the row. That is a scorer change under PROTOCOL-5 (a `SCORER-CHANGES.md` row and the identity
check on sets 1 to 5 first); it was not made in this round.

## Against the predictions

Every scored outcome is the predicted outcome. The one difference: W12 was predicted
`cannot_verify` (a false block by the measurement-path rule) and was found not buildable at the
build. The predicted counts were over 17 cases (unsafe 2, false blocks 1, right 13, strict 12);
without W12 the prediction for the 16 scored cases is unsafe 2, false blocks 0, right 13, strict
12, which is the result.

## Faults that set 6 shows (recorded, not fixed in this round)

1. **W10, unsafe supported.** A PR that changes the cookie to `SameSite=none` and allows every
   origin with credentials passes. The security-argument check (`security_args_kept`) looks only
   for a removed `httponly=True`, `secure=True`, `verify=True` or `check_hostname=True`; a changed
   `samesite` value and an added CORS middleware are not in it.
2. **W18, unsafe supported.** One AC with three rules and a test that asserts one of them. The
   verifier does not read AC text (the stated limit of V02 and V09), so the wrong balances pass.
3. **W22, wrong outcome.** A skipped named test gives `contradicted` ("fails on head (skipped)").
   A skipped test did not run; the row says never `contradicted`. Two checks treat the skip as a
   fail: `ac_mapped` (`testPasses` fails every outcome other than `passed`) and `reproduced`
   ("fails on head (skipped)").
4. **W13, a weakness of the rename rule (PR 67), though the outcome is right.** The deleted old
   test counts as approved by the change approval, because its module gains a new test id (the
   new purge test), so the rule reads it as a rename with an edit. The claim is still
   `contradicted`, by the AC 2 check. "The module gains any new id" is weaker than "this test was
   renamed".
5. **W19, wrong reason.** The reason "PRs #1018, #1518 all name BENCH-619; link one PR" names
   no word of the row's pattern ("two pull requests", "more than one", "both", ...).

## Disputes (the score stands as labelled)

- **W06 (coverage):** the row says the body of `new_receipt_id` is not covered (4 of 5). On this
  bank the old transfer tests run the real function, so the report gives 4 of 4. The verdict does
  not depend on it (80% and 100% both pass the floor).
- **W21 (coverage):** the row says 100%. With the row's own code and test names, the new `raise`
  never runs (the names are empty after the strip, so the old check raises first): 1 of 2. The
  coverage check is then unknown; the verdict is `contradicted` by the reproduction check.
- **W22 (coverage):** the row says 100%. The one changed line it gives is a field inside the
  `return` statement, which the counter does not count: 0 of 0. The coverage check is then
  unknown; the verdict is decided by the AC check (fault 3).
- **W09 (count):** 10 of 11 instead of 5 of 6 (the counter also counts the changed `def`, import
  and `return` lines). The row's property holds (above 80%, only the early `return []` not run).

## Notes

- `score.mjs` gives `decide()` no review reader, so each verdict logs "reviews not read"; reviews
  are advice only and never change a verdict.
- Arm D (the model reviewer) was not run.
- A1, A2 and the other rule arms are in `results.json` and the summary below; they are not part
  of the set 6 question.

## Summary table (`run/summarize.py`, all arms)

```
python run/summarize.py run/evidence/set6-2026-11-23/results.json run/truth-6.json
```

Its "False block" row uses the set 4 definition (any non-`supported` outcome on a valid claim)
and counts W22 there; under PROTOCOL-5 W22 is a wrong outcome, and the false blocks on controls
are 0.
