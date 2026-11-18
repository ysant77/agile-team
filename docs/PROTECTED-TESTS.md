# Protected regression set (design note, 18 Nov 2026)

Status: design and failing tests first. The bank CI step that writes the `pinned` block is not
built yet. Without that block the check is advisory and changes no verdict.

## Problem

The verifier sees a removed test (`tests_not_removed`), but not an old test that a change edits.
On blind set 4, two such changes were not caught by the code checks:
- U09 changes the expected status of an old test from 409 to 400. It is supported.
- U20 weakens an old assertion. It is `cannot_verify`, but for another reason.

A change can also deselect an old test in `pyproject.toml`.

## Rule

1. **Pinned set.** Every test function in `tests/` at the base commit is pinned, with the hash
   of its body (the source of the function, white space normalised). The whole base suite is
   pinned, not a hand-picked list: a list must be kept up to date, and a test that is not on it
   is not protected.
2. **Base copies run against the head code.** The bank CI step (an extension of
   `scripts/repro.py`, which already checks out the base commit) runs the base copy of each
   pinned test in the changed test modules against the head code, with the head's pytest
   configuration. It writes a `pinned` block in the CI report.
3. **Check `pinned_tests_hold`** (claims `fixed`, `ready` and `done` with code work):
   - **fail:**
     - a base copy fails or errors on head;
     - a base copy did not run (deselected or skipped);
     - a pinned test is deleted with no approved removal.
   - **unknown:** the block is malformed.
   - (Changed after the development-set results; see the end of this note.) A pinned test
     whose body changed but whose base copy passes on head does not hold the claim: the base
     copy keeps the old assertion in force. The reason names the edit.
   - **pass:** every pinned test is unchanged, renamed with the same body, or approved, and
     every base copy passes on head.
   - **advisory, not counted:** the report has no `pinned` block (the bank step is not
     deployed). The verdict view lists it under "not checked".
4. **Approval of a new pin.** A real requirement change can need a changed test. The ticket
   property lists `approvedTestChanges`: `{ test, reason, auditSeq }`, with a reason of at least
   5 characters. An approved test may change and its base copy may fail on head. A malformed
   list gives unknown.
   Limit: tonight the check does not match the approval to an audit event (as `signoff` does).
5. **Rename.** A head test with another name and the same body hash is a rename, not a removal.
   `tests_not_removed` accepts it when the `pinned` block names the pair (the U10 false block).

## The `pinned` block (bank CI report)

```json
{ "pinned": { "version": 1, "base_sha": "<40 hex>", "modules": ["tests/test_api.py"], "tests": [
  { "id": "tests/test_api.py::test_transfer_errors", "base_hash": "<sha256>",
    "head_id": "tests/test_api.py::test_transfer_errors", "head_hash": "<sha256>",
    "outcome": "passed" } ] } }
```

- `outcome` is the outcome of the base copy on the head code: `passed`, `failed`, `error` or
  `not_run`.
- `head_id` and `head_hash` are `null` when no head test has this name or this body (deleted).
- `head_id` differs from `id` when the body was found under another name (renamed).
- `modules` lists the base test modules that the step covered: the ones the pull request
  changes, renames or removes. An empty list with no test means no test module changed (pass).
  Unchanged modules run in the head suite as they are; a test missing there is caught by
  `tests_not_removed`.

## Prediction (written before the check code; sets 1 to 4 are development sets)

**With today's evidence:** no recorded CI report has a `pinned` block. The check is advisory on
every case. **No verdict on sets 1 to 4 changes.** This is what the arm C regression on this
branch tests (no model).

**With the bank step deployed and the cases rebuilt** (not done tonight):

| Case | C today | With the rule | Why |
|---|---|---|---|
| U09 | supported (unsafe) | contradicted | the base copy expects 409; head gives 400 |
| U20 | cannot_verify | contradicted | the base copy asserts `account_number(12345) == "YMS-0001-2345"`; head gives another number |
| U10 (control) | contradicted (false block) | supported | two renames with the same bodies |
| U17 | contradicted | contradicted | the deselected test is new, not pinned; unchanged |
| U21, U02, U06, U11, U14, U15, U23 | supported (unsafe) | unchanged | no base test covers the gap |
| Sets 1 to 3 | | to list from the case diffs before the bank step is built | each control that edits an old test body is a false-block risk |

