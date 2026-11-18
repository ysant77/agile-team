# Protocol for arms A1, A2, C and D on blind set 4 (fixed 18 Nov 2026, before set 4 is read)

First commit 085365d. Amended once, also before the case list was read: pattern matching, void
rule, arguable cases.

Set 4 is written by an independent author, outside this repository. This file is committed
before the builder sees any set 4 case. Nothing here changes after a set 4 result is seen. A
change after that goes into `run/SCORER-CHANGES.md` with "seen set 4 results: yes", and both the
result before and the result after the change are reported.

All cases run on a local mock:
- local branches of the bank;
- the CI commands run locally;
- a simulated GitHub and Jira in the scorer.

No case runs on GitHub, Jira or Forge.

## Order of work

1. This protocol is committed.
2. The case list is released by the lead.
3. Predictions are made, before any build:
   - The truth is copied into `run/truth-4.json`: the correct outcomes and the strict `reason`
     patterns, written from the case text.
   - The builder's prediction per case and per arm goes into `PREDICTIONS-4.md`.
   - Both are committed.
4. The case branches are built in a new local clone of the bank, `bench-bank-4`, and the
   manifest goes in `run/manifests/bench-manifest-4.json`. `BUILD-4.md` records every point
   where the case text left a choice to the builder. Committed before any arm runs.
5. Arms A1 and A2, then C, then D.
6. `RESULTS-4.md`. Nothing changes after the results.

## Frozen code

| Part | Repository | Commit |
|---|---|---|
| C (the app, `--app` and `--app-main`) | agile-team `main` | 227ffbb |
| Reviewer (D, `--rev`) | agile-team `fix/reviewer-refuse-part-only` (app PR 13 head) | 48165f5: prompt `code-review/2`, guard version 6 |
| Bank `scripts/repro.py` and `scripts/changed_coverage.py` | yms-bank-demo `main` | 00167dd |
| Runner, scorer, summary, D harness | agile-team `test/blind-set-4` | the commit of this file (`benchmark/run` is byte-identical to `main` 227ffbb) |

Notes:
- If PR 13 merges before arm D runs, D still uses the 48165f5 checkout. The merge does not
  change the reviewer files, and this is checked with a file comparison before the run.
- The tool-call checks of `fix/harness-safety` (scorer change 18) are not in the frozen runner.
- The runner copies the two bank scripts into each case tree (`--repro-script`,
  `--coverage-script`).
- The simulated Jira and GitHub follow scorer change 17.

## Arms

- **A1 and A2:** the rules of `CASES.md` section 1, as for sets 1 to 3. The variants A2file
  and A2s are reported as in set 3.
  - A cancelled CI run on the head is scored both ways, as in set 3. Reading (1), `blocked`, is
    the primary reading.
