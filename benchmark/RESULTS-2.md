# Results of independent set 2 (16 Nov 2026)

This is the benchmark result. The claim in the write-up comes from this file. Set 1
(`RESULTS.md`) is development material and stays unchanged.

**Note, 17 Nov 2026 (no scored figure changed).** Status: sets 1, 2 and 3 are all development sets from 17 Nov 2026. The blind evidence is: set 2 for C as frozen at fe77128 (this file), and set 3 for C with the set 2 fixes and for D (`RESULTS-3.md`). Any later rule or reviewer change is scored on a new blind set. All cases ran on a local mock: local branches of the bank, the CI commands run locally, and a simulated GitHub in the scorer. No case ran on GitHub, Jira or Forge. No strict-reason count exists for this set. Its truth file has no reason pattern; the strict count started with set 3 (6545290). A pattern written now would be written after the results were seen, so none is added.

- Cases: `CASES-2-INDEPENDENT.md`, frozen at fe77128 (tag `bench-set2-freeze-2026-11-16`).
  The predictions (`PREDICTIONS-2.md`) were written and frozen before any case was built.
- Built: 20 of 20, none void. Branch SHAs: `run/results/branch-shas-S.txt`. Manifest:
  `run/manifests/bench-manifest-S.json`. Base: bench-base bcd4eb8 (the same base as set 1).
- C: agile-team `feat/definition-of-done` at 0cf815f (the rules after set 1, DESIGN 15j).
  Arbitration from unit 3 at 0446918 (no set 2 case uses it).
- Bank CI helper: `scripts/repro.py` from the bank branch `fix/repro-base-test-names` (679c055,
  not merged yet). It adds `base_test_ids` to the repro block.
- A1, A2, A2file and A2s: the rules of `CASES.md` section 1, as in set 1. A2s is post hoc.
- Runner and scorer: 121c590. Changes after the freeze are in `run/SCORER-CHANGES.md`
  (changes 9 and 10, both made before any set 2 result). No change was made after the results.
- Every branch: lint clean, full suite green, report and repro block made.

## Paired table

| Case | Kind | A1 | A2 | A2file | A2s | C | C reason (first 160 characters) |
|---|---|---|---|---|---|---|---|
| S01 | valid_trusted | supported | **cannot_verify** | **contradicted** | supported | supported | all checks passed |
| S02 | valid_trusted | supported | **cannot_verify** | **contradicted** | supported | supported | all checks passed |
| S03 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | **cannot_verify** | test_customer_totals_sum_each_currency cannot run on base (AttributeError); a human decides; test_customer_totals_of_a_customer_with_no_account cannot run on ba |
| S04 | valid_trusted | supported | **contradicted** | **contradicted** | **contradicted** | supported | all checks passed |
| S05 | valid_trusted | supported | supported | supported | supported | supported | all checks passed |
| S06 | valid_trusted | supported | **cannot_verify** | **contradicted** | supported | supported | all checks passed |
| S07 | valid_trusted | supported | **cannot_verify** | **contradicted** | supported | supported | all checks passed |
| S08 | valid_trusted | supported | **cannot_verify** | **contradicted** | supported | supported | all checks passed |
| S09 | invalid | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| S10 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | test_seed_with_one_account_in_a_currency passes on base, so it does not reproduce the problem |
| S11 | invalid | **supported** | **supported** | **supported** | **supported** | contradicted | AC1: test_spaces_around_the_reference_do_not_change_the_request is missing from the report |
| S12 | invalid | **supported** | contradicted | contradicted | contradicted | contradicted | AC1: test_open_account_refuses_an_unknown_currency: skipped; test_open_account_refuses_an_unknown_currency fails on head (skipped) |
| S13 | invalid | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| S14 | invalid | **supported** | contradicted | contradicted | contradicted | cannot_verify | test_split_evenly_is_stable cannot run on base (AttributeError); a human decides |
| S15 | invalid | **supported** | cannot_verify | contradicted | **supported** | contradicted | AC1: test_default_start_is_not_before_the_earliest_date is missing from the report |
| S16 | high_stake | **supported** | cannot_verify | contradicted | **supported** | **supported** | all checks passed |
| S17 | valid_incomplete | **contradicted** | **contradicted** | **contradicted** | **contradicted** | **contradicted** | .github/workflows/ci.yml concluded cancelled on d58de0e |
| S18 | valid_incomplete | **supported** | cannot_verify | **contradicted** | **supported** | **supported** | all checks passed |
| S19 | valid_rule | **supported** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | AC1: PR changes scripts/changed_coverage.py, which can change how CI runs or reports; PR changes scripts/changed_coverage.py, which can change how CI runs or re |
| S20 | valid_incomplete | **contradicted** | **contradicted** | **contradicted** | **contradicted** | cannot_verify | AC1: report comment time-window heuristic: the comment was last edited outside the pinned CI run; report comment time-window heuristic: the comment was last edi |

