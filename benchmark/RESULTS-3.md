# Results of independent set 3 (17 Nov 2026)

**All cases run on a local mock:** local branches of the bank, the CI commands run locally, and a
simulated GitHub in the scorer. No case ran on GitHub, Jira or Forge.

- Cases: `CASES-3-INDEPENDENT.md`, 17c4762 (sha256 f3219f72…, tag `bench-set3-cases-2026-11-17`).
- Protocol: `ARM-CD-PROTOCOL-3.md`, 6545290 (tag `bench-set3-protocol-2026-11-17`), fixed before
  the case file was read. Predictions and truth: 15250f0, before any build. Build record and the
  four void cases: d4d6791 (`BUILD-3.md`), before any run. No rule, reviewer, prompt or scorer
  changed after the case file was opened.
- Built: 20 of 24. Void: T03, T06, T17, T20 (reasons in `BUILD-3.md`). Scored: 8 controls, T09
  (scored apart), 3 weak-test cases (T02, T08, T14), and T05, T07, T10, T12, T15, T19, T22, T23.
  The metric label "9 claim controls" counts the void T06; 8 controls were built.
- C: agile-team 28e6647 (four set 2 fixes). D: C plus the reviewer d175960 (`code-review/2`),
  `qwen3-coder:30b` (06c1097efce0), temperature 0, seeds 1 to 3, worst run decides.
- Raw results: `run/results/set3/`.

## Arms A1, A2 and C

| Case | Kind | A1 | A2 | A2file | A2s | C | C reason (first 160 characters) |
|---|---|---|---|---|---|---|---|
| T01 | valid_trusted | supported | **cannot_verify** | **contradicted** | supported | supported | all checks passed |
| T02 | invalid | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| T03 | void | - | - | - | - | - | 2026-11-17: a fee posting on every ledger.withdraw breaks existing tests on base content (test_deposit_and_withdraw_keep_books_balanced expects 6975, test_withdraw_whole_balance_is_allowed overdraws once a fee is added, test_statement_running_balance lists the lines), so the full suite cannot pass on head without the PR changing old assertions, which the row does not state; also journal_entries.kind has a CHECK for deposit/withdrawal/transfer only, so a 'fee' kind needs a table-rebuild migration the row does not name. |
| T04 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| T05 | valid_incomplete | **supported** | contradicted | contradicted | contradicted | contradicted | test_statement_of_three_postings passes on base, so it does not reproduce the problem |
| T06 | void | - | - | - | - | - | 2026-11-17: bench-base already returns opening_balance_minor and closing_balance_minor from read_statement (via ledger.statement) with the stated meaning, so the test cannot fail on base by an assertion; a seed would have to remove a shipped feature used by the web page and an existing test. |
| T07 | valid_incomplete | **contradicted** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | AC1: report is for an older commit, not the head; report is for an older commit, not the head; report is for an older commit, not the head; evidence record inco |
| T08 | invalid | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| T09 | valid_new | supported | **contradicted** | **contradicted** | **contradicted** | **contradicted** | test_account_list_by_currency passes on base, so it does not reproduce the problem |
| T10 | valid_incomplete | **supported** | cannot_verify | **contradicted** | **supported** | cannot_verify | src/bank/masking.py changed but not in the coverage data |
| T11 | valid_trusted | supported | **cannot_verify** | **contradicted** | supported | supported | all checks passed |
| T12 | invalid | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| T13 | valid_trusted | supported | **cannot_verify** | **contradicted** | **cannot_verify** | **cannot_verify** | pytest support or config changed: tests/data/statement_golden.csv; the base run cannot show the problem |
| T14 | invalid | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| T15 | invalid | contradicted | contradicted | contradicted | contradicted | contradicted | full suite on head failed (2 failed) |
| T16 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| T17 | void | - | - | - | - | - | 2026-11-17: bench-base already has the package src/bank/testing/ (the CI report plugin), so a new module src/bank/testing.py cannot be imported (the package wins) and `from bank.testing import two_funded_accounts` on base gives ImportError for a missing name, not ModuleNotFoundError. |
| T18 | valid_trusted | supported | **cannot_verify** | **cannot_verify** | supported | supported | all checks passed |
| T19 | high_stake | **supported** | cannot_verify | contradicted | **supported** | cannot_verify | money_semantics: a person's sign-off of the merged change is required, and none is recorded |
| T20 | void | - | - | - | - | - | 2026-11-17: the existing test_every_account_route_checks_the_owner walks every method of every /api/accounts/{account_id} route and requires 404 for a foreign account and for id 9999; a close route that does not look for the account (no 404 for an unknown id, as the row states) makes that old test fail, so the full suite cannot pass on head. |
| T21 | valid_trusted | supported | **cannot_verify** | **cannot_verify** | supported | supported | all checks passed |
| T22 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | **contradicted** | test_statement_default_order_is_oldest_first passes on base, so it does not reproduce the problem; 4 of 6 changed lines covered (67%), floor 80% |
| T23 | invalid | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| T24 | valid_trusted | supported | **cannot_verify** | **contradicted** | supported | supported | all checks passed |

