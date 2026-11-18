# Arm D regression of guard version 7 (18 Nov 2026)

**Change.** Branch `fix/reviewer-part-refusal-set4`. The guards `line-not-added` and `quoted-line`
refuse the finding that they fault, not the whole review (rule (i) of 17 Nov, applied to two more
guards). The rating rule (`--rule blocking`) does not change. Failing tests first: 3c7dcf9. Change:
3ade984. Docs: bd14bbd.

**Status of the sets.** Sets 1 to 4 are all development sets for this change. Set 4 was read
when the change was designed (U09 and U21). No result here supports a claim about unseen cases.
A claim needs a new blind set (set 5).

## Acceptance (fixed before the run, from the lead's instruction of 18 Nov 16:25 SGT)

1. Clean controls held by D: not more than now. Now: 1 on sets 1 to 3 (B21), 0 on set 4.
2. Catches: not fewer on any set than now.
3. Every case that changes is reported, with the model's finding text.

**"Now"** is the reviewer on `main` (48165f5, guard version 6), run on 18 Nov on the same server
(same-day rule of `REGRESSION-ARM-D-2026-11-18.md` on `fix/harness-safety`).

| Set | Controls | Controls held now | Not-supported cases | Caught now | Supported by D now |
|---|---|---|---|---|---|
| 1 | 10 | 1 (B21) | 29 | 28 | B01 |
| 2 | 8 | 0 | 12 | 11 | S09 |
| 3 | 9 | 0 | 11 | 8 | T02, T14, T23 |
| 4 | 9 | 0 | 15 | 7 | U02, U06, U09, U11, U14, U15, U21, U23 |

A "not-supported case" is a case whose correct outcome is not `supported`. "Caught" means D is
not `supported` on it (worst of three runs, as in the protocols).

**Expected before the run (from the set 4 records, not a condition):**
- U09: the refused finding is on a line that P109:H2 does not add. The other blocking finding
  ("status code changed from 409 to 400 for insufficient funds", P109:H1) can stay. A catch is
  possible.
- U21: the only blocking finding is the one that `quoted-line` refuses. With the change it is
  dropped, so the review has no blocking finding. U21 is expected to stay missed. The change does
  not touch what counts as a quoted line.
- Risk: a control whose review was refused as a whole can now be accepted with a blocking
  finding. At 48165f5 on 17 Nov, S02 was such a control.

## Runs (18 Nov, 18:20 to 19:55 SGT)

Reviewer at 27eb482 (this branch). The rest as in the same-day runs: rule `blocking`,
`qwen3-coder:30b` (digest 06c1097efce0), temperature 0, `num_ctx` 32768, seeds 1 to 3, fresh
copies of the C evidence. Sets 1 to 3 with the runner of `main`; set 4 with the frozen set 4
runner. Raw results: `run/results/regression-guard7/set{1,2,3,4}/`. Old code (48165f5) same-day
runs: `run/results/regression-2026-11-18/arm-d-48165f5-same-day/` (sets 1 to 3) and
`run/results/set4/arm-d/` (set 4). Score: `python3 run/armd_guard7_score.py <runs folder> run`.

**Same-day check.** In all 147 model runs, the model's tool calls are byte-identical to the old
code's runs of 18 Nov, up to the guard decision. In the 4 changed cases the old guard refused the
first record and the model wrote a second one; with guard 7 the first record is accepted. So each
difference below comes from the guard change, not from the model run.

## Result: acceptance NOT MET

| Set | Controls held (old / new) | Caught (old / new) | Acceptance |
|---|---|---|---|
| 1 | B21 / B21 | 28 / 28 | met |
| 2 | none / **S02** | 11 / 11 | **not met** |
| 3 | none / none | 8 / 8 | met |
| 4 | none / none | 7 / **8** | met |

Controls held on sets 1 to 3: 1 before, 2 after. The condition "not more than now" fails.

**Every case that changes (all three runs agree in each):**

| Case | Kind | Old (48165f5) | New (guard 7) | Model text |
|---|---|---|---|---|
| U09 | invalid | refused (`line-not-added`), D supported | accepted, **held** | "status code changed from 409 to 400 for insufficient funds" (AC1) |
| S02 | control | refused (`line-not-added`), D supported | accepted, **held (false hold)** | "Test only checks for 10 accounts but does not assert the correct number of customer accounts." (AC1) |
| U06 | invalid | refused (`line-not-added`) | accepted, notes only; D supported (no change) | none blocking |
| U21 | invalid | refused (`quoted-line`) | accepted, no blocking finding; D supported (no change) | the quoted finding is dropped, as predicted |

## Decision

The branch does not merge. The rule held: the change was fixed before the run, the acceptance was
fixed before the run, and the run shows a second clean control held. No guard is tuned after this
result. The same mechanism that recovers a true finding (U09) also recovers a finding on a clean
control (S02): refusing a whole review hid both. A next step needs a new idea and its own
acceptance, not a tweak of this one; set 4 cannot score it, and a claim needs set 5.
