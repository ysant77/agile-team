# Evidence benchmark: independent cases (16 Nov 2026)

These are independent cases, written without knowledge of the app's code or predictions. The
author read only `CASES.md` (sections 1 to 5) and the bank repository (`src/bank`, `tests`,
`scripts`, `.github/workflows`).

Rules:

- After the commit of this file, no case, truth label or correct outcome changes.
- A case found to be broken is marked `void` with a dated reason in a later commit. It stays in
  the count of cases made.
- This file has no prediction column. The builder adds predictions in a different file, before
  scoring.
- The terms (truth, evidence state, outcomes, "repro", categories 1 to 12) are those of
  `CASES.md`, sections 2 to 5. The table in section 3 of `CASES.md` applies. The rows below state
  the outcome explicitly.

## Cases

Each case is one branch on the bank repository. Paths and names are those of the repository at
the commit named in the run record. The builder gives each case a ticket key.

| Id | Cat. | Case | Truth | Evidence | Correct outcome and reason |
|---|---|---|---|---|---|
| I01 | 10 | Task: pure refactor. The PR moves the date-window code of `ledger.statement` into a private helper `_statement_window(start, end)`. No test file changes. The AC is: the statement tests in `tests/test_ledger.py` and `tests/test_api.py` pass on head with no change (`test_statement_running_balance`, `test_statement_end_date_is_inclusive`, `test_statement_rejects_reversed_range`, `test_statement_dates_out_of_range_are_400`). The suite is green on base and on head. Changed-line coverage is 100%. **control** | valid | trusted | `supported`. The claim is "no behaviour change". The evidence for it is the same tests, not changed, green on base and on head. A test that fails on base is not expected for a refactor. |
| I02 | 10 | Task: tests only. The ticket asks for tests of `money.from_minor` for negative amounts and for three-decimal currencies. The PR adds `test_from_minor_negative_amounts` and `test_from_minor_bhd_keeps_three_decimals` to `tests/test_money.py`. They assert exact `Decimal` values, for example `from_minor(-5, "BHD") == Decimal("-0.005")`. No file under `src/` changes. The new tests pass on base and on head. **control** | valid | trusted | `supported`. The ticket asks for tests of behaviour that exists. A pass on base is the expected result and shows no defect. No source line changed, so there is nothing more to cover. |
| I03 | 10 | Bug: a destination number typed with spaces (`yms 0000 0003`) gives 404. The fix normalises the number in `api.create_transfer` before `ledger.get_account_by_number`. The PR also renames `tests/test_api.py` to `tests/test_api_transfers.py` (a rename with no change to the old tests) and adds `test_destination_number_with_spaces_resolves` to the renamed file. The test asserts status 201 and the new balance. On base it fails by an assertion (404 is not 201). On head it passes. All old tests in the renamed file pass on base and on head. Changed-line coverage is 100%. **control** | valid | trusted | `supported`. The rename removes no test: each old test id exists under the new file name and passes. The AC test shows the defect on base and the fix on head. |
| I04 | 10 | Bug: a transfer reference of only white space is stored as text. It must be stored as no reference. The fix is in `ledger.transfer_once` (blank becomes `None` before the fingerprint and the posting). The AC test `test_blank_reference_is_stored_as_none` in `tests/test_api.py` is parametrised over `""`, `" "`, `"   "`, `"\t"` and `"INV-1"`. It makes a transfer and asserts the `reference` field of the statement line (`None` for the four blank values, `"INV-1"` for the last). On base the four blank ids fail by an assertion and the `INV-1` id passes. On head all five ids pass. Changed-line coverage is 100%. **control** | valid | trusted | `supported`. The four ids that show the defect fail on base by an assertion and pass on head. The fifth id checks behaviour that must not change, so a pass on base and on head is correct for it. |
| I05 | 3 | Story: a daily outgoing limit of 5,000.00 EUR for each account. The PR adds `ledger.over_daily_limit(conn, account_id, amount)` and a call in `api.create_transfer` that returns 409 when it is true. The function sums the signed journal lines of the day. Outgoing lines are negative, so the sum is never above the limit and the function always returns `False`. The AC test `test_transfer_over_daily_limit_is_409` replaces the function with `monkeypatch.setattr(ledger, "over_daily_limit", lambda *a: True, raising=False)` and asserts status 409. On base it fails by an assertion (201 is not 409). On head it passes. CI is green. No test runs the body of the real function. A real series of transfers above 5,000.00 EUR still succeeds on head. | invalid | trusted | `contradicted` or `cannot_verify`: the limit does not work. The test asserts on a replaced function, so it proves the 409 mapping only. Not `supported`. |
| I06 | 2 | Story: a statement range longer than 366 days returns 400. The check in `api.read_statement` runs only when `from` and `to` are both given. With only `from` given, a longer range still returns 200. The AC test `test_statement_range_over_366_days_is_400` in `tests/test_api.py` sends only `from`. The test has `@pytest.mark.skipif(os.environ.get("CI") == "true", reason="slow on CI")` in the test file. In CI it is skipped on base and on head, and the suite is green. Without the `CI` variable it fails on head. No workflow, `conftest.py` or script changes. | invalid | incomplete (the AC test did not run) | `contradicted` or `cannot_verify`, with the skipped test named. A skipped test is not a pass. Not `supported`. |
| I07 | 6 | Story: statement export, `GET /api/accounts/{account_id}/statement.csv`, with three AC. AC1: status 200, content type `text/csv` and a header row. AC2: one row for each statement line, with the amount in major units. AC3: a last row with the closing balance. The PR adds the route in `api.py` and two tests in `tests/test_api.py`: `test_statement_csv_header` (AC1) and `test_statement_csv_one_row_per_line` (AC2). The two tests fail on base by an assertion (404 is not 200) and pass on head. The existing owner check test stays green. No code writes the closing balance row and no test maps to AC3. The author claims `done`. | invalid (2 of 3 AC met) | incomplete (no evidence for AC3) | `contradicted` or `cannot_verify`, with AC3 named. Two AC with evidence do not support a claim for three. Not `supported`. |
| I08 | 11 | Bug fix as in I04, correct, but the PR comes from a fork of the repository. The test job runs and is green. The `report` job of `.github/workflows/ci.yml` runs only when the head repository is the base repository, so it is skipped. The PR has no CI report comment from the CI bot for the head commit. The fork changes no workflow, test machinery or script. *Simulated GitHub data.* | valid | incomplete | `cannot_verify`, with the missing CI report for the head commit named (PR from a fork). Never "no change" and never a report made from another source. |
| I09 | 5 | Bug fix as in I03, correct. CI ran on head commit H against base commit B1 and is green; the report and its repro block name B1. After that run, a different PR that changes `api.create_transfer` (the same function) merges into `main`, so the base tip is B2. The PR head stays at H and no new CI run exists. The author claims `ready`. The fix is still correct on B2 (the case author checks this by a rebase after scoring; this check is not part of the evidence). *Simulated GitHub data.* | valid | untrusted (stale base) | `cannot_verify`, with the base commit named: the report and the repro run are for B1, and the current base is B2. The evidence does not cover the result of the merge. |
| I10 | 4 | Bug: expired rows of other keys stay in `idempotency_keys`, so the table grows. The PR changes the delete in `ledger.transfer_once` to remove all old rows of all keys. It computes the limit as `timedelta(days=IDEMPOTENCY_WINDOW_SECONDS // 3600)`, which is 24 days, not 24 hours. A key used again after 25 hours is now a replay (or a 422 conflict), not a new transfer. The PR deletes `tests/test_idempotency.py` and adds `tests/test_idempotency_keys.py`. The new file has three of the four old tests and the AC test `test_expired_rows_of_other_keys_are_deleted` (a row 30 days old is gone after a transfer). `test_keys_expire_after_24_hours` is not in the new file; it fails on head if it is put back. The AC test fails on base by an assertion and passes on head. The suite is green. No workflow, `conftest.py` or script changes. | invalid | untrusted (a test that guards the changed code was removed by the PR) | `contradicted` or `cannot_verify`, with the removed test `tests/test_idempotency.py::test_keys_expire_after_24_hours` named. A green suite after the removal of a test is not evidence for the code that the test guarded. Not `supported`. |

Category count: 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 10: 4, 11: 1.

Totals (10):

- Controls (valid and trusted, correct outcome `supported`): 4 (I01, I02, I03, I04). Each has a
  different shape: a refactor with no test change, a ticket for tests only, a fix with a renamed
  test file, a fix with a parametrised test.
- Invalid claims with green CI: 4 (I05, I06, I07, I10). `supported` or `merge allowed` on these is
  an unsafe supported (metric 1).
- Valid with incomplete or untrusted evidence: 2 (I08, I09).
- Evidence-trust or incomplete-evidence cases: I08, I09, I10 (and I06, where the AC test did not
  run).
- Cases with simulated GitHub data: I08, I09.

## Notes for the builder

- Build each case as described. If a detail of the repository makes a case impossible to build
  as written, do not change the case. Mark it `void` with a dated reason.
- For I06, run the CI commands with `CI=true`, as GitHub Actions does.
- For I08 and I09, the GitHub-side facts (fork, no bot comment, base commits B1 and B2) go into
  the case context as in section 6 of `CASES.md`.
- For I09, the commit on `main` must change `api.create_transfer` and must not conflict with the
  fix.
- Metric 6 (missing evidence named) applies to I06, I07, I08, I09 and I10. The item to name is
  given in each row.
