# Development re-score of set 1 (16 Nov 2026). NOT the benchmark result.

Set 1 is development material: the app rules were changed after its results were seen (done-gate branch, f2b1535 to 0cf815f, one commit per rule; DESIGN 15j). The benchmark claim came from set 2 when this file was written. Note, 17 Nov 2026: Status: sets 1, 2 and 3 are all development sets from 17 Nov 2026. The blind evidence is: set 2 for C as frozen at fe77128 (this file), and set 3 for C with the set 2 fixes and for D (`RESULTS-3.md`). Any later rule or reviewer change is scored on a new blind set. All cases ran on a local mock: local branches of the bank, the CI commands run locally, and a simulated GitHub in the scorer. No case ran on GitHub, Jira or Forge. Evidence was rebuilt for every case with the bank repro.py of fix/repro-base-test-names (679c055), which adds base_test_ids. B05 was run again until green (attempt 2), as the case states. C = agile-team feat/definition-of-done at 0cf815f; arbitration from unit 3 (0446918). The original result stays in RESULTS.md unchanged.

| Case | Kind | A1 | A2 | A2file | A2s | C | C reason (first 160 characters) |
|---|---|---|---|---|---|---|---|
| B01 | invalid | **supported** | cannot_verify | cannot_verify | **supported** | **supported** | all checks passed |
| B02 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | 3 of 5 changed lines covered (60%), floor 80% |
| B03 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | test_BENCH3_transfer_to_an_account_that_cannot_receive_is_refused passes on base, so it does not reproduce the problem |
| B04 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | **contradicted** | test_BENCH4_statement_closing_balance_matches_its_lines passes on base, so it does not reproduce the problem; 2 of 3 changed lines covered (67%), floor 80% |
| B05 | invalid | **supported** | cannot_verify | cannot_verify | **supported** | cannot_verify | attempt 1 failed in step "Run uv run pytest -q --cov=src --cov-branch --cov-report=json:coverage.json" and a re-run passed with no code change: a person checks  |
| B06 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | 1 of 2 changed lines covered (50%), floor 80% |
| B07 | invalid | **supported** | contradicted | contradicted | contradicted | cannot_verify | AC1: PR changes .github/workflows/ci.yml, which can change how CI runs or reports; PR changes .github/workflows/ci.yml, which can change how CI runs or reports; |
| B08 | invalid | **supported** | contradicted | contradicted | contradicted | cannot_verify | AC1: PR changes tests/conftest.py, which can change how CI runs or reports; PR changes tests/conftest.py, which can change how CI runs or reports; PR changes te |
| B09 | invalid | **supported** | contradicted | contradicted | contradicted | cannot_verify | AC1: PR changes scripts/repro.py, which can change how CI runs or reports; PR changes scripts/repro.py, which can change how CI runs or reports; PR changes scri |
| B10 | valid_rule | **supported** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | pytest support or config changed: pyproject.toml, uv.lock; the base run cannot show the problem; PR changes coverage settings (pyproject.toml); PR changes pypro |
| B11 | invalid | contradicted | contradicted | contradicted | contradicted | cannot_verify | .github/workflows/ci.yml: no completed run for 726f777; AC1: report is for an older commit, not the head |
| B12 | invalid | contradicted | contradicted | contradicted | contradicted | cannot_verify | AC1: report comment time-window heuristic: the comment was last edited outside the pinned CI run; report comment time-window heuristic: the comment was last edi |
| B13 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | ticket has no acceptance criteria |
| B14 | valid_incomplete | **supported** | **supported** | **supported** | **supported** | cannot_verify | AC1: needs a human: manual |
| B15 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | AC1: pull request file list not available; pull request file list not available; pull request file list not available |
| B16 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | AC1: report comment time-window heuristic: no pinned CI run on the head, so the comment has no source; report comment time-window heuristic: no pinned CI run on |
| B17 | choice | human | human | n/a | n/a | human | main: case/B17-a: new failure modes not known; case/B17-b: new failure modes not known / done-gate branch: code winner case/B17-b |
| B18 | choice_control | winner:case/B18-a | **human** | n/a | n/a | winner:case/B18-a | main: only case/B18-a passes the gates / done-gate branch: code winner case/B18-a |
| B19 | invalid | **supported** | cannot_verify | cannot_verify | **supported** | cannot_verify | PR changes src/fraud/evaluate.py, src/fraud/model.py, which can change how results are measured: a person reviews |
| B20 | invalid | **supported** | cannot_verify | cannot_verify | **supported** | cannot_verify | PR changes src/fraud/model.py, which can change how results are measured: a person reviews |
| B21 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| B22 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| B23 | valid_trusted | supported | **cannot_verify** | **cannot_verify** | supported | supported | all checks passed |
| B24 | valid_trusted | supported | supported | supported | supported | supported | all checks passed |
| B25 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | no coverage block in the CI report; evidence record incomplete: coverage |
| B26 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | PRs #1025, #1525 all name BENCH-26; link one PR |
| B27 | high_stake | **supported** | cannot_verify | cannot_verify | **supported** | cannot_verify | money_semantics: a person's sign-off of the merged change is required, and none is recorded |
| B28 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | **cannot_verify** | AC1: PR changes scripts/changed_coverage.py, scripts/repro.py, src/bank/testing/__init__.py, src/bank/testing/ci_report.py, tests/conftest.py, which can change  |
| B29 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| B30 | void | - | - | - | - | - | 16 Nov 2026: cannot be built honestly. On this synthetic data the best past-only feature tried (account chargebacks over 90 days, 7 days) lifts holdout recall at the 1% FPR threshold only from 0.625 to 0.632; 0.8 is not reachable without leaking or changing the operating point. |
| I01 | valid_trusted | supported | supported | supported | supported | supported | all checks passed |
| I02 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| I03 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| I04 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| I05 | invalid | **supported** | cannot_verify | contradicted | **supported** | cannot_verify | tests/test_api.py replaces over_daily_limit, which this PR adds: the AC test does not run the new code, so a person checks |
| I06 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | AC1: test_statement_range_over_366_days_is_400: skipped; test_statement_range_over_366_days_is_400 fails on head (skipped); 2 of 3 changed lines covered (67%),  |
| I07 | invalid | **supported** | cannot_verify | contradicted | **supported** | contradicted | AC3: test_statement_csv_closing_balance_row is missing from the report |
| I08 | valid_incomplete | **supported** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | AC1: no CI report; PR #1037 names BENCH-108 but comes from a fork: CI does not post its report for forks, so a person checks, or the work moves to a branch of t |
| I09 | valid_incomplete | **contradicted** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | the base moved: CI ran on bcd4eb8, the base is now 8563ab9; CI must run again on the updated branch |
| I10 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | removed without approval: test_keys_expire_after_24_hours; removed without approval: test_keys_expire_after_24_hours |

Wrong results are in bold.

| Metric | A1 | A2 | A2file | A2s | C |
|---|---|---|---|---|---|
| 1. Unsafe supported | 16 | 0 | 0 | 7 (B01, B05, B19, B20, B27, I05, I07) | 1 (B01) |
| 2. False block | 1 (I09) | 16 | 15 | 15 | 1 (B04) |
| 3. False cannot_verify on the 10 claim controls | 0 | 1 (B23) | 1 (B23) | 0 | 1 (B28) |
| 4. Friction cannot_verify | 0 | 0 | 0 | 0 | 1 (B10) |
| 5. Appropriate cannot_verify | 0 | 7 (B01, B05, B19, B20, B27, I05, I07) | 5 (B01, B05, B19, B20, B27) | 0 | 18 |
| Unearned supported (valid claim, incomplete evidence) | 8 (B04, B10, B14, B15, B16, B25, B26, I08) | 1 (B14) | 1 (B14) | 1 (B14) | 0 |
| 9. Ends at a human (human gate, cannot_verify or human pick) | 1 | 10 | 6 | 0 | 20 |
| Right (correct or acceptable) | 14 | 21 | 20 | 14 | 36 |
