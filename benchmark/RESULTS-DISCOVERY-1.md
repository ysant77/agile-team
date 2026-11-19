# Discovery, round 1: results (19 Nov 2026)

Protocol: `DISCOVERY-PROTOCOL.md`, unchanged. Records: `run/results/discovery-1/`.

## Setup

| Item | Value |
|---|---|
| Harness | agile-team c5651e7 (`bakeoff/run.js`, `bakeoff/tasks/discovery.js`, `src/discovery.js`) |
| Model | `qwen3-coder:30b`, digest `06c1097efce0` (checked in each record) |
| Runs | repeats 1, 2, 3 (seeds 11, 12, 13), temperature 0.6, context 16,384 |
| Investigated tree | `investigate/symptoms` at 45a211d |
| Cases | the lead's file `discovery-cases-1.json`, sha256 `d22c0e32...cd422`, not edited |

There was no transport failure and no timeout, so no run was made again. The chain file holds
11 events: the model start, 9 task results, and the unload.

## Result: the pass rule is not met

| Case | Truth | Runs that pass | Rule | Met |
|---|---|---|---|---|
| D-1 | race (`src/bank/ledger.py`) | 0 of 3 | at least 2 of 3 | no |
| D-2 | hidden button (`src/bank/web/app.css`) | 0 of 3 | at least 2 of 3 | no |
| D-3 | none (control) | 3 of 3 with no invented defect | 3 of 3 | yes, by score; see below |

**Main fact: no run recorded a finding.** In all 9 runs `finding` is null. Each run made 2 to
10 `record-finding` attempts, and the harness refused each attempt. A defect run cannot score
without a recorded finding, so all six defect runs score 0. This is true also when the final text
names the right cause and the right file.

## Each run

The counts are: tool calls, refused calls, GitHub reads, `record-finding` attempts.
No finding was recorded, so the "finding text" of each run is the model's final text. It is
quoted in part here and given in full in the records (`finalText`).

| Run | Score | Counts | Final text (in part) | Reading |
|---|---|---|---|---|
| D-1 r1 | 0 | 20 / 6 / 14 / 4 | "the API doesn't validate that the start date is not after the end date ... causes a 500 error" | wrong cause (a date check, not the race) |
| D-1 r2 | 0 | 12 / 4 / 8 / 3 | "the issue is in the `statement` function in `src/bank/ledger.py`, where the check for reversed date ranges exists but isn't being properly enforced" | wrong cause |
| D-1 r3 | 0 | 11 / 4 / 7 / 3 | "Fix race condition in withdraw function ... Two threads can read the same balance, then both proceed to withdraw" | right cause, no file named, not recorded |
| D-2 r1 | 0 | 10 / 3 / 7 / 2 | "The CSS media query at line 181 in app.css hides the send-button on small screens." | right cause and file, not recorded |
| D-2 r2 | 0 | 10 / 3 / 7 / 2 | "hidden on screens narrower than 430 pixels due to a CSS media query" | right cause, no file named, not recorded |
| D-2 r3 | 0 | 12 / 5 / 7 / 4 | "The CSS media query at line 181 in `src/bank/web/app.css` hides the send-button" | right cause and file, not recorded |
| D-3 r1 | 1 | 22 / 12 / 10 / 10 | a ticket for an unclear error message; no code defect named | no defect claimed |
| D-3 r2 | 1 | 11 / 2 / 9 / 2 | "The defect is in the `withdraw` function in `src/bank/ledger.py`, lines 256 to 268 ... A race condition allows two concurrent withdrawals" | a defect that is not related to the symptom, claimed on the control |
| D-3 r3 | 1 | 12 / 3 / 9 / 3 | describes the currency check correctly, but calls it "The defect is in `src/bank/api.py` line 223", severity High; gives a finding id that the store does not hold | a defect claimed on the control |

**The control result is weak.** D-3 passes by score only because no finding was recorded. In 2 of
3 runs the final text claims a defect: r2 names a defect that has no relation to the symptom,
and r3 calls the correct behaviour a defect. With a working record step, these two runs could be
invented defects. This report does not count them as such, because the protocol scores the
recorded finding only.

**Proposed reproducers** (reported, not scored, not run):
- D-1 r1: `test_statement_reversed_range`.
- D-1 r3: `test_withdraw_race_condition`.
- D-2 r1: `test_transfer_button_hidden_on_small_screen`.
- D-2 r3: `test_transfer_button_visible_on_small_screens`.
- D-3 r2: a two-withdrawal test under `tests/`.
- D-3 r3: a test that a transfer between two currencies gives 404 with the current message.
- The other runs propose none.

## Gap in the records

`bakeoff/run.js` replaces the list of tool calls that `runDiscovery` returns (each with its
refusal text) with the count of model calls. So the records do not show why each
`record-finding` attempt was refused. This report does not guess the reason. To keep the
refusal texts, a change to the harness is necessary. That is a new protocol version, decided by
the lead, with new cases.

## What this shows, and what it does not

- The model found the right cause of the hidden button in 3 of 3 runs, and named the faulty file
  in 2 of them. It found the race in 1 of 3 runs. None of this is a pass, because no finding was
  recorded.
- The failure point is the record step, not only the search. The records cannot show if the
  model sent bad arguments, or if the checks refused good ones.
- These are three development cases on one branch, with a local model that is not the deployed
  model. They cannot support a general claim.
- Nothing was tuned. The prompt, the tools, `TRUTH` and the frozen files are as at c5651e7.
