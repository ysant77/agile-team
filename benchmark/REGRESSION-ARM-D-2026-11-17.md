# Arm D regression record, 17 Nov 2026: reviewer at a3b8982 against d175960

Regression record only (development sets 1 to 3). Not evidence that a change works.

**Run.** Reviewer and guards at the PR 7 head a3b8982 (`agile-team-rev2`), rating rule
`blocking`, prompt `code-review/2`, model `qwen3-coder:30b` (digest 06c1097efce0), temperature 0,
`num_ctx` 32768, seeds 1 to 3, worst run decides. C evidence: the rebuilt evidence scored with PR 9
(scorer item 17), folders `sf-*`. Command (paths shortened):

    node run/arm_d.mjs --rev agile-team-rev2 --rule blocking --runs 3 --out <sf-set> \
      --manifest <set manifests> --results <sf-set>/results.json --truth <truth file> --log <out>

**Baseline.** d175960: `results/dev-reviewer-2/devd-1c.json`, `devd-2c.json`,
`results/set3/arm-d/arm-d.json`. The baseline C evidence is older, so a D change can come from C:
C differs on B17 (set 1), S13 and S18 (set 2), and on no set 3 case.

**Raw results:** `run/results/regression-2026-11-17/arm-d-a3b8982/set{1,2,3}/`. Comparison:
`python3 run/armd_compare.py run <folder>`.

| Set | Controls held (d175960 / a3b8982) | Unsafe supported (d175960 / a3b8982) | D changed |
|---|---|---|---|
| 1 (10 controls) | none / **B21** | B01 / B01 | B17 (C changed), **B21** |
| 2 (8 controls) | S02 / none | S09, S18 / S09, S14 | S02, S14, S18 (S18: C changed) |
| 3 (9 controls) | none / none | T02, T14, T23 / T02, **T08**, T14, T23 | **T08** |

Named cases:

- **S09:** supported in both (missed). All three runs gave an accepted review with no blocking
  finding.
- **S13:** `cannot_verify` in both. Now held by C (the evidence change), so the reviewer did not
  run.
- **T08:** caught at d175960, **missed now**. All three runs wrote the right blocking finding ("does
  not handle kind=debit"), but the review also proposed a check for AC1, which already has a code
  check. The new guard `ac-has-check` (`src/review.js` line 288) then refuses the whole review, so
  the finding is lost.
- **T12:** `cannot_verify` in both (held by an accepted review; the reason text was not re-checked against the set 3 recount).

New in this run:

- **B21 (control) held** in all three runs by two blocking findings with no content ("Finding 1:
  see P121:H3, line 62."). This is the known limit in `docs/claims.md`: the guard does not check
  that the text states a defect. Cause of the change from d175960 not yet found.
- **S14 unsafe supported:** C supports it on the new evidence, and D does not hold it.

**Policy breach (recorded by the lead, 17 Nov).** PRs 6 and 7 (the reviewer and its guards)
were merged before this arm D regression ran, because the model slot was busy. That is against the
regression policy (README, item 2). The result below shows the cost: the reviewer on `main`
(a3b8982 guards) is worse than the benchmarked d175960: T08 is missed and control B21 is held.

**Result under the regression policy (no worse on each count):** **worse** on set 1 (one control
held) and set 3 (one more unsafe supported). Set 2: one fewer control held; unsafe supported equal
(2), with a different case. The reviewer changes in PRs 6 and 7 are already merged. This record is
for the lead and the owner to decide on; no fix is made here.

## Why B21 changed (found 17 Nov, 17:40)

Same input hash in both runs; the model wrote the same first review (two blocking findings with
real text, "Code does not reject underscores or spaces in amount strings.", and a proposed check
for AC1). At d175960 the guard `test-exists` refused the whole review twice, so nothing held. At
a3b8982 the new guard `ac-has-check` runs first; its retry message made the model drop the
checks, the review passed every guard, the risk texts failed the style lint, and the style
fallback (unchanged) replaced the findings with "Finding 1: see P121:H3, line 62.", which held.
At d175960 the T08 catch was also shown as that template text (all three runs, style fallback).

## Decision (lead, 17 Nov): option (b), by principle

We choose guard behaviour by principle, not by which development cases it flips:

1. A guard that faults one part of a review (a proposed check) refuses that part only.
2. The hold decision uses the model's own guard-accepted finding text; the style fallback
   changes only what people see.
3. A finding whose model text has no defect statement (only a hunk or line reference) is refused
   as a finding.

The old guard order is not restored to save B21: at d175960 B21 passed only because another guard
refused the whole review, which was luck, and the T08 hold was shown to people as a template line,
which was not a real explanation.

**Consequences.** The d175960 set 3 result stands for that commit, but its "0 controls held"
rested partly on whole-review refusals. With these rules, the reviewer's real finding on B21
("does not reject underscores ...") will probably hold a clean control. That is the reviewer's
true behaviour and we report it.

**Acceptance for the next arm D regression (fixed before any run):** across sets 1 to 3, the total
of clean controls held by D is not more than at d175960 (1), and the total of catches of invalid
cases is not fewer than at d175960; T08 must be held with its real defect text shown. Every
case-level change is reported. If B21 is held and the total is still 1, it passes with the change
named. If the total rises, it fails and we stop and think, without another guard tweak.

Fix branch: `fix/reviewer-refuse-part-only` (failing tests 72d1f15, fix 35a9e60, local). The
model run waits for the slot.
