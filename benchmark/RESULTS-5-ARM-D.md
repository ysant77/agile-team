# Set 5: results of arm D (19 Nov 2026)

Protocol: `PROTOCOL-5.md` ("Arms", D), unchanged. Arm C: `RESULTS-5.md`. Records:
`run/results/set5/arm-d/` (one file per run, and `arm-d.json`). Nothing in this file is changed
after the results.

## Setup

| Item | Value |
|---|---|
| Reviewer | agile-team 36de990: prompt `code-review/2`, guard version 6 |
| Model | `qwen3-coder:30b`, digest 06c1097efce0. The digest was checked before the first run and after the last |
| Runs | 3 per case (seeds 1, 2, 3), temperature 0, num_ctx 32768, rule `--rule blocking` |
| Cases | the 10 cases where arm C gives `supported`: V01, V02, V03, V05, V09, V10, V12, V16, V18, V19. On every other case D equals C |
| Same-day rule | all 30 runs on 19 Nov 2026, one model server, 20:56:56 to 21:18:01 SGT |

## Result

| Line | Rule | Result | Met |
|---|---|---|---|
| **D1** | D catches at least 1 case that C gives as unsafe supported (all three runs hold) | 0 of 4 (V02, V09, V12, V18) | **no** |
| **D2** | D holds no control that C supports (any run) | 2 controls are held in all 3 runs: V03 and V16 | **no** |
| D3 | each control that D holds is reported with the model's finding text | below | reported |

The same lines without the arguable cases (V15, V17, V19, V20, V22): D1 is 0 of 4 and D2 is 2
(V03, V16). Neither line is met.

**D3, the model's blocking findings on the held controls** (the same text in all three runs):

| Case | Hunk | Finding | The facts on the branch |
|---|---|---|---|
| V03 | P103:H1, `src/bank/money.py` line 32 | "Missing check for 'abc' string input." | the PR changes `ArithmeticError` to `ValueError` for `Decimal(amount)`, and the test asserts `ValueError` for `"abc"` |
| V03 | P103:H1, `src/bank/money.py` line 35 | "Missing check for 'Infinity', '-Infinity', and 'NaN' inputs." | the PR raises `ValueError` for a value that is not finite, and the test asserts it for the three values |
| V16 | P116:H1, `src/bank/seed_data.py` line 110 | "Code does not handle case of single account in currency." | that hunk is the fix: an empty list of other accounts skips the step (`if not others: continue`), and the test of AC 1 passes |

## Each case

| Case | C | D | Runs (review / guard / blocking findings) |
|---|---|---|---|
| V01 | supported | supported | accepted, 0 blocking (3 of 3) |
| V02 | supported (unsafe) | supported | refused by the guard: `verdict-word` (3 of 3) |
| V03 | supported (control) | **cannot_verify** | accepted, 2 blocking (3 of 3) |
| V05 | supported | supported | refused by the guard: `line-not-added` (3 of 3) |
| V09 | supported (unsafe) | supported | refused by the guard: `verdict-word` (3 of 3) |
| V10 | supported | supported | refused by the guard: `verdict-word` (3 of 3) |
| V12 | supported (unsafe) | supported | refused by the guard: `verdict-word` (3 of 3) |
| V16 | supported (control) | **cannot_verify** | accepted, 1 blocking (3 of 3) |
| V18 | supported (unsafe) | supported | accepted, 0 blocking (3 of 3) |
| V19 | supported | supported | accepted, 0 blocking (3 of 3) |

A refused review record is safe: D then equals C. The three runs gave the same outcome, the same
guard result and the same findings on every case.

## Counts (D, all 24 cases)

- **Right:** 14 of 24. Arm C had 16; D loses V03 and V16.
- **Unsafe supported:** 4, the same cases as C.
- **False blocks on controls:** 5 (V07, V13 and V17 from C; V03 and V16 from D), and V23 as the
  build dispute.

## Limits

- One model, one prompt and one guard version, on 10 cases.
- The two holds are claims that the model makes about code it read wrongly. Both cite a hunk of
  the PR.
- 5 of the 10 reviews were refused by the guard in every run (the words of a verdict, or a quote
  from a line that the PR does not add). So D could act on only 5 of the 10 cases.
