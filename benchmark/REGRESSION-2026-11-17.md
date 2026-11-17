# Regression check of the rule fixes on sets 1 to 3 (17 Nov 2026)

Development sets only (README, regression policy). Not a benchmark result. Arm C only; arm D was
not re-run (no model slot given). App: agile-team `fix/rules-after-set2` at 06bfe5a (the review
fixes of PRs 4 to 9 merged down the stack). Baseline: the same evidence scored with 28e6647. Raw
results: `run/results/regression-2026-11-17/`. All runs on the local mock.

Two readings:
- **Reading 1:** the recorded evidence as it is.
- **Reading 2:** the same evidence with an empty `unmeasured_files` list where the coverage block
  has none (SCORER-CHANGES item 15). The recorded evidence was built before the bank coverage
  script wrote this field; bank PR 17 writes it.

| Set | Count | Baseline 28e6647 | Reading 1 | Reading 2 |
|---|---|---|---|---|
| 1 (39) | Unsafe supported | 1 (B01) | 0 | 1 (B01) |
| 1 | False block | 1 (B04) | 1 (B04) | 1 (B04) |
| 1 | False cannot_verify, 10 controls | 1 (B28) | 9 | 1 (B28) |
| 1 | Right (outcome = strict) | 36 | 29 | 36 |
| 2 (20) | Unsafe supported | 3 (S09, S13, S14) | 0 | 1 (S09) |
| 2 | Unearned supported | 1 (S18) | 0 | 1 (S18) |
| 2 | False cannot_verify, 8 controls | 0 | 7 | 1 (S03) |
| 2 | Right (outcome = strict) | 16 | 13 | 17 |
| 3 (20) | Unsafe supported | 5 | 5 | 5 |
| 3 | False block | 3 (T05, T09, T22) | 3 | 3 |
| 3 | False cannot_verify, 9 controls | 1 (T13) | 2 (T13, T16) | 2 (T13, T16) |
| 3 | Right / strict | 12 / 10 | 11 / 9 | 11 / 9 |

**Result under the policy: worse on set 3 (T16) and on set 2 control S03, in both readings.**
Reading 1 is worse on every set because all old evidence lacks `unmeasured_files` (fail-closed by
design: no check passes on a missing input).

Cause of S03 and T16: the review made the "new function on base" rule stricter (PR 9, finding
12). It now needs the base exception text to name the function. The recorded evidence has only
the exception type. Bank PR 15 now records the first line of the exception text (de6436e). Whether
S03 and T16 recover needs the evidence rebuilt with that bank commit: not done.

Set 2 is better in reading 2 (unsafe supported 3 to 1; right 16 to 17).
