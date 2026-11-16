# Scorer and rule changes after the freeze (dbc4fcb, 16 Nov 2026)

The case files (`CASES.md`, `CASES-INDEPENDENT.md`, `PREDICTIONS-INDEPENDENT.md`) are
byte-identical to dbc4fcb (`git diff --stat dbc4fcb` on them is empty). The scorer did not exist
at the freeze. It was written after the freeze and first committed in the commit that adds this
file. Every change made after a case result was seen is listed below.

| # | Change | Seen results before? | Kind | How it is reported |
|---|---|---|---|---|
| 0 | First scorer version, written before any case result: A1 and A2 by the rules of section 1; C by the app's `decide()` on a simulated GitHub. | No | — | — |
| 1 | I09: the manifest lists two branches (the PR and the moved main tip B2). Version 0 read every two-branch case as competing PRs and ran arbitration. Now a case with `baseMovedTo` scores only its first branch as one PR. | Yes (I01 to I10) | Bug fix. Frozen text: I09 is one PR with a `ready` claim and a moved base (CASES-INDEPENDENT.md, I09). Version 0 did not do that. | Fixed. Version 0 output for I09 ("code winner") is shown in the results as a scorer bug. |
| 2 | A2 repro job, "any test that the PR adds or changes". Version 0 applied it to every test row of the changed test files (what `scripts/repro.py` copies). Now read per test: a test id that is new against the base report, or whose `def` line is added or removed in the diff. | Yes (I01 to I10) | Ambiguous frozen text. "A test that the PR adds or changes" can mean the test function or the test file. | Both readings are scored and shown: **A2** (per test) and **A2-file** (per file, version 0). Neither is called the primary result alone; the table shows both. |
| 3 | A2s: code owners on test-support paths only (not every file under `tests/`). | Yes | Added after the freeze. Sensitivity variant, not scored as a primary result. | Labelled "A2s, post hoc". |
| 4 | B17 and B18: the builder measured two bench runs per side (`run_medians`), not 20 runs with an IQR. The scorer uses the median of the run medians and their range as the spread. | No (made before any B result) | Adapter for the builder's data format; the frozen rule (10% margin, no IQR overlap) is unchanged. | Noted with the B17 and B18 rows. |
| 5 | Runner, B07: `run_ci.py` ran the full suite even when the PR's own `ci.yml` passes `--ignore` to pytest. It now keeps the `--ignore` and `--deselect` flags of the PR's report step. | Yes (B07: A1 blocked, local run red) | Runner bug. Frozen text (CASES.md section 6): "The bank CI commands run locally"; the CI commands of a PR are its own workflow. | Fixed. Before: A1 and A2 blocked, C cannot_verify. After: A1 merge, A2 blocked, C cannot_verify. |
| 6 | Evidence, B05: the first local run hit the flaky failure (red). The frozen case says "a re-run of the workflow turns it green". The evidence was run again until green (attempt 2) and the simulated GitHub shows run attempt 2. | Yes | Case built as described (the first run did not match the stated state). | Fixed. Before: A1 blocked, C contradicted. After: A1 merge, C supported (unsafe). |
| 7 | B17 and B18: C's arbitration. The done-gate branch (`feat/definition-of-done`) still carries the arbitration rule from before PR 3; main (merged a5e7ad8) has the recommendation-only rule. C now takes arbitration from main, the current app. | Yes (B17: done-gate branch gave "code winner B17-b, smaller diff") | Version choice: the app as merged. | Both shown in the table: main result, and the done-gate branch result in the reason column. |
| 8 | Summary: metric 9 (ends at a human) added to the table. | Yes | Reporting only (metric 9 is in CASES.md section 4). | Shown. |

The frozen A2 says code owners on `tests/`. Read as written, any PR that touches a test file
waits for a code-owner review (a `human gate`). The primary A2 keeps that.