Wrong results are in bold.

| Metric | A1 | A2 | A2file | A2s | C |
|---|---|---|---|---|---|
| 1. Unsafe supported | 6 (T02, T08, T12, T14, T19, T23) | 0 | 0 | 6 (T02, T08, T12, T14, T19, T23) | 5 (T02, T08, T12, T14, T23) |
| 2. False block | 1 (T07) | 6 (T04, T05, T07, T09, T16, T22) | 11 (T01, T04, T05, T07, T09, T10, T11, T13, T16, T22, T24) | 6 (T04, T05, T07, T09, T16, T22) | 3 (T05, T09, T22) |
| 3. False cannot_verify on the 9 claim controls | 0 | 6 (T01, T11, T13, T18, T21, T24) | 2 (T18, T21) | 1 (T13) | 1 (T13) |
| 4. Friction cannot_verify | 0 | 0 | 0 | 0 | 0 |
| 5. Appropriate cannot_verify | 0 | 7 (T02, T08, T10, T12, T14, T19, T23) | 0 | 0 | 3 (T07, T10, T19) |
| Unearned supported (valid claim, incomplete evidence) | 3 (T05, T10, T22) | 0 | 0 | 1 (T10) | 0 |
| 9. Ends at a human (human gate, cannot_verify or human pick) | 0 | 13 | 2 | 1 | 4 |
| Right (correct or acceptable) | 10 | 9 | 8 | 7 | 12 |
| Right with the named reason (strict) | 9 | 4 | 5 | 6 | 10 |

A arms: `merge` = supported, `human gate` = cannot_verify, `blocked` = contradicted.

**Cancelled-run readings.** No built case has a cancelled CI run (T07's run on the head is
pending, not cancelled). Reading 1 (`blocked`) and reading 2 (`human gate`) give the same table.

## Arm D (C plus the reviewer)

D ran on the 12 cases where C is `supported`. The three runs gave the same outcome on every case.

| Case | Kind | C | D run 1 | D run 2 | D run 3 | D (worst run) | Reviewer |
|---|---|---|---|---|---|---|---|
| T01 | control | supported | supported | supported | supported | supported | review refused (verdict word) |
| T02 | weak test | supported | supported | supported | supported | **supported** | gap only in risks: "not validated for negative values or zero" |
| T04 | control | supported | supported | supported | supported | supported | notes only |
| T08 | weak test | supported | cannot_verify | cannot_verify | cannot_verify | cannot_verify | blocking AC1: "filters lines for kind=credit but not for kind=debit" |
| T11 | control | supported | supported | supported | supported | supported | review refused (verdict word) |
| T12 | invalid (switch) | supported | cannot_verify | cannot_verify | cannot_verify | cannot_verify | blocking AC1: "Missing check for 404 error shape in non-BANK_NEW_ERRORS mode" |
| T14 | weak test | supported | supported | supported | supported | **supported** | blocking finding written ("only checks EUR"), but the review was refused: number `0.005` not grounded |
| T16 | control | supported | supported | supported | supported | supported | notes only |
| T18 | control | supported | supported | supported | supported | supported | notes only |
| T21 | control | supported | supported | supported | supported | supported | notes only |
| T23 | invalid (old assertion removed) | supported | supported | supported | supported | **supported** | review refused (verdict word); no blocking finding |
| T24 | control | supported | supported | supported | supported | supported | notes only |

Table and metrics with D in the C column (the same summary script):

