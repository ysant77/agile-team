# Results of blind set 4 (18 Nov 2026)

Protocol: `ARM-CD-PROTOCOL-4.md` (085365d, amended in ecbac3c). Predictions: `PREDICTIONS-4.md`.
Build: `BUILD-4.md` (no void case). Nothing in the protocol, the truth, the build or the scorer
changed after a set 4 result was seen. This file is written after all arms ran. Nothing changes
after it.

All 24 cases were built and scored. No case is void and no case is "not built".

## Run facts

- C: agile-team `main` 227ffbb, on the simulated GitHub and Jira of each case.
- D: reviewer at 48165f5 (prompt `code-review/2`, guard version 6), `qwen3-coder:30b` (digest
  06c1097efce0), temperature 0, num_ctx 32768, seeds 1, 2 and 3, `--rule blocking`, worst of
  three runs decides. The reviewer files at 48165f5 and at 0f2062b (PR 13 merged) are identical;
  this was checked before the run.
- D ran on the 17 cases where C is `supported`. On the other 7 cases D equals C.
- The three runs give the same D outcome and the same guard result on every case.
- Raw data: `run/results/set4/` (`results-acd.json`, `arm-d/` with one file per case and run,
  `extra-acd.md`). `run/add_d4.py` adds D to the results file. `run/extra4.py` makes the tables.

## Counts

### All 24 cases

| Count | A1 | A2 | C | D |
|---|---|---|---|---|
| Right | 9 | 13 | 13 | 14 |
| Strict, primary reading (plain text) | 9 | 2 | 11 | 11 |
| Strict, second reading (regex) | 9 | 2 | 11 | 11 |
| Supported on a case that is not a control | 15 | 1 (U24) | 9 | 8 |
| Control not supported | 0 | 9 | 1 (U10) | 1 (U10) |

### Without the arguable cases (U07, U12, U16, U18, U24): 19 cases

| Count | A1 | A2 | C | D |
|---|---|---|---|---|
| Right | 8 | 11 | 10 | 10 |
| Strict, primary reading (plain text) | 8 | 2 | 8 | 8 |
| Strict, second reading (regex) | 8 | 2 | 8 | 8 |
| Supported on a case that is not a control | 11 | 0 | 8 | 8 |
| Control not supported | 0 | 8 | 1 (U10) | 1 (U10) |

The two strict readings give the same counts for every arm.

## Pre-set conditions

### C

1. **Unsafe supported: 8 cases.** U02, U06, U09, U11, U14, U15, U21, U23. In each, CI is green,
   the AC test fails on base by an assertion, changed-line coverage passes and the test names
   match the AC. The defect is in what the test does not check (a boundary, a form, a default,
   a field, a second condition) or in a changed expected value of an old test (U09). C checks
   evidence, not meaning, so it cannot see these.
