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

## Set 2 (frozen at fe77128)

| # | Change | Seen set 2 results before? | Kind |
|---|---|---|---|
| 9 | Runner and scorer support for the set 2 facts: a report made on an older commit with the branch tip as the PR head (S17), a cancelled CI run on the head (S17, S20), a report from another workflow with no repro or coverage block (S20), a coverage file removed from `coverage.json` before the coverage script (S18), and the base tip from a branch. A1 and A2 read a cancelled run on the head as a failed required check. | No (made before any set 2 build finished) | Support for case facts the frozen set 2 text states. Set 1 outcomes are unchanged by it (checked). |
| 10 | `summarize.py` takes the truth file as an optional second argument. Set 2 uses `truth-2.json`, copied from the frozen rows of `CASES-2-INDEPENDENT.md`. With no argument the set 1 output is byte-identical (checked). | No | Reporting only. |

Run facts for set 2 (not changes): the evidence used `scripts/repro.py` from the bank branch
`fix/repro-base-test-names` (679c055). For S17, the runner also wrote evidence for the second
manifest branch `case/S17-main-b2`; the scorer does not read it (a `baseMovedTo` case scores its
first branch only, change 1). No case was re-run.

## Set 3 (protocol ARM-CD-PROTOCOL-3.md)

| # | Change | Seen set 3 results before? | Kind |
|---|---|---|---|
| 11 | A arms: a result field `cancelledAsPending` when a cancelled run on the head is the only reason for `blocked`; `summarize.py --cancelled-as-pending` scores that reading. | No (before set 3 is read) | Second reading, ordered by the lead. Set 1 and set 2 outcomes are unchanged. |
| 12 | `summarize.py`: strict count (outcome right and the truth `reason` pattern matches the reason). | No | Reporting. For sets 1 and 2 the strict row equals the outcome row (no reason patterns). |
| 13 | `run_ci.py --coverage-script` and `run_all.py --coverage-script`: copy the bank's fixed coverage script into the case tree. | No | Runner support for the frozen bank fix ba90b0f. |
| 14 | `arm_d.mjs --rule blocking` and several `--manifest` options. The default rule stays `any-finding` (the set 2 protocol). | No | D harness for code-review/2. |
| 15 | Regression reading 2 (17 Nov 2026): copies of the recorded evidence get `"unmeasured_files": []` in each coverage block that has no such field. The recorded evidence and every result file stay unchanged. | Yes (development sets only) | The evidence was built before the bank wrote the field; reading 1 shows the rule as it acts on that old evidence. |