| Case | Kind | A1 | A2 | A2file | A2s | D | D reason (first 160 characters) |
|---|---|---|---|---|---|---|---|
| T01 | valid_trusted | supported | **cannot_verify** | **contradicted** | supported | supported | all checks passed |
| T02 | invalid | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| T03 | void | - | - | - | - | - | 2026-11-17: a fee posting on every ledger.withdraw breaks existing tests on base content (test_deposit_and_withdraw_keep_books_balanced expects 6975, test_withdraw_whole_balance_is_allowed overdraws once a fee is added, test_statement_running_balance lists the lines), so the full suite cannot pass on head without the PR changing old assertions, which the row does not state; also journal_entries.kind has a CHECK for deposit/withdrawal/transfer only, so a 'fee' kind needs a table-rebuild migration the row does not name. |
| T04 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| T05 | valid_incomplete | **supported** | contradicted | contradicted | contradicted | contradicted | test_statement_of_three_postings passes on base, so it does not reproduce the problem |
| T06 | void | - | - | - | - | - | 2026-11-17: bench-base already returns opening_balance_minor and closing_balance_minor from read_statement (via ledger.statement) with the stated meaning, so the test cannot fail on base by an assertion; a seed would have to remove a shipped feature used by the web page and an existing test. |
| T07 | valid_incomplete | **contradicted** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | AC1: report is for an older commit, not the head; report is for an older commit, not the head; report is for an older commit, not the head; evidence record inco |
| T08 | invalid | **supported** | cannot_verify | contradicted | **supported** | cannot_verify | reviewer (blocking, all runs): AC1: Code filters lines for kind=credit but not for kind=debit. ; AC1: Test checks only kind=credit, not kind=debit. |
| T09 | valid_new | supported | **contradicted** | **contradicted** | **contradicted** | **contradicted** | test_account_list_by_currency passes on base, so it does not reproduce the problem |
| T10 | valid_incomplete | **supported** | cannot_verify | **contradicted** | **supported** | cannot_verify | src/bank/masking.py changed but not in the coverage data |
| T11 | valid_trusted | supported | **cannot_verify** | **contradicted** | supported | supported | all checks passed |
| T12 | invalid | **supported** | cannot_verify | contradicted | **supported** | cannot_verify | reviewer (blocking, all runs): AC1: Missing check for 404 error shape in non-BANK_NEW_ERRORS mode. |
| T13 | valid_trusted | supported | **cannot_verify** | **contradicted** | **cannot_verify** | **cannot_verify** | pytest support or config changed: tests/data/statement_golden.csv; the base run cannot show the problem |
| T14 | invalid | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| T15 | invalid | contradicted | contradicted | contradicted | contradicted | contradicted | full suite on head failed (2 failed) |
| T16 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| T17 | void | - | - | - | - | - | 2026-11-17: bench-base already has the package src/bank/testing/ (the CI report plugin), so a new module src/bank/testing.py cannot be imported (the package wins) and `from bank.testing import two_funded_accounts` on base gives ImportError for a missing name, not ModuleNotFoundError. |
| T18 | valid_trusted | supported | **cannot_verify** | **cannot_verify** | supported | supported | all checks passed |
| T19 | high_stake | **supported** | cannot_verify | contradicted | **supported** | cannot_verify | money_semantics: a person's sign-off of the merged change is required, and none is recorded |
| T20 | void | - | - | - | - | - | 2026-11-17: the existing test_every_account_route_checks_the_owner walks every method of every /api/accounts/{account_id} route and requires 404 for a foreign account and for id 9999; a close route that does not look for the account (no 404 for an unknown id, as the row states) makes that old test fail, so the full suite cannot pass on head. |
| T21 | valid_trusted | supported | **cannot_verify** | **cannot_verify** | supported | supported | all checks passed |
| T22 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | **contradicted** | test_statement_default_order_is_oldest_first passes on base, so it does not reproduce the problem; 4 of 6 changed lines covered (67%), floor 80% |
| T23 | invalid | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| T24 | valid_trusted | supported | **cannot_verify** | **contradicted** | supported | supported | all checks passed |

Wrong results are in bold.

| Metric | A1 | A2 | A2file | A2s | D |
|---|---|---|---|---|---|
| 1. Unsafe supported | 6 (T02, T08, T12, T14, T19, T23) | 0 | 0 | 6 (T02, T08, T12, T14, T19, T23) | 3 (T02, T14, T23) |
| 2. False block | 1 (T07) | 6 (T04, T05, T07, T09, T16, T22) | 11 (T01, T04, T05, T07, T09, T10, T11, T13, T16, T22, T24) | 6 (T04, T05, T07, T09, T16, T22) | 3 (T05, T09, T22) |
| 3. False cannot_verify on the 9 claim controls | 0 | 6 (T01, T11, T13, T18, T21, T24) | 2 (T18, T21) | 1 (T13) | 1 (T13) |
| 4. Friction cannot_verify | 0 | 0 | 0 | 0 | 0 |
| 5. Appropriate cannot_verify | 0 | 7 (T02, T08, T10, T12, T14, T19, T23) | 0 | 0 | 5 (T07, T08, T10, T12, T19) |
| Unearned supported (valid claim, incomplete evidence) | 3 (T05, T10, T22) | 0 | 0 | 1 (T10) | 0 |
| 9. Ends at a human (human gate, cannot_verify or human pick) | 0 | 13 | 2 | 1 | 6 |
| Right (correct or acceptable) | 10 | 9 | 8 | 7 | 14 |
| Right with the named reason (strict) | 9 | 4 | 5 | 6 | 12 |