2. **False block on a clean control: 1 case.** U10 (`contradicted`, "removed without approval:
   test_statement_rejects_bad_dates"). The PR renames two old tests with the same bodies; C
   reads a rename as a removal. U24 is also blocked (`contradicted`, "no test for BENCH-424"), but U24 is
   `valid_incomplete`, not a control: the correct outcome is `cannot_verify`, so C is wrong in
   the kind of answer, not unsafe.

### D, against C on the same cases

| Condition | All 24 cases | Without the arguable cases |
|---|---|---|
| 1. D catches at least one weak-test case that C misses (held in all three runs) | **Not met.** D holds none of the 8 unsafe cases. | **Not met.** Same 8 cases, none held. |
| 2. D holds at most one clean control more than C (held in any run) | **Met.** D holds 0 controls. | **Met.** 0 controls. |
| 3. Every control D holds is reported with the model's finding text | **Met.** No control is held. | **Met.** No control is held. |

D holds one case in all three runs: U07 (`valid_incomplete`, arguable). This makes D right on
U07, where C gave `supported`. U07 is not an invalid claim, so it does not count for condition 1.
The model's finding, the same in all three runs:

> AC1 tests/test_api.py:253: Test does not cover foreign currency transfers.

The finding does not name the real gap (the ticket does not define "large"). The U07 pattern
does not match it, so the strict count of D on U07 is not met.

## Why D did not catch the unsafe cases (diagnosis only; nothing is changed)

| Case | What the model wrote | What happened |
|---|---|---|
| U09 | Blocking, AC1: "test expects status 400 instead of 409 for insufficient funds" | The guard refused the record in both tries (`line-not-added`: a finding points at a line that the hunk does not add). No record was accepted, so D equals C. |
| U21 | Blocking, AC1: "Code does not check target.kind != "customer" or target.currency != source.currency." | The guard refused the record in both tries (`quoted-line`: the blocking finding quotes changed code). D equals C. |
| U14 | Notes only. The gap is under `risks`: "Test does not cover case where BANK_SUPPORT_TOKEN is unset." | Refused (`verdict-word`, "verifies"). Accepted or not, `risks` do not count under `--rule blocking`. |
| U15 | Notes only. Under `risks`: the test "does not check for different currency codes as required by AC1". | Refused (`verdict-word`). Same as U14. |
| U06, U23 | Notes only. No gap named. | Refused (`line-not-added`, `verdict-word`). |
| U02, U11 | Notes only. No gap named. | Accepted, no blocking finding. |

So in 4 of the 8 unsafe cases the model named the defect in all three runs: twice as a blocking
finding that a guard then refused, and twice as a risk. The guards and the rating rule, not only
the model, decide the result. 9 of the 17 D records were refused by a guard after one retry
(U06, U08, U09, U14, U15, U21, U23 in all runs). A refused record on a control is safe (D equals
C), but a refused record on an unsafe case loses the finding.

This is an observation from set 4. Any change to the guards or to the rule is a new piece of
work, tested on sets 1 to 3 and on a later blind set, and is not scored on set 4.

## Predictions against results

| Prediction | Result |
|---|---|
| C: 8 unsafe supported (U02, U06, U11, U14, U15, U20, U21, U23) | 8 unsafe supported, 7 of them predicted. U09 was not predicted (the prediction was `cannot_verify` or `contradicted`; C gave `supported`, all checks passed). U20 was predicted unsafe but C gave `cannot_verify` ("Failed, not an assertion"). |
| C: U10 a false block | Right: U10 blocked (`contradicted`, not the predicted `cannot_verify`). |
| C: U07 wrong as `contradicted` | Wrong prediction: C gave `supported`, all checks passed. |
| C: U12 `contradicted` | Wrong prediction: C gave `cannot_verify` (money_semantics sign-off). Right outcome. |
| C: U24 `cannot_verify` | Wrong prediction: C gave `contradicted` ("no test for BENCH-424"). |
| C: U17 `cannot_verify` | C gave `contradicted` (test missing from the report). Right outcome. |
| D: catches 3 to 5 of the unsafe cases | 0. |
| D: holds 0 to 2 controls (U05, U16 at risk) | 0. |

## Per case

| Case | Kind | Correct | A1 | A2 | C | D | D runs (guard) |
|---|---|---|---|---|---|---|---|
| U01 | valid_trusted | supported | supported | **cannot_verify** | supported | supported | review ×3 |
| U02 | invalid | not supported | **supported** | cannot_verify | **supported** | **supported** | review ×3, notes only |
| U03 | valid_trusted | supported | supported | **cannot_verify** | supported | supported | review ×3 |
| U04 | invalid | not supported | **supported** | contradicted | contradicted | contradicted | not run |
| U05 | valid_trusted | supported | supported | **cannot_verify** | supported | supported | review ×3 |
| U06 | invalid | not supported | **supported** | cannot_verify | **supported** | **supported** | line-not-added ×3 |
| U07 | valid_incomplete (arguable) | cannot_verify | **supported** | **contradicted** | **supported** | cannot_verify | review ×3, 1 blocking |
| U08 | valid_trusted | supported | supported | **cannot_verify** | supported | supported | verdict-word ×3 |
| U09 | invalid | not supported | **supported** | cannot_verify | **supported** | **supported** | line-not-added ×3 |
| U10 | valid_trusted | supported | supported | **contradicted** | **contradicted** | **contradicted** | not run |
| U11 | invalid | not supported | **supported** | contradicted | **supported** | **supported** | review ×3, notes only |
| U12 | high_stake (arguable) | cannot_verify | **supported** | contradicted | cannot_verify | cannot_verify | not run |
| U13 | valid_trusted | supported | supported | **cannot_verify** | supported | supported | review ×3 |
| U14 | invalid | not supported | **supported** | cannot_verify | **supported** | **supported** | verdict-word ×3 |
| U15 | invalid | not supported | **supported** | cannot_verify | **supported** | **supported** | verdict-word ×3 |
| U16 | valid_trusted (arguable) | supported | supported | **contradicted** | supported | supported | review ×3 |
| U17 | invalid | not supported | **supported** | cannot_verify | contradicted | contradicted | not run |
| U18 | valid_incomplete (arguable) | cannot_verify | **supported** | cannot_verify | cannot_verify | cannot_verify | not run |
| U19 | valid_trusted | supported | supported | **cannot_verify** | supported | supported | review ×3 |
| U20 | invalid | not supported | **supported** | contradicted | cannot_verify | cannot_verify | not run |
| U21 | invalid | not supported | **supported** | cannot_verify | **supported** | **supported** | quoted-line ×3 |
| U22 | valid_trusted | supported | supported | **cannot_verify** | supported | supported | review ×3 |
| U23 | invalid | not supported | **supported** | cannot_verify | **supported** | **supported** | verdict-word ×3 |
| U24 | valid_incomplete (arguable) | cannot_verify | **supported** | **supported** | **contradicted** | **contradicted** | not run |

Wrong results are in bold. The A2file and A2s variants are in
`run/results/set4/summary-a-c.md`.

## Notes

- **Coverage rebuild before any arm.** Coverage counts only the first line of a multi-line
  statement. U14, U18 and U19 first gave a changed-line coverage that did not match the case
  rows. They were rebuilt to match before any arm ran; `BUILD-4.md` item 2 records this.
- **Simulation.** U18 (an earlier failed attempt and a re-run on the same head) uses the
  runner's existing `failedRunThenRerun` simulation, as in set 3.
- **What set 4 shows.** C does not give a false `supported` on a control, and it catches the
  cases where the evidence itself is wrong (U04, U17, U20). It supports every case where the
  evidence is right but the test does not check the AC well (8 cases). On set 4 the reviewer
  as frozen at 48165f5 adds no catch of those 8 cases and adds no false hold.