- **C:** the app's `decide()` on the simulated GitHub and Jira of each case.
- **D:** C plus the reviewer, on each case where C is `supported`. On every other case, D equals C.
  - Model `qwen3-coder:30b`, Ollama digest 06c1097efce0 (already on the machine; no download).
  - Settings: temperature 0, num_ctx 32768, seeds 1, 2 and 3 (three runs per case), at most 8
    model turns.
  - Prompt: the `reviewer-agent` prompt in `manifest.yml` at 48165f5. Tools: `get-pr-diff`,
    `record-review` (the app's guards and gate, one retry) and `get-verdicts`.
  - Rating rule `--rule blocking` (`blockingFindings` at 48165f5): a run gives `cannot_verify`
    when the accepted record has at least one guard-accepted finding that meets all of these:
    - its severity is `blocking`;
    - it has an AC id of the ticket;
    - it states a defect.
  - **Worst of three runs decides:**
    - For a case whose correct outcome is `supported`, D is `cannot_verify` if any run gives it.
    - For every other case, D catches the case only if all three runs give `cannot_verify`.
    - Each run is reported.

## Truth and strict reasons (amended 18 Nov, before the case list is read)

- The case list is copied unchanged into `benchmark/CASES-4-INDEPENDENT.md`. Its sha256 is
  checked against the value the lead gave and recorded in `PREDICTIONS-4.md`.
- The correct outcome of each case is the outcome the list states. The `Why:` part of the last
  column is not scored; it is only read to build the case.
- **Pattern matching (strict count).** The last column of a case can have a `Pattern:` part. The
  writer did not know the scorer, so the text is read like this:
  1. The pattern text is everything after `Pattern:` up to `Why:` or the end of the cell.
     Wrapping quotes or backticks around the whole text or around one alternative are removed.
  2. The text is divided at each `|` into alternatives. Each alternative is trimmed.
  3. An alternative is **plain text, not a regular expression**. Every character is literal,
     and a run of white space matches any run of white space.
  4. A reason matches when **any one** alternative is found in it, with case ignored
     (`re.search` with `re.I`).
  5. In `truth-4.json` the `reason` field is the escaped alternatives joined by `|`. This is
     made by a script from the list, not by hand. The script and its output are committed with
     the predictions.
  6. A case with no `Pattern:` part has no strict condition: its strict count equals its outcome
     count.
- The strict count uses each arm's own reason. An arm that gives no reason text cannot match a
  pattern.
- Every results table shows the outcome count and, beside it, the strict count. A strict count
  needs the outcome to be right and the reason to match.

## Void rule (fixed before the case list is read)

- A case is void only when it cannot be built as written on `bench-base` (bank `main` 00167dd)
  without changing a fact that the case states. Examples: the base already has the change, a
  stated test cannot fail on base, or a stated file or name cannot exist as stated. A seed
  commit on the case base is allowed when the case text allows it or needs it, as in set 3.
- Each void is recorded in `BUILD-4.md` with the concrete reason, checked against the base
  before it is recorded. The void list is committed before any arm runs. No case is voided
  after an arm result is seen.
- Being hard to build, or the time limit, is not a reason to void. A case that is not built by
  the hard stop (21:00 SGT, 18 Nov) is reported as **not built**. It is not scored and not void.
- A case that needs a facility the local mock does not have (for example two CI attempts on one
  head, or a CI setting that deselects tests) is simulated in the same way as in sets 2 and 3,
  when such a simulation exists in the runner. If none exists, the case is not built. It is not
  void, and the reason is recorded.

## Arguable cases

The lead names U07, U12, U16, U18 and U24 as arguable. They are scored like every other case.
Every results table is given twice: over all scored cases, and over the scored cases without
the arguable ones. The pre-set conditions are judged on both tables, and both judgements are
reported.

## Pre-set conditions (reported as met or not met; no condition is changed after the results)

For C:
1. Unsafe supported (an invalid case that C gives as `supported`): reported per case, with the
   cause.
2. False block on a clean control (a control that C does not support): reported per case.

For D, against C on the same cases:
1. D catches at least one weak-test case that C misses. Such a case is an invalid claim, with
   green CI and a passing test, that C supports and D holds in all three runs.
2. D holds at most one clean control more than C. Such a control is one that C supports and D
   holds in any run.
3. Every control that D holds is reported with the model's finding text. The hold reason must
   carry the model's text, not a template line.

Development sets 1 to 3 are not scored again here. Set 4 is the only evidence for these
conditions.

## Commands

```
python run/run_all.py --out <dir> --main-report <dir>/BASE/report.json \
  --case-set <bench-bank-4>:run/manifests/bench-manifest-4.json \
  --repro-script <bank main 00167dd>/scripts/repro.py \
  --coverage-script <bank main 00167dd>/scripts/changed_coverage.py
node run/score.mjs --app <agile-team 227ffbb> --app-main <agile-team 227ffbb> --out <dir> \
  --manifest run/manifests/bench-manifest-4.json
node run/arm_d.mjs --rev <agile-team 48165f5> --rule blocking --runs 3 --out <dir> \
  --manifest run/manifests/bench-manifest-4.json --results <dir>/results.json \
  --truth run/truth-4.json --log <dir>/arm-d
python run/summarize.py <dir>/results.json run/truth-4.json [--cancelled-as-pending]
```
