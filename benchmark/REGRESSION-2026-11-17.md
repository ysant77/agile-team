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

## Update, 17 Nov 2026, 15:40 SGT: evidence rebuilt with the bank PR heads

The evidence of sets 1 to 3 was rebuilt with the bank CI files as on main after the bank PRs
merge (`repro.py` and `ci_report.py` de6436e, `changed_coverage.py` 2be2de7; SCORER-CHANGES item
16): 83 branches, every test exit code the same as in the first build. App: PR 9 at 88c468d (all
review corrections of the three rounds). Raw results: `run/results/regression-2026-11-17/*-rebuilt-88c468d.json`.

First, S03 and T16 alone, scored with PR 9 at 2820746: both `supported`. The base exception text
("module 'bank.ledger' has no attribute 'customer_totals'") now reaches the new-function rule;
finding 12 is not relaxed.

Then all three sets with 88c468d:

| Set | Unsafe supported | False block | False cannot_verify on controls | Right / strict |
|---|---|---|---|---|
| 1 (39) | 0 | 1 (B04) | 10 of 10 | 28 / 28 |
| 2 (20) | 0 | 0 | 8 of 8 | 12 / 12 |
| 3 (20) | 0 | 3 (T05, T09, T22) | 8 of 9 | 10 / 6 |

**Cause of the control holds (classified; work stopped here as ordered):** a gap in the scorer's
simulated Jira, not a verifier rule. The scorer builds the ticket from the case manifest, which has
no `subtasks` and no `links` fields. The live collector (`collectJira`) always sets both (a test on
PR 9 checks this). Under the "no check passes by default" rule a missing list now gives
`cannot_verify`, so every control is held with the reason "the sub-task list was not read ... the
link list was not read". B29 also lacks the simulated conclusions of its earlier CI attempt (the
live reader now reads them). B28 and T13 keep their own earlier reasons.

Not done: the scorer is not changed. A fix would give the simulated ticket `subtasks: []` and
`links: []` (as the collector does) and give the simulated GitHub the earlier-attempt and job
conclusions. That is a harness change after results were seen; it needs a SCORER-CHANGES entry
and the lead's approval before a re-score.

## Update, 17 Nov 2026, 16:00 SGT: scorer fix (SCORER-CHANGES 17), development sets

Approved by the lead after the cause above was classified. Made after the results were seen; no
rule change; PR 9 at 88c468d throughout. Raw results: `*-rebuilt-88c468d-scorer17.json`.

| Set | Count | Baseline (28e6647, old evidence) | Rebuilt, scorer before item 17 | Rebuilt, scorer item 17 |
|---|---|---|---|---|
| 1 (39) | Unsafe supported | 1 (B01) | 0 | 1 (B01) |
| 1 | False block | 1 (B04) | 1 (B04) | 1 (B04) |
| 1 | False cannot_verify, 10 controls | 1 (B28) | 10 | 1 (B28) |
| 1 | Friction cannot_verify | 1 (B10) | - | 1 (B10) |
| 1 | Right / strict | 36 / 36 | 28 / 28 | 36 / 36 |
| 2 (20) | Unsafe supported | 3 (S09, S13, S14) | 0 | 2 (S09, S14) |
| 2 | Unearned supported | 1 (S18) | 0 | 0 |
| 2 | False cannot_verify, 8 controls | 0 | 8 | 0 |
| 2 | Friction cannot_verify | 1 (S19) | - | 1 (S19) |
| 2 | Right / strict | 16 / 16 | 12 / 12 | 18 / 18 |
| 3 (20) | Unsafe supported | 5 | 0 | 5 (T02, T08, T12, T14, T23) |
| 3 | False block | 3 (T05, T09, T22) | 3 | 3 (T05, T09, T22) |
| 3 | False cannot_verify, 9 controls | 1 (T13) | 8 | 1 (T13) |
| 3 | Right / strict | 12 / 10 | 10 / 6 | 12 / 10 |

**Result under the regression policy: no worse on any count of any set.** Set 1 and set 3 are
equal to the baseline; set 2 is better (S13 and S18 are now right). These are development sets:
this shows no regression, not that the fixes work. The fix list is scored on the next blind set.

While making item 17, a first version keyed the cancelled run by `id >= 9500`, which also matched
the main run of B29 (PR numbers here start at 1000) and held B29. It was found from B29's reason
and corrected before this table (the cancelled run is now matched by its exact id).

After the table: PR 9 got main (PR 4) merged in (9d3acd7; one conflict in metricCompare, the PR 9
side kept). Sets 1 to 3 were scored again on 9d3acd7 with the same evidence and scorer: no case
outcome differs from 88c468d.

## Update, 17 Nov 2026: PR 9 after PR 7 and PR 8 merges (6173950)

Main (PRs 4 to 7) was merged into PR 8 (babb2da), and PR 8 into PR 9 (6173950). Sets 1 to 3 were
scored again for C on 6173950 with the same rebuilt evidence (new copies) and the scorer with item
17. Raw results: `*-rebuilt-6173950-scorer17.json`.

| Set | Unsafe supported | False block | False cannot_verify on controls | Right / strict |
|---|---|---|---|---|
| 1 (39) | 1 (B01) | 1 (B04) | 1 (B28) | 36 / 36 |
| 2 (20) | 2 (S09, S14) | 0 | 0 | 18 / 18 |
| 3 (20) | 5 | 3 (T05, T09, T22) | 1 (T13) | 12 / 10 |

No case outcome and no reason text differs from the 9d3acd7 run. **No worse on any count of any
set.** These are development sets: this shows no regression, not that the fixes work.
