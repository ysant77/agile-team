# Discovery, set 2: results (19 Nov 2026)

Protocol: `DISCOVERY-PROTOCOL-2.md`, unchanged after the freeze. Records:
`run/results/discovery-2/`. The last development check before the freeze is in
`run/results/discovery-dev/discovery-dev-grounded.jsonl`.

## Setup

| Item | Value |
|---|---|
| Frozen app | agile-team main 24075d7 (`src/discovery.js`, `bakeoff/tasks/discovery.js`, the PM prompt, `src/tool-specs.js`) |
| Investigated tree | `investigate/symptoms-2` at d193c76, built by the bank's `build_discovery_branch.py --set 2` |
| Cases | the lead's file `discovery-cases-2.json`, sha256 `b737990f...572b0`, checked before the runs, not edited |
| Model | `qwen3-coder:30b`, digest `06c1097efce0` |
| Runs | repeats 1, 2, 3 (seeds 11, 12, 13), temperature 0.6, context 16,384 |
| Time | 19:41 to 20:13 SGT; no transport failure, no run made again |

## Result: NOT MET

| Case | Truth | Runs that pass | Rule | Met |
|---|---|---|---|---|
| D2-1 | `end_day` (`src/bank/ledger.py`) | 2 of 3 | at least 2 of 3 | yes |
| D2-2 | `access` (`src/bank/api.py`) | 0 of 3 | at least 2 of 3 | no |
| D2-3 | none (control, by design) | 0 of 3 (3 invented defects) | no invented defect | no |

## Each run

Counts: tool calls / refused calls / `record-finding` attempts. Each run ended on a recorded
finding, so no run has a final text. The finding text is quoted in part. The full records are
in `run/results/discovery-2/discovery-2.jsonl`, each with its `toolCallLog`.

| Run | Score | Counts | Finding (in part) | Reading |
|---|---|---|---|---|
| D2-1 r1 | 0 | 7 / 0 / 1 | "The statement function uses a half-open interval for the end date ...", `ledger.py:412` | right cause and file. Rule 3: the model rewrote the symptom (see below) |
| D2-1 r2 | 1 | 9 / 2 / 3 | "... uses a half-open interval for the end date ...", `ledger.py:412`, `414` | pass |
| D2-1 r3 | 1 | 7 / 0 / 1 | "The statement query uses a half-open interval for the end date ...", `ledger.py:412`, `414` | pass |
| D2-2 r1 | 0 | 12 / 0 / 1 | "The ledger does not check that a journal entry's lines sum to zero per currency ...", `ledger.py:218`, `test_ledger.py:31` | wrong cause |
| D2-2 r2 | 0 | 13 / 1 / 2 | "The web app does not use idempotency keys for transfers ... the header name is wrong", `app.js:148` | wrong cause |
| D2-2 r3 | 0 | 15 / 2 / 2 | "The statement view shows the wrong running balance ... adds the amount_minor instead of correctly applying it", `ledger.py:419` | wrong cause |
| D2-3 r1 | 0 | 7 / 0 / 1 | "The system rejects amounts with more decimals than the currency allows, even when those extra decimals are zero ...", `api.py:113`, `114` | by-design behaviour called a defect |
| D2-3 r2 | 0 | 7 / 0 / 1 | "The system rejects amounts with more decimals than the currency allows. For EUR, that is 2 ...", `api.py:113`, `114` | by-design behaviour called a defect |
| D2-3 r3 | 0 | 7 / 0 / 1 | "The API rejects amounts with more decimals than the currency allows, but the error message says 'too many decimals for EUR' instead of 'more decimals than EUR allows' ...", `api.py:113`, `114` | by-design behaviour called a defect |

**D2-1 r1, rule 3.** The model passed this symptom to `start-investigation`: "A customer's
accountant reports that a card payment of 42.10 EUR made on 31 October is missing from a
statement for 1 October to 31 October, but appears in a statement for 1 October to 1 November."
That is a rewrite of the user's words (196 characters, not a part of the 414-character case
text). The tool description says "Do not rewrite the symptom". Rule 3 scores the run 0, as the
protocol states.

**Refusals in the runs.**

| Run | Refusal | Rule |
|---|---|---|
| D2-1 r2 | "finding must be one JSON object" | input |
| D2-1 r2 | "reproducer needs keys file, testName, asserts; got keys: file, testName" | shape |
| D2-2 r2 | "test_transfer_moves_money already exists in tests/test_ledger.py; a reproducer is a new test that fails on the current code" | test claims |
| D2-2 r3 | "test_statement_running_balance already exists in tests/test_ledger.py; ..." | test claims |
| D2-2 r3 | "unknown tool lint-requirement; the tools are: ..." | unknown tool |

**Reads in D2-2.** Every run read `src/bank/api.py` from line 1, and that read holds the
statement route. Then each run read `ledger.py` and the web files, and recorded a cause in
another place.

**Reads in D2-3.** Every run read `money.py`, `api.py` and `tests/test_money.py`, and
described the check correctly. Each run then gave it the kind `defect`.

## What this shows, and what it does not

- The tool rules held in all nine runs:
  - no second investigation;
  - no claim that an existing test fails;
  - every citation was in a read;
  - two reproducers that already existed were refused;
  - one rewritten symptom was scored 0.
- The misses are model misses of two kinds:
  - **a wrong cause:** on D2-2 the model did not connect the reported access to the route that
    it read;
  - **by-design behaviour classified as a defect:** on D2-3 in 3 of 3 runs, and on the set-1
    control in the development checks.
- No tool check decides whether a behaviour is a defect or by design. Only a person or a stated
  rule can.
- These are three development-sized cases on one branch, with a local model that is not the
  deployed model. They cannot support a general claim.
- Nothing was tuned after the results.