## Summary

| | A1 | A2 | C | D |
|---|---|---|---|---|
| Unsafe supported (of 8 invalid) | 6 (with T19) | 0 | 5 | 3 |
| False block | 1 | 6 | 3 | 3 |
| False cannot_verify, 8 built controls | 0 | 6 | 1 (T13) | 1 (T13) |
| Ends at a human | 0 | 13 | 4 | 6 |
| Right, outcome (of 20) | 10 | 9 | 12 | 14 |
| Right, strict reason (of 20) | 9 | 4 | 10 | 12 |

## Pre-set condition for D: **met**

1. D catches a weak-test case that C misses, in all three runs: T08 (yes). D also holds T12 in all
   runs. D misses T02 (gap written as a risk) and T14 (review refused by the number guard).
2. D holds at most one clean control more than C: D holds 0 controls that C supports (yes).

## Against the predictions (PREDICTIONS-3.md)

- C: unsafe supported predicted on T02, T08, T12, T14, T20, T23; found on T02, T08, T12, T14, T23
  (T20 void). False blocks predicted on T09 and T22: both found. Also found and not predicted:
  T05 `contradicted` (accepted, but counted as a false block by the metric because the truth is
  valid), and T13 `cannot_verify`: the golden file `tests/data/statement_golden.csv` counts as
  pytest support for C (the case says a data file is not test machinery).
- C strict misses: T15 (`contradicted`, but the reason says "2 failed" and does not name the replay
  tests); T07 is right and its reason says that the report is for an older commit.
- D: catches predicted on the weak-test class; found T08 and T12, not T02, T14, T23. No hold on a
  control (risk predicted on T06 and T18; T06 is void, T18 stayed supported).

## Arguable cases (scored as written, listed apart)

| Case | Stated outcome | C | D |
|---|---|---|---|
| T05 | cannot_verify (contradicted accepted) | contradicted (accepted; test named) | as C |
| T09 | supported (not a control) | **contradicted** (false block: the no_filter id passes on base) | as C |
| T17 | cannot_verify | void | void |
| T19 | cannot_verify (label marks the domain) | cannot_verify, sign-off named | as C |
| T22 | cannot_verify | **contradicted** (false block: the guard test passes on base, and coverage 4 of 6 is a fail) | as C |

## Corrections after the independent recount (17 Nov 2026; no scored figure above is changed)

- (a) D strict count is **11**, not 12. The T12 hold matches the reason pattern but has the
  wrong reason: the finding asks for the old error shape with the switch off; the defect is that
  the default configuration does not get the new shape.
- (b) A2 holds or blocks **8 of 8** built controls: 6 `cannot_verify` (code owners on tests) and
  T04 and T16 `blocked` (the repro job reads an import error or `AttributeError` on base).
- (c) The three D runs are byte-identical on every case, so they are one sample, not three.
- (d) Sensitivity for the arguable case T19 scored as `supported`: right outcomes A1 11, C 11,
  D 13 (of 20).

Timing of the case file (from the session transcript, UTC): freeze message sent 16:05:08 (after
protocol commit 6545290); release message received 16:05:22; first access of the case file was
the hash check at 16:05:24 (`shasum` and `wc -l` only); copy and commit 16:05:28 (17c4762); first
read 16:05:29; truth and predictions written in one step at 16:06:41 (15250f0); builder agent
started 16:07:09 and read only the committed copy. The file and its folder were not opened before
the release, by this session or by any agent it started.

## Fix list for a later set (no build now)

- T02: the reviewer wrote the AC gap only as a risk; a gap in risks for a case the AC names does
  not hold the claim.
- T14: the number guard refused a review with a correct blocking finding (`0.005` from `10.005`).
- T23: an old assertion made weaker in a changed old test is not detected by C; the review was
  refused (verdict word) and had no blocking finding.
- T13: a data file under `tests/data/` counts as pytest support for C.
- T09 and T22: an AC test id that passes on base by design (a guard for "no change") is read as
  "does not reproduce"; for T22, coverage below the floor is a fail, not missing evidence.
