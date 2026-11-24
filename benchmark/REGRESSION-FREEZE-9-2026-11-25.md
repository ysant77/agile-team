# Regression of the set 9 frozen app (25 Nov 2026, no model)

**Question.** Before the set 9 case file is opened: what does the frozen app `main` f3662f8 give on
the stored evidence of sets 1 to 8, against the set 8 frozen app (6c4ec0c) and against the results
of record? Set 9 results are compared only with this run.

**Run.** Arm C: `run/score.mjs` with the scorer of f3662f8 (changes up to 25), on
`run/evidence/pinned-2026-11-18` (sets 1 to 4) and `run/evidence/set5-...` to `set8-...` (sets 5
to 8), with the set manifests. The same evidence was also scored with app 6c4ec0c. Record:
`run/evidence/regression-9-2026-11-25.txt` (the sha256 of each `results.json` and every moved row).
Reasons that hold a retry clock time are not compared.

## Against the set 8 frozen app (6c4ec0c)

Sets 1 to 7: identical outcomes and reasons. Set 8: exactly the moves recorded when PRs 117 and
118 were merged, and no other:

| Case | Move | PR | Record |
|---|---|---|---|
| Y08 | `supported` to `cannot_verify` (the mark recorded with the ACs; the claimant removed the label) | 117 | `impact-high-stake-mark-2026-11-24.txt` |
| Y06, Y14 | reason only: "removed without approval: ..." is gone; the merge-result reason stays | 118 | `impact-removed-test-pr-files-2026-11-24.txt` |

## Against the results of record

The results of record of sets 5 to 7 were scored with the app frozen for each set. Every row that
differs from them now was moved by a fix recorded after that set, and each move matches its
record. None is new since the set 8 freeze.

| Set | Case | Move | Where it is recorded |
|---|---|---|---|
| 5 | V07 | `contradicted` to `cannot_verify` (coverage under the floor is unknown) | `docs/claims.md`, "Verifier corrections (23 Nov 2026)" |
| 5 | V12 | `supported` to `cannot_verify` (a removed `httponly`/`secure` argument) | same |
| 5 | V17 | `contradicted` to `cannot_verify` (the corrections made it `supported`; the rename-link rule then made it `cannot_verify`) | same, and the rename rule paragraph before it |
| 5 | V18 | `supported` to `cannot_verify` (an AC test sets a flag that the PR adds) | same |
| 6 | W10 | `supported` to `cannot_verify` (`samesite` value changed) | same (owner decision 23 Nov); `FREEZE-7.md`, PR 73 |
| 6 | W13 | reason only: the deletion is named | `docs/claims.md`; `FREEZE-7.md`, PR 69 |
| 6 | W22 | `contradicted` to `cannot_verify` (a skipped test is unknown) | `docs/claims.md`; `FREEZE-7.md`, PR 69 |
| 7 | X01 | `cannot_verify` to `supported` (DID NOT RAISE) | `FREEZE-8.md`, PR 100; `impact-did-not-raise-2026-11-24.txt` |
| 7 | X09 | reason only: the failed AC test on the merge result is named | `FREEZE-8.md`, PR 101; `impact-merge-ac-tests-2026-11-24.txt` |
| 8 | Y08, Y06, Y14 | as in the table above | PRs 117, 118 |

Sets 1 to 4 have no `results.json` of record in the repository; their comparison is with 6c4ec0c
only (identical).

## Counts (arm C, `run/summarize.py`, the same script on both sides)

`summarize.py` counts a "not checked" answer (set 8 Y04) as not right; `RESULTS-8.md` counts it as
`cannot_verify` by the rule of the case file. So the set 8 headline of record (18 right) is
`summarize.py`'s 17 plus Y04.

| Set | Record: right / strict / unsafe / false blocks | f3662f8: right / strict / unsafe / false blocks |
|---|---|---|
| 5 | 16 / 14 / 4 (V02, V09, V12, V18) / 3 (V07, V17, V23) | 18 / 16 / 2 (V02, V09) / 1 (V23) |
| 6 | 13 / 12 / 2 (W10, W18) / 1 (W22) | 15 / 14 / 1 (W18) / 0 |
| 7 | 17 / 16 / 3 (X07, X15, X19) / 1 (X18) | 18 / 18 / 3 (X07, X15, X19) / 1 (X18) |
| 8 | 17 / 17 / 4 (Y02, Y08, Y09, Y13) / 0 | 18 / 18 / 3 (Y02, Y09, Y13) / 0 |

These are development figures: every set here has been read, and each fix was made with its
outcomes known. They are not a measurement; the results of record stay the headline of each set.

## Status of the freeze

Against 6c4ec0c, the only moves are those of PRs 117 and 118. Against the results of record,
sets 5 to 8 differ, and every difference is a recorded fix. By the lead's rule ("a difference from
the results of record stops the freeze"), the hash line of `FREEZE-9.md` stays open until the lead
rules on this note.
