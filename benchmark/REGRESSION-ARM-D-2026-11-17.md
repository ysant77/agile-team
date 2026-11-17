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

**Result under the regression policy (no worse on each count):** **worse** on set 1 (one control
held) and set 3 (one more unsafe supported). Set 2: one fewer control held; unsafe supported equal
(2), with a different case. The reviewer changes in PRs 6 and 7 are already merged. This record is
for the lead and the owner to decide on; no fix is made here.

Proposed fix direction (not built): `ac-has-check` drops only the proposed check, not the whole
review; and a blocking finding needs text beyond a hunk reference. Both need failing tests first
and a new no-worse check on sets 1 to 3.
