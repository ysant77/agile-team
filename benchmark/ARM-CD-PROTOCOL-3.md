# Protocol for arms A1, A2, C and D on set 3 (fixed 17 Nov 2026, before set 3 is read)

Set 3 is written by an independent author. This file and the commits below are fixed before the
builder opens the set 3 case file. Nothing here changes after a set 3 result is seen; a change
after that goes into `run/SCORER-CHANGES.md` with the result that came before it.

All cases run on a local mock: local branches of the bank, the CI commands run locally, and a
simulated GitHub in the scorer. No case runs on GitHub, Jira or Forge.

## Frozen code

| Part | Repository and branch | Commit |
|---|---|---|
| C (the app) | agile-team `fix/rules-after-set2` | 28e6647 |
| C arbitration (choice cases) | agile-team `feat/metric-median-gate` (main rule) | 0446918 |
| Reviewer (D) | agile-team `feat/reviewer-severity` | d175960 (prompt `code-review/2`, guard version 2) |
| Bank `scripts/repro.py` | yms-bank-demo `fix/repro-base-test-names` | 679c055 |
| Bank `scripts/changed_coverage.py` | yms-bank-demo `fix/coverage-unmeasured-files` | ba90b0f |
| Runner, scorer, summary, D harness | agile-team-bench `test/evidence-benchmark-set` | the commit of this file |

The runner copies the two bank scripts into each case tree (`--repro-script`,
`--coverage-script`).

## Arms

- **A1** and **A2**, **A2file**, **A2s**: the rules of `CASES.md` section 1, as for sets 1 and 2.
  A cancelled CI run on the head is scored **both ways**: (1) `blocked` (the frozen reading; a
  cancelled required check blocks the merge), (2) `human gate` (the run gave no result and waits
  for a re-run), only when the cancellation is the sole reason. Both tables are reported.
  Reading (1) is the primary.
- **C**: the app's `decide()` on the simulated GitHub of each case.
- **D**: C plus the reviewer, on each case where C is `supported`. Elsewhere D equals C.
  - Model `qwen3-coder:30b`, Ollama digest 06c1097efce0 (on the machine; no download),
    temperature 0, num_ctx 32768, seeds 1, 2 and 3 (three runs per case), at most 8 model turns.
  - Prompt: the `reviewer-agent` prompt in `manifest.yml` at d175960, as the system message; user
    message "Review pull request <n> on <key>". Tools `get-pr-diff`, `record-review` (the app's
    guards and gate, one retry), `get-verdicts`.
  - Rating rule (`--rule blocking`, `blockingFindings`): a run gives `cannot_verify` when the
    accepted review has at least one finding with severity `blocking` and an AC id of the ticket.
    The guards refuse a blocking finding without an AC, with an unknown AC, or one that only
    quotes changed code. A note never holds a claim. A refused review leaves C's result.
  - Worst run decides: for a case whose correct outcome is `supported`, D is `cannot_verify` if
    any run gives it; for every other case, D catches the case only if all three runs give
    `cannot_verify`. Each run is reported.

## Truth, predictions and strict reasons

- Truth comes from the set 3 case file, copied into `run/truth-3.json` with the predictions, before
  any build.
- For each case whose correct outcome names an item ("with X named"), `truth-3.json` gets a
  `reason` regular expression for that item, written from the case text before any run. Every
  results table shows the outcome count and, beside it, the strict count (outcome right and the
  reason matches).

## Pre-set condition for D

D passes when both hold on set 3:

1. D catches at least one weak-test case that C misses (an invalid claim, with green CI and a
   test that passes, that C supports and D holds in all three runs).
2. D holds at most one clean control more than C (a control that C supports and D holds in any
   run).

## Commands

```
python run/run_all.py --out <dir> --main-report <dir>/BASE/report.json \
  --case-set <bench-bank-3>:<manifest> --repro-script <rb>/scripts/repro.py \
  --coverage-script <cov>/scripts/changed_coverage.py
node run/score.mjs --app <fix2> --app-main <u3> --out <dir> --manifest <manifest>
node run/arm_d.mjs --rev <rev2> --rule blocking --out <dir> --manifest <manifest> \
  --results <dir>/results.json --truth run/truth-3.json --runs 3 --log <dir>/arm-d
python run/summarize.py <dir>/results.json run/truth-3.json [--cancelled-as-pending]
```
