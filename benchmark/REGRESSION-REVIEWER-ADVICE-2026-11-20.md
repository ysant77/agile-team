# Regression: the reviewer as advice only (20 Nov 2026)

Owner decision, 20 Nov 2026, item 1: the model reviewer is advice only. It never changes a verdict.
A review still never approves. This file records what made the reviewer blocking before, what
changed, and the regression figures. No model ran for this file.

## What made the reviewer blocking before

| Where | What it did | Switch |
|---|---|---|
| `src/verify-claim.js`, `decide()` | After the code checks, it read the stored reviews and called `applyReviewHold` (`src/review-hold.js`). A supported `ready`, `fixed` or `done` claim became `cannot_verify` when an accepted review for the head commit had a blocking finding with an AC | none: it ran on every supported claim with a head commit, and no config turned it off |
| `src/verdict-view.js` | A `cannot_verify` record with `reviewHold` showed the state "Held by review" | none: it followed the stored record |
| `benchmark/run/arm_d.mjs` | The bench arm D made D `cannot_verify` on a finding | the `--rule` option: `any-finding` (default, set 2) or `blocking` (sets 3 to 5) |

## What changed

- `src/review-advice.js` (renamed from `src/review-hold.js`): `withAdvice` adds the advice to a
  verdict and does not touch the result, the reason or the checks. There is no hold function.
- Each accepted finding carries `quote`: the changed line it points at, taken from the packet by
  code. The schema drops any quote that the model sends.
- The verdict comment and the panel show each finding with its hunk, file, line and quoted line,
  under "Advice from a model, not counted". The checker line always says that no model decided
  the verdict.
- The verdict record stores `advice` on the newest verdict only. An older record with
  `reviewHold` shows its stored result, with a line that says an older checker held it.
- `arm_d.mjs` has no `--rule` option. D is always C's outcome; the runs store the advice.
- To make the reviewer blocking again needs a code change, and `test/review-advice.test.js` fails
  on it: the test reads `src/verify-claim.js` and `arm_d.mjs`, and checks that every verdict has
  the same result, reason and checks with and without a review.

## Figures

**Arm C, sets 1 to 5** (`score.mjs` on main c12ae23 against this branch, the pinned evidence of
18 Nov for sets 1 to 4 and the set 5 evidence of 19 Nov):

| Set | Result records | Records that differ | Right (main, branch) |
|---|---|---|---|
| 1 | 40 | 0 | 35, 35 |
| 2 | 20 | 0 | 18, 18 |
| 3 | 24 | 0 | 13, 13 |
| 4 | 24 | 0 | 15, 15 |
| 5 | 24 | 0 | 16, 16 |

Each `results.json` is byte-identical between main and the branch. Arm C never read a review, so
this shows that the change does not touch the code checks.

**Stored arm D records of set 5, re-scored** (`run/rescore_arm_d.mjs`, no model call; output
`run/results/set5/arm-d-advice-rescore.json`). For each of the 30 stored runs, the script rebuilt
the packet from the evidence, replayed the model's stored `record-review` calls through the guards
and the gate, and applied `withAdvice`:

- The packet hash and the guard outcome equal the stored ones in all 30 runs.
- D equals C on all 24 cases (0 records differ), with the same reason.
- V03 and V16 (controls) were `cannot_verify` under the old rule; they are `supported` again.
- Right: C 16, stored D 14, re-scored D 16 of 24.
- The 30 runs give 33 advice items. A refused review (V02, V05, V09, V10, V12) gives none.

What this costs: under the old rule, D held 0 of the 4 unsafe cases of set 5 (V02, V09, V12, V18)
and 2 controls (V03, V16). Under advice only, D holds nothing. The unsafe cases stay `supported`
as in C. On V18 the advice is two notes that describe the change; on the others the review was
refused, so there is no advice.

## Commands

```
node run/rescore_arm_d.mjs --app <this checkout> --out run/evidence/set5-2026-11-19 \
  --manifest run/manifests/bench-manifest-5.json --log run/results/set5/arm-d \
  --truth run/truth-5.json --write run/results/set5/arm-d-advice-rescore.json
node run/score.mjs --app <checkout> --app-main <checkout> --out <copy of the evidence> --manifest <set manifest>
```
