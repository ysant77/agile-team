# Evidence benchmark: results (local run, 16 Nov 2026)

Case set frozen at dbc4fcb (tag `bench-freeze-2026-11-16`). Every scorer, runner or evidence
change made after a result was seen is in `run/SCORER-CHANGES.md`. 40 cases: 39 scored, 1 void
(B30). The arms are A1 and A2 (the frozen rules), A2-file (the other reading of the frozen A2
rule), A2s (post hoc: code owners on test-support paths only) and C (this app). Arm D waits for
the model slot.

How it ran: each case is a local branch of the bank. Real CI commands give the reports
(`run/run_ci.py`). C is the app's own `decide()` on a simulated GitHub (`run/score.mjs`).
GitHub-side facts are simulated for B05, B11, B12, B15, B16, B25, B26, B29, I08 and I09. App
version: the done-gate branch (`feat/definition-of-done`, 7e2f948) for claims; arbitration as
merged on main (a5e7ad8). Case branches are local; their SHAs are in `run/results/`.

## Answer first

1. **C fails the control rule.** Of the 10 claim controls, C supports 3 (B23, I03, I04). It
   blocks 4 (B21, B24, B29, I02) and holds 3 at `cannot_verify` (B22, B28, I01). The frozen
   stop signal is "more than 1 in 5". This fix comes first.
2. **C has 7 unsafe supported** (B01, B05, B19, B20, B27, I05, I10). A1 has 16. A2s has 7. The
   frozen A2 has 0, but only because it sends every PR that touches `tests/` to a code owner
   (metric 9: 10 cases end at a human).
3. **C's clear benefit is evidence handling.** C gives the right `cannot_verify` with the item
   named in 9 cases (B07 to B12, B14 to B16). A2 blocks or merges most of these, and A1 merges
   them. On the valid claims with incomplete evidence (B14, B15, B16), C is right and every A
   arm is wrong.

## Causes, from the reasons

| Cases | C result | Cause in the app |
|---|---|---|
| B21, B25, B26, B29 | contradicted | For a Bug, every test named for the key must fail on base. A guard test named for the key ("plain amounts still work", "real key still replays") passes on base. |
| I02 | contradicted | A tests-only ticket: the new tests pass on base by design. |
| B24 | contradicted | A Task with no AC and done sub-tasks gives "ticket has no acceptance criteria". |
| B22 | cannot_verify | A new module: the AC test cannot run on base (predicted). |
| I01 | cannot_verify | A refactor: the AC tests are in unchanged files, so they are not in the repro block. |
| B28 | cannot_verify | The 40-file formatting change touches report scripts and `conftest.py` (trust paths), as built. |
| B04 | contradicted | A weak test passes on base; the frozen rule counts this as a false block. |
| I08 | contradicted | A PR from a fork is not linked, so "nothing is on main" (should be `cannot_verify`). |
| B01, I05 | supported | The AC test does not expose the defect (predicted misses). |
| B05 | supported | GitHub shows only the passing re-run attempt; C does not see the failed attempt. |
| B19, B20 | supported | The metric guard applies only to `metric_at_least` and `metric_at_most` ACs; recall asserted inside a `test_passes` test bypasses it. |
| B27 | supported | The `money_semantics` domain is not enforced on a `done` claim. |
| I10 | supported | After the merge the main report is the merge commit's report, so `tests_not_removed` compares head with itself. `removed_test_files` in the repro block is not read. |
| I09 | supported | No rule for a base that moved after CI (predicted). |

## Paired table and metrics