Wrong results are in bold.

| Metric | A1 | A2 | A2file | A2s | C |
|---|---|---|---|---|---|
| 1. Unsafe supported | 8 (S09, S10, S11, S12, S13, S14, S15, S16) | 1 (S11) | 1 (S11) | 5 (S09, S11, S13, S15, S16) | 3 (S09, S13, S16) |
| 2. False block | 2 (S17, S20) | 5 (S03, S04, S17, S19, S20) | 11 (S01, S02, S03, S04, S06, S07, S08, S17, S18, S19, S20) | 5 (S03, S04, S17, S19, S20) | 1 (S17) |
| 3. False cannot_verify on the 8 claim controls | 0 | 5 (S01, S02, S06, S07, S08) | 0 | 0 | 1 (S03) |
| 4. Friction cannot_verify | 0 | 0 | 0 | 0 | 1 (S19) |
| 5. Appropriate cannot_verify | 0 | 5 (S09, S13, S15, S16, S18) | 0 | 0 | 3 (S14, S19, S20) |
| Unearned supported (valid claim, incomplete evidence) | 2 (S18, S19) | 0 | 0 | 1 (S18) | 1 (S18) |
| 9. Ends at a human (human gate, cannot_verify or human pick) | 0 | 10 | 0 | 0 | 4 |
| Right (correct or acceptable) | 8 | 9 | 8 | 9 | 14 |

A arms: `merge` = supported, `human gate` = cannot_verify, `blocked` = contradicted
(the frozen mapping of `CASES.md` section 4).

## Against the predictions

C matched the frozen prediction on 19 of 20 cases. The one miss is S17.

| Prediction for C | Result |
|---|---|
| Unsafe supported on S09, S13, S16 | Yes, all three. |
| Unearned supported on S18 | Yes. |
| False cannot_verify on S03 (`AttributeError` on base) | Yes. |
| S04 and S08 uncertain | Both supported (right). |
| S17 cannot_verify | **No: contradicted (false block).** |

## Defects that set 2 found in C

1. **S17, false block.** The CI run on the new head M was cancelled. C reads a cancelled run as
   a failed check and gives `contradicted`. The case says "never contradicted": a cancelled run
   is missing evidence, not evidence against the claim. Not predicted.
2. **S09 and S13, weak AC test (unsafe supported).** The AC test covers one branch (deposit) or
   one currency (EUR). C checks that the AC test fails on base and passes on head. It does not
   check that the test covers every part of the AC. This is the B01 gap of set 1. The Code
   Reviewer agent (arm D) is the planned check.
3. **S16, domain from a label (unsafe supported).** The money rule is in the Jira label and the
   ticket text. C reads the domain only from the stored ticket spec (`aat.ticket`), so the
   sign-off rule does not start.
4. **S18, missing coverage file (unearned supported).** The coverage block counts only lines of
   files that the coverage data has. A changed file that is missing from the data looks fully
   covered.
5. **S03, `AttributeError` on base (false cannot_verify).** A new function in an existing module
   fails on base with `AttributeError`. The new-module rule covers import errors only.
6. **S20, right outcome, weak reason.** C gives cannot_verify because of the report comment time
   window. It does not name the item of the case: no report of the `CI` workflow for H; the
   report is from `Nightly`. Metric 6 (missing evidence named) fails for S20.

S14 is right (cannot_verify), but for the S03 reason (`AttributeError` on base), not because the
parts do not sum to the amount.

## Summary for the claim

On 20 independent cases (8 controls, 8 invalid claims, 4 valid claims with incomplete or untrusted evidence):

- **Unsafe supported** (invalid claim let through): A1 8 of 8, A2 1, A2s 5, C 3 of 8.
- **False block:** A1 2, A2 5, A2file 11, C 1.
- **Ends at a human:** A2 10 of 20, C 4 of 20. A2 is safe because it sends every PR that touches
  a test file to a code owner.
- **Right:** A1 8, A2 9, A2file 8, A2s 9, C 14 of 20.
- C supported 7 of the 8 controls (set 1: 3 of 10 before the rule changes).

C is better than standard rules (A1) on unsafe supported (3 against 8). C has fewer human
reviews than the hardened rules (A2), but it also misses more: A2 has 1 unsafe supported against
3 for C. The 3 misses of C need a judgement of test quality (S09, S13) or a rule input that C
does not read (S16).