Set 4 C, predicted:
- Right 13 → 15.
- Strict count: U09 and U10 may enter, if their patterns match the new reasons; not predicted
  here.
- Unsafe supported 8 → 7.

## Regression, arm C (18 Nov 2026, no model)

`score.mjs` on sets 1 to 4 (103 scored cases), the same recorded evidence, with app `main`
(b82f4c9) and with this branch.

| Set | Cases | Outcome changes | Reason changes |
|---|---|---|---|
| 1 | 39 | 0 | 1: I08 (no CI report) also says "head report missing" for the new check; still `cannot_verify` |
| 2 | 20 | 0 | 0 |
| 3 | 20 | 0 | 0 |
| 4 | 24 | 0 | 0 |

This matches the prediction: no recorded report has a `pinned` block, so the check is advisory
everywhere and no verdict changes. The predicted gains (U09, U20, U10) need the bank step and
rebuilt evidence. They are not shown here, and they are not claimed.

**Not done (next):**
- The bank CI step that writes the `pinned` block (`scripts/repro.py`, its own tests first).
- The rebuild of sets 1 to 4 with that step, and the case-by-case list of controls that edit an
  old test body.
- The panel action to approve a changed pin (`approvedTestChanges`, audited).
- Blind set 5 before any claim.

## Regression with the bank step (development evidence, 18 Nov 2026, no model)

**Bank step:** `scripts/pinned.py`, called from `scripts/repro.py` (bank branch
`feat/pinned-base-tests`).

**How the evidence was made:**
- The step ran locally on every case branch of sets 1 to 4 (the local benchmark clones).
- Its `pinned` block was added to each case's recorded CI report.
- Nothing else in the evidence changed. These are not new CI runs.
- Then `score.mjs` ran with app `main` (b82f4c9) and with this branch, on the same pinned
  evidence.

**Two bugs found on the real cases, both fixed in the bank step before scoring, tests first:**
1. A parametrized test has report ids `name[param]`. The first version read every parametrized
   base test as `not_run` (a false fail on almost every case). Now the worst outcome of its
   parameters counts.
2. The CI report step runs `-m "bench or not bench"`; the first version used the default marker
   selection, so a bench test (B28) was `not_run`. Now the same selection is used.

**Change after the results (development sets only).** In the first rule, an edited pinned test
whose base copy still passes gave `unknown`. On set 2 this held control S02: `supported` became
`cannot_verify`. That rule was my own addition, not part of the brief. It is not needed: the
protection is the base copy, and when the base copy passes on head, the old assertion still
holds. Now such an edit passes, and the reason names it. Before the change, set 2 had right
17 of 20 and S02 not supported. After it, the numbers are as in the table below.

**Result (after the change):**

| Set | Right (main → branch) | Controls not supported | Supported on a case that is not correct as supported | Cases that change |
|---|---|---|---|---|
| 1 | 35 → 35 of 39 | B28 → B28 | 1 → 1 | none |
| 2 | 18 → 18 of 20 | none → none | 2 → 2 | S16 cannot_verify → contradicted (`contradicted` is accepted for S16) |
| 3 | 12 → 13 of 20 | T13 → T13 | 5 → 4 | T14 supported → contradicted (caught) |
| 4 | 13 → 15 of 24 | U10 → none | 9 → 8 | U09 supported → contradicted (caught); U10 contradicted → supported (false block fixed); U20 cannot_verify → contradicted (better reason) |

Against the prediction written before the code: U09, U20 and U10 moved as predicted. T14 (set 3)
was not in the set 4 prediction, because sets 1 to 3 were not predicted case by case. No set is
worse on any count.

**Limits:**
- Sets 1 to 4 are development sets, and the rule was changed after seeing them.
- A claim needs blind set 5.
- The pinned blocks were made locally, not by CI.
- The approval action for a changed pin (`approvedTestChanges`) has no panel button yet.