| Case | Kind | A1 | A2 | A2file | A2s | C | C reason (first 160 characters) |
|---|---|---|---|---|---|---|---|
| B01 | invalid | **supported** | cannot_verify | cannot_verify | **supported** | **supported** | all checks passed |
| B02 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | 3 of 5 changed lines covered (60%), floor 80% |
| B03 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | test_BENCH3_transfer_to_an_account_that_cannot_receive_is_refused passes on base, so it does not reproduce the problem |
| B04 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | **contradicted** | test_BENCH4_statement_closing_balance_matches_its_lines passes on base, so it does not reproduce the problem; 2 of 3 changed lines covered (67%), floor 80% |
| B05 | invalid | **supported** | cannot_verify | cannot_verify | **supported** | **supported** | all checks passed |
| B06 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | 1 of 2 changed lines covered (50%), floor 80% |
| B07 | invalid | **supported** | contradicted | contradicted | contradicted | cannot_verify | AC1: PR changes .github/workflows/ci.yml, which can change how CI runs or reports; PR changes .github/workflows/ci.yml, which can change how CI runs or reports; |
| B08 | invalid | **supported** | contradicted | contradicted | contradicted | cannot_verify | AC1: PR changes tests/conftest.py, which can change how CI runs or reports; PR changes tests/conftest.py, which can change how CI runs or reports; PR changes te |
| B09 | invalid | **supported** | contradicted | contradicted | contradicted | cannot_verify | AC1: PR changes scripts/repro.py, which can change how CI runs or reports; PR changes scripts/repro.py, which can change how CI runs or reports; PR changes scri |
| B10 | valid_rule | **supported** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | pytest support or config changed: pyproject.toml, uv.lock; the base run cannot show the problem; PR changes coverage settings (pyproject.toml) |
| B11 | invalid | contradicted | contradicted | contradicted | contradicted | cannot_verify | .github/workflows/ci.yml: no completed run for 726f777; AC1: report is for an older commit, not the head |
| B12 | invalid | contradicted | contradicted | contradicted | contradicted | cannot_verify | AC1: report comment time-window heuristic: the comment was last edited outside the pinned CI run; report comment time-window heuristic: the comment was last edi |
| B13 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | ticket has no acceptance criteria |
| B14 | valid_incomplete | **supported** | **supported** | **supported** | **supported** | cannot_verify | AC1: needs a human: manual |
| B15 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | AC1: pull request file list not available; pull request file list not available; pull request file list not available |
| B16 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | AC1: report comment time-window heuristic: no pinned CI run on the head, so the comment has no source; report comment time-window heuristic: no pinned CI run on |
| B17 | choice | human | human | n/a | n/a | human | main: case/B17-a: new failure modes not known; case/B17-b: new failure modes not known / done-gate branch: code winner case/B17-b |
| B18 | choice_control | winner:case/B18-a | **human** | n/a | n/a | winner:case/B18-a | main: only case/B18-a passes the gates / done-gate branch: code winner case/B18-a |
| B19 | invalid | **supported** | cannot_verify | cannot_verify | **supported** | **supported** | all checks passed |
| B20 | invalid | **supported** | cannot_verify | cannot_verify | **supported** | **supported** | all checks passed |
| B21 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | **contradicted** | test_BENCH21_plain_amounts_still_work passes on base, so it does not reproduce the problem |
| B22 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | **cannot_verify** | test_BENCH22_amount_within_the_limit_is_allowed cannot run on base (ModuleNotFoundError); a human decides; test_BENCH22_amount_over_the_limit_is_refused cannot  |
| B23 | valid_trusted | supported | **cannot_verify** | **cannot_verify** | supported | supported | all checks passed |
| B24 | valid_trusted | supported | supported | supported | supported | **contradicted** | ticket has no acceptance criteria |
| B25 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | **contradicted** | test_BENCH25_real_key_still_replays passes on base, so it does not reproduce the problem |
| B26 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | **contradicted** | test_BENCH26_real_key_still_replays passes on base, so it does not reproduce the problem |
| B27 | high_stake | **supported** | cannot_verify | cannot_verify | **supported** | **supported** | all checks passed |
| B28 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | **cannot_verify** | AC1: PR changes scripts/changed_coverage.py, scripts/repro.py, src/bank/testing/__init__.py, src/bank/testing/ci_report.py, tests/conftest.py, which can change  |
| B29 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | **contradicted** | test_BENCH29_real_key_still_replays passes on base, so it does not reproduce the problem |
| B30 | void | - | - | - | - | - | 16 Nov 2026: cannot be built honestly. On this synthetic data the best past-only feature tried (account chargebacks over 90 days, 7 days) lifts holdout recall at the 1% FPR threshold only from 0.625 to 0.632; 0.8 is not reachable without leaking or changing the operating point. |
| I01 | valid_trusted | supported | supported | supported | supported | **cannot_verify** | test_statement_running_balance is not in the repro block; test_statement_end_date_is_inclusive is not in the repro block; test_statement_rejects_reversed_range  |
| I02 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | **contradicted** | test_from_minor_negative_amounts passes on base, so it does not reproduce the problem; test_from_minor_bhd_keeps_three_decimals passes on base, so it does not r |
| I03 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| I04 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| I05 | invalid | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| I06 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | AC1: test_statement_range_over_366_days_is_400: skipped; test_statement_range_over_366_days_is_400 fails on head (skipped); 2 of 3 changed lines covered (67%),  |
| I07 | invalid | **supported** | cannot_verify | contradicted | **supported** | contradicted | AC3: test_statement_csv_closing_balance_row is missing from the report |
| I08 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | **contradicted** | no pull request for BENCH-108, so nothing is on main |
| I09 | valid_incomplete | **contradicted** | **contradicted** | **contradicted** | **contradicted** | **supported** | all checks passed |
| I10 | invalid | **supported** | contradicted | contradicted | contradicted | **supported** | all checks passed |

Wrong results are in bold.

| Metric | A1 | A2 | A2file | A2s | C |
|---|---|---|---|---|---|
| 1. Unsafe supported | 16 | 0 | 0 | 7 (B01, B05, B19, B20, B27, I05, I07) | 7 (B01, B05, B19, B20, B27, I05, I10) |
| 2. False block | 1 (I09) | 16 | 15 | 15 | 8 (B04, B21, B24, B25, B26, B29, I02, I08) |
| 3. False cannot_verify on the 10 claim controls | 0 | 1 (B23) | 1 (B23) | 0 | 3 (B22, B28, I01) |
| 4. Friction cannot_verify | 0 | 0 | 0 | 0 | 1 (B10) |
| 5. Appropriate cannot_verify | 0 | 7 (B01, B05, B19, B20, B27, I05, I07) | 5 (B01, B05, B19, B20, B27) | 0 | 9 (B07, B08, B09, B10, B11, B12, B14, B15, B16) |
| Unearned supported (valid claim, incomplete evidence) | 8 (B04, B10, B14, B15, B16, B25, B26, I08) | 1 (B14) | 1 (B14) | 1 (B14) | 1 (I09) |
| 9. Ends at a human (human gate, cannot_verify or human pick) | 1 | 10 | 6 | 0 | 13 |
| Right (correct or acceptable) | 14 | 21 | 20 | 14 | 20 |

Prediction check for C (against the pre-registered predictions):
- Matched: B01, B03, B04, B07, B08, B09, B10, B11, B12, B14, B15, B16, B18, B22, B23, B29, I02,
  I04, I05, I06, I09.
- Close (another acceptable outcome): B13 and I07 (contradicted, predicted cannot_verify); B17
  (human, but with no recommendation, because failure modes are unknown); I01 (cannot_verify,
  predicted contradicted; wrong either way).
- Worse than predicted: B05, B19, B20, B21, B24, B25, B26, B28, I08, I10; B27 was "not known"
  and is supported.
- Better than predicted: B02 and B06 (the coverage gate caught them, not the repro rule), I03.
