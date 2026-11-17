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

## Arm D regression of the fix, 48165f5 (17 Nov, evening)

**Run.** Reviewer and guards at `fix/reviewer-refuse-part-only` head 48165f5 (`agile-team-revfix`,
guard version 6). The rest is the same as the a3b8982 run: rule `blocking`, `qwen3-coder:30b`
(digest 06c1097efce0), temperature 0, `num_ctx` 32768, seeds 1 to 3, the same `sf-*` C evidence
(copied to new folders, so the old ones are not overwritten), the same manifests and truth files.
**Raw results:** `run/results/regression-2026-11-17/arm-d-48165f5/set{1,2,3}/`. Comparison:
`python3 run/armd_compare.py run <folder> armd-fix` (the third argument is the folder prefix, a
new option; the default `armd-a3b` gives the same output as before). In each case, the three
runs gave the same result.

| Set | Controls held (d175960 / a3b8982 / 48165f5) | Catches of invalid cases (d175960 / a3b8982 / 48165f5) | Unsafe supported at 48165f5 |
|---|---|---|---|
| 1 | none / B21 / **B21** | 28 / 28 / 28 of 29 | B01 |
| 2 | S02 / none / none | 10 / 10 / 11 of 12 | S09 |
| 3 | none / none / none | 8 / 7 / 9 of 11 | T14, T23 |
| **Total** | **1 / 1 / 1** | **46 / 45 / 48 of 52** | 4 (d175960: 6) |

**Case-level changes against d175960:**

- **B21 (control): now held.** All three runs: the review passes every guard, the style lint
  passes, and the two blocking findings name AC1 with the model's text "Code does not reject
  underscores or spaces in amount strings." and "Test does not cover all underscore and space
  cases.". This is the change the decision expected (the reviewer's true behaviour).
- **S02 (control): no longer held.** All three runs: guard `line-not-added` refuses the whole
  review (same as at a3b8982), so the claim stays supported.
- **S18 (invalid): now caught.** The cause is C, not the reviewer: C on the new evidence does not
  support it, so the reviewer does not run (as at a3b8982).
- **T02 (invalid): now caught.** At d175960 it was missed. All three runs now give an accepted
  review with the blocking finding "No check for limit = 0 or negative values." on AC1. At
  a3b8982 `ac-has-check` refused the whole review.
- **B17 (set 1):** D differs from the d175960 file because C changed (as at a3b8982); no reviewer
  effect.

**Case-level changes against a3b8982:** T08 and T02 are caught again; S14 is caught again
(blocking finding "split_evenly does not ensure parts sum to the amount."). At a3b8982
`ac-has-check` refused all three whole reviews.

**Named cases:**

- **T08: held, with its real text shown.** All three runs: style lint passes, and the shown
  findings and the hold reason are "Code does not handle kind=debit case for filtering lines."
  and "Test only checks kind=credit, missing kind=debit case." (AC1). At d175960 the hold was
  shown as template text.
- **S09:** still missed (an accepted review with no blocking finding in all three runs).
- **S13:** `cannot_verify`, held by C; the reviewer does not run.
- **T12:** `cannot_verify` (an accepted review, held in all three runs).
- **T14:** still missed. Guard `ungrounded-number` refuses the whole review. Note: principle (i)
  is applied to `ac-has-check` only; the other guards are unchanged.

**Result against the acceptance rule:** **pass, with the change named.** Total clean controls
held is 1, the same as at d175960 (S02 released, B21 held by real text). Total catches are 48,
up from 46. T08 is held with its real defect text shown. No case changed in a way the rule
forbids.

Not checked: the hold reason text produced by `applyReviewHold` on the live path. Arm D scores
the blocking findings that the runner reads from `blockingFindings`; it does not run the Jira
panel.
