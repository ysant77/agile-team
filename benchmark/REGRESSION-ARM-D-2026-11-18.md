# Arm D regression of the trace change, 6d15a43 (18 Nov 2026)

**Question.** Does the trace change on `fix/harness-safety` (head 6d15a43) change any arm D result
on sets 1 to 3? Required: no case may differ from the 48165f5 run.

**Answer.** The trace change does not change any result. Against a run of 48165f5 on the same
day, no case differs in any field. Against the 48165f5 run of 17 Nov, 7 cases differ, but the
48165f5 code run again on 18 Nov shows the same 7 differences. The cause is the model run, not the
change.

## Runs

All runs: rule `blocking`, `qwen3-coder:30b` (digest 06c1097efce0), temperature 0, `num_ctx`
32768, seeds 1 to 3, the same `sf-*` C evidence (fresh copies for each run), the same manifests
and truth files, and the runner `benchmark/run/arm_d.mjs` of `main`. The Ollama server ran without
a restart from 10 Nov to 18 Nov, with no update.

| Run | Reviewer code | Day | Raw results |
|---|---|---|---|
| Old | 48165f5 | 17 Nov evening | `run/results/regression-2026-11-17/arm-d-48165f5/` |
| New | 6d15a43 (trace change) | 18 Nov, 15:30 to 16:00 SGT | `run/results/regression-2026-11-18/arm-d-6d15a43/` |
| Same-day old | 48165f5 | 18 Nov, 16:15 to 17:15 SGT | `run/results/regression-2026-11-18/arm-d-48165f5-same-day/` |
| A-B-A | 48165f5, then 6d15a43, then 48165f5, on B01, S04, T02 only | 18 Nov, 16:00 SGT | `run/results/regression-2026-11-18/aba/{a1,b,a2}/` |

Comparison: `python3 run/armd_trace_compare.py <old folder> <new folder>`. It compares each case:
C and D, and per run the D outcome, the review outcome, the guard, the blocking findings, the
input hash and the accepted record.

## Results

**New (6d15a43) against same-day old (48165f5): 0 differences.**

| Set | Cases | Model runs | Differences | Held or caught by D |
|---|---|---|---|---|
| 1 | 39 | 30 | 0 | B21 |
| 2 | 20 | 30 | 0 | S14 |
| 3 | 20 | 36 | 0 | T08, T12 |

**New against the 17 Nov old run: 7 cases differ.** The same 7 differ between the 17 Nov old run
and the same-day old run.

| Case | 17 Nov (48165f5) | 18 Nov (48165f5 and 6d15a43, identical) | D changes? |
|---|---|---|---|
| B01 (set 1) | guard `verdict-word` refuses the record | accepted, notes only | No: `supported` both days (unsafe both days) |
| S03 (set 2) | accepted | accepted, other text | No |
| S04 (set 2) | guard `ungrounded-id` refuses the record | accepted, no finding | No |
| S07 (set 2) | accepted | accepted, other text | No |
| S08 (set 2) | accepted | guard `verdict-word` refuses the record | No |
| T02 (set 3) | accepted, blocking finding "No check for limit = 0 or negative values." on AC1: **caught** | accepted, notes only: **missed** | **Yes**: `cannot_verify` on 17 Nov, `supported` on 18 Nov |
| T08 (set 3) | held | held, other text | No: held both days |

All other cases are identical on both days.

**A-B-A check.** On B01, S04 and T02, the model's tool calls are byte-identical across 48165f5,
6d15a43 and 48165f5 again, and across the full 18 Nov runs. All three differ from 17 Nov.

## What this means

1. **The trace change passes the regression.** On the same day and the same server, it gives the
   same model calls, the same records and the same D outcome on every case.
2. **Arm D is repeatable within a day, not across days.** At temperature 0 with fixed seeds, the
   three runs of a case agree, and two runs on the same day agree byte for byte. The same code
   on 17 Nov and 18 Nov gives other model text on 7 of 79 cases and another D outcome on one
   (T02). The server was not restarted or updated. A probable cause is that the model was
   unloaded and loaded again between the days; this is not proved.
3. **Effect on the 17 Nov numbers.** On 18 Nov, 48165f5 catches 47 of 52 invalid cases, not 48:
   T02 is missed. Controls held: 1 (B21) on both days.
4. **Rule for later regressions.** A regression compares the new code with the old code run on
   the same day, and it reports any difference against the earlier record as a model-run
   difference. The earlier record alone is not a valid baseline.
5. **Set 4.** Arm D on set 4 ran on 18 Nov, before these runs, on the same server. Its result is
   one draw of the model on that day.
