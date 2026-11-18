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

## Runs

Pending: the model slot. Commands: as in `REGRESSION-ARM-D-2026-11-18.md`, with `--rev` set to
this branch; set 4 with the frozen set 4 runner and its C evidence.
