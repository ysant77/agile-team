# Evidence benchmark

Five case sets test the claim verifier (arm C) and the Code Reviewer (arm D) against standard
GitHub rules (A1) and hardened GitHub rules (A2). All runs are local: local branches of the bank,
CI commands run locally, and a simulated GitHub in the scorer. From 20 Nov 2026 the reviewer is
advice only: arm D gives the arm C outcome and stores the advice
(`REGRESSION-REVIEWER-ADVICE-2026-11-20.md`).

| Set | Cases | Results | Status |
|---|---|---|---|
| 1 | `CASES.md`, `CASES-INDEPENDENT.md` (39 scored) | `RESULTS.md`; development re-score `DEV-RESCORE-SET1.md` | development |
| 2 | `CASES-2-INDEPENDENT.md` (20) | `RESULTS-2.md`, `RESULTS-2-ARM-D.md` | development |
| 3 | `CASES-3-INDEPENDENT.md` (20 built, 4 void) | `RESULTS-3.md` | development from 17 Nov 2026 |
| 4 | `CASES-4-INDEPENDENT.md` (24) | `RESULTS-4.md` | development |
| 5 | `CASES-5-INDEPENDENT.md` (24, 10 controls) | `RESULTS-5.md`, `RESULTS-5-ARM-D.md` | blind on 19 Nov; development from 20 Nov 2026 |

Set 5, the last blind run (protocol `PROTOCOL-5.md`):

- **Arm C, C1 not met:** 3 false blocks on controls (V07 coverage floor, V13 measurement path,
  V17 a renamed test read as removed), and V23 as a build dispute. The owner keeps the three
  rules as they are (20 Nov).
- **Arm C, C6 met:** 0 unsafe `supported` in the high-stake classes. C2, C3 and C5 are met; C4
  is met on 24 cases (14, 58.3%), not on the 19 that are not arguable (11, 57.9%). Right: 16 of 24.
- **Arm D, D1 and D2 not met:** the old hold caught 0 of 4 unsafe cases and held 2 controls
  (V03, V16). Right: 14 of 24.

Discovery (Mode B) has its own protocols and two rounds, both **not met**
(`RESULTS-DISCOVERY-1.md`, `RESULTS-DISCOVERY-2.md`). Discovery gives a grounded, unconfirmed
lead that a person classifies; it is not a defect finder.

Runner and scorer: `run/` (`run_all.py`, `run_ci.py`, `score.mjs`, `summarize.py`, `arm_d.mjs`).
Every change to the runner or the scorer is in `run/SCORER-CHANGES.md`.

## Regression policy (owner direction, 17 Nov 2026)

1. Benchmark rounds stop for now. The three sets and the runner stay as a regression check.
2. A change to a verifier rule or to the Code Reviewer (prompt, guards, rating rule) merges only
   when its PR shows a result on sets 1, 2 and 3 that is no worse than the result on `main`.
   "No worse" applies to each of these counts on each set: unsafe supported, false block, false
   `cannot_verify` on controls, right (outcome) and right (strict reason).
3. The PR body gives the command, the commit of the app, and the table for each set. A worse
   count on any set blocks the merge, unless the owner accepts it in writing in the PR.
4. Sets 1 to 3 are development sets. The blind evidence is set 2 for C as frozen (fe77128) and
   set 3 for C with the set 2 fixes and for D (6545290, 17c4762). Their results were seen before the fixes, so they show
   regressions only. They are not evidence that a fix works.
5. The fix list in `RESULTS-3.md` is scored on a new blind set before the soft freeze near
   16 Dec 2026. That set follows the set 3 rules: protocol committed before the case file is
   opened, predictions and truth before any build, void cases recorded before any run, no change
   to rules, reviewer, prompt or scorer after the file is opened.
6. A change to the Code Reviewer (prompt, guards, rating rule, style gate or template) merges
   only after the arm D regression on sets 1 to 3 has run on the PR head and is no worse than
   the benchmarked reviewer (d175960) on controls held and on catches. There is no exception
   when the model slot is busy: the PR waits for the slot. (Added 17 Nov 2026 after PRs 6 and 7
   merged before their arm D regression; see `REGRESSION-ARM-D-2026-11-17.md`.)
7. Frozen files stay byte-identical. A scorer change is logged in `run/SCORER-CHANGES.md` and
   never rescores a result file silently.

## Regression policy (owner direction, 20 Nov 2026)

This replaces items 2, 4 and 6 above where they differ.

1. Set 5 is a development set. The verifier freeze is lifted.
2. A change to a verifier rule merges only when its PR shows a result on sets 1 to 5 that is no
   worse than `main`, by the counts of item 2 above.
3. The reviewer is advice only. A reviewer change must keep arm D equal to arm C on every case;
   `test/review-advice.test.js` checks that a review never changes a verdict.
4. A new claim about the verifier needs a new blind set, run under the set 3 rules (item 5 above).
