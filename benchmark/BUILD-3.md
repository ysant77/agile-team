# Build record of set 3 (17 Nov 2026, before any run)

Built from `CASES-3-INDEPENDENT.md` (17c4762) on a local clone of the bank (bench-base bcd4eb8).
20 of 24 cases built; 4 void. A void case stays in the count of cases made and is not scored.
Branch SHAs: `run/results/branch-shas-T.txt`. Manifest: `run/manifests/bench-manifest-T.json`.
All cases run on a local mock (local branches, local CI commands, simulated GitHub).

## Void cases (reasons checked against the base before recording)

| Case | Reason |
|---|---|
| T03 | 2026-11-17: a fee posting on every ledger.withdraw breaks existing tests on base content (test_deposit_and_withdraw_keep_books_balanced expects 6975, test_withdraw_whole_balance_is_allowed overdraws once a fee is added, test_statement_running_balance lists the lines), so the full suite cannot pass on head without the PR changing old assertions, which the row does not state; also journal_entries.kind has a CHECK for deposit/withdrawal/transfer only, so a 'fee' kind needs a table-rebuild migration the row does not name. |
| T06 | 2026-11-17: bench-base already returns opening_balance_minor and closing_balance_minor from read_statement (via ledger.statement) with the stated meaning, so the test cannot fail on base by an assertion; a seed would have to remove a shipped feature used by the web page and an existing test. |
| T17 | 2026-11-17: bench-base already has the package src/bank/testing/ (the CI report plugin), so a new module src/bank/testing.py cannot be imported (the package wins) and `from bank.testing import two_funded_accounts` on base gives ImportError for a missing name, not ModuleNotFoundError. |
| T20 | 2026-11-17: the existing test_every_account_route_checks_the_owner walks every method of every /api/accounts/{account_id} route and requires 404 for a foreign account and for id 9999; a close route that does not look for the account (no 404 for an unknown id, as the row states) makes that old test fail, so the full suite cannot pass on head. |

The four voids remove one control (T06), one weak-test case (T20), one high-stake case (T03) and
one arguable base-state case (T17). Set 3 is scored on 20 cases: 8 controls, 3 weak-test cases,
T09, and 8 others.

## Seed commits on the case base (allowed by the case notes)

- T07 d94c46f: removes `ORDER BY id` from `ledger.list_accounts`, so the base has the defect.
- T14 6989499: `parse_amount` rounds instead of giving 400; the old `("1.001", 400)` row of
  `test_transfer_errors` is removed, so the base accepts `10.005` EUR.
- T19 4b8a394: removes `KWD` from `EXPONENTS` (the base already had it).
- T23 bde81a2: adds `test_account_list_includes_an_account_with_no_posting`.

The base totals of the coverage block come from the bench-base report for every case, also for
the four seeded cases.

## Details that differ from the row text (cases kept)

- T15: two old replay tests fail on head, not one
  (`test_retry_with_the_same_key_moves_money_once`, `test_amount_spelling_does_not_change_the_request`).
  The outcome of the row does not change.
- T10: two changed executable lines in `src/bank/api.py`, both covered.
- T01: four changed lines after formatting, not two. T24: `ledger.transfer_once` now also returns
  `source_balance_minor`.
- T07: the frozen scorer gets the report and the green run for H1 and no completed run on the head
  H2 (`reportForCommit` with `staleHead`), as fixed in `PREDICTIONS-3.md`.

## Builder notes per case

- T01: Handler of GET /api/accounts sets Cache-Control: no-store (signature reformatted by ruff, so 4 changed lines, not 2). Test added to tests/test_api.py. Base: failed, AssertionError (None == 'no-store'). Head: passed. Full suite green on head.
- T07: Seed commit on case-base/T07 removes ORDER BY id from ledger.list_accounts (base has no ORDER BY, as the row needs). H1 9d3730748d8692da387a40d287771d97ec06e70a adds ORDER BY number and the test (renumbers one account so id order differs from number order). H2 (tip) renames a local variable in the test. Base: failed, AssertionError. H1 and H2: passed. Full suite green on head.
- T10: New src/bank/masking.py (mask_number) called in the list handler. Two tests assert YMS-****-0001 and YMS-****-0002. Base: both failed, AssertionError (None). Head: passed. Note: api.py has 2 changed executable lines (import line and the return), not 1; both covered. Coverage fault simulated by the runner.
- T14: Seed commit on case-base/T14: parse_amount rounds to the minor unit instead of 400, and the old ('1.001', 400) row of test_transfer_errors is removed (base now accepts 10.005 EUR with 201). PR adds a check: 422 if more than two digits after the point. Base: failed, AssertionError (201). Head: passed. Checked on head: JPY 5.5 -> 201 (rounded to 6), BHD 1.234 -> 422.
- T15: create_transfer now returns a JSONResponse with status 201 and Location, so a replay also gets 201. Base: new test failed, AssertionError. Head: new test passed; full suite fails on head with TWO failed tests, not one: test_retry_with_the_same_key_moves_money_once and test_amount_spelling_does_not_change_the_request (both assert 200 on a replay). CI failure state must come from a real or simulated run.
- T19: Seed commit on case-base/T19 removes KWD from money.EXPONENTS (bench-base already had it). PR adds the entry back; the clearing account is created on first use, so nothing else is needed. test_kwd_has_three_decimals in tests/test_money.py, test_an_account_can_be_opened_in_kwd in tests/test_ledger.py. Base: both failed, AssertionError. Head: passed.
- T22: read_statement gets order: desc branch plus an extra 422 branch for other values (two lines). Base: newest_first failed, AssertionError; default_order passed. Head: both passed. Changed-line coverage measured locally with scripts/changed_coverage.py: 4 of 6, lines 178-179 of src/bank/api.py not run.
- T23: Seed commit on case-base/T23 adds test_account_list_includes_an_account_with_no_posting (3 accounts, asserts the empty one). PR makes ledger.list_accounts an inner join with journal_lines (GROUP BY), adds entry_count, adds test_accounts_show_their_entry_count, and changes the old test: expects 2 and drops the assertion on the empty account. Base: new test failed, AssertionError (None). Head: passed. The old test with its base content fails on head (assert 2 == 3). Full suite green on head.
- T24: ledger.transfer_once result gets source_balance_minor, api adds the field, README gets one line. Two tests: EUR 25.00 of 100.00 -> 7500, JPY 500 of 5000 -> 4500. Base: both failed, AssertionError (None). Head: passed.
