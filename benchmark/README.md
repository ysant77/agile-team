# Evidence benchmark

Three case sets test the claim verifier (arm C) and the Code Reviewer (arm D) against standard
GitHub rules (A1) and hardened GitHub rules (A2). All runs are local: local branches of the bank,
CI commands run locally, and a simulated GitHub in the scorer.

| Set | Cases | Results | Status |
|---|---|---|---|
| 1 | `CASES.md`, `CASES-INDEPENDENT.md` (39 scored) | `RESULTS.md`; development re-score `DEV-RESCORE-SET1.md` | development |
| 2 | `CASES-2-INDEPENDENT.md` (20) | `RESULTS-2.md`, `RESULTS-2-ARM-D.md` | development |
| 3 | `CASES-3-INDEPENDENT.md` (20 built, 4 void) | `RESULTS-3.md` | development from 17 Nov 2026 |

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
4. Sets 1 to 3 are development sets. Their results were seen before the fixes, so they show
   regressions only. They are not evidence that a fix works.
5. The fix list in `RESULTS-3.md` is scored on a new blind set before the soft freeze near
   16 Dec 2026. That set follows the set 3 rules: protocol committed before the case file is
   opened, predictions and truth before any build, void cases recorded before any run, no change
   to rules, reviewer, prompt or scorer after the file is opened.
6. Frozen files stay byte-identical. A scorer change is logged in `run/SCORER-CHANGES.md` and
   never rescores a result file silently.
