# Repair harness, development run 3 (24 to 25 Nov 2026): 1 of 3 seeds, partial

**Partial: seed 11 only.** Seeds 12 and 13 were not run: the model slot was released for other
work after the seed 11 round, as planned. No figure on this page is a rate.

Kind: development run on four development cases that the builder of the harness wrote
(`cases-dev.json`, R3-1 to R3-C). It is not blind and not held out, and no claim of the product
rests on it. Scores only: `scores/dev-3-scores.json`. The traces, the patches and the model text
are kept outside the repository (README, "Run records"); this page quotes none of the model text.

What changed since run 2: patches build on each other (each patch applies to the current
candidate, not to a fresh base), the model can reset the candidate to the base, and the control
gets its own verdict rule (PR 110).

## Set-up (frozen before the first model call)

- Freeze: `scores/dev-3-freeze.txt` (app 32a582c, branch `test/repair-dev-3-cases`): the sha256 of
  the harness files, the three hidden checks, `cases-dev.json`, `symptoms-dev-3.json`, the
  discovery task and tool specs, `manifest.yml` and `bakeoff/ollama.js`. The run worktree was at
  `main` 7a4d8a8; the harness files there have the frozen hashes.
- Model: qwen3-coder:30b (digest 06c1097efce0), local, temperature 0.6, context 16384, seed 11.
  Limits for each run: 30 rounds, 8 checks, 3 patches.
- Cases (local bank branches from 165b689 with the development kits removed, 2d7b042):
  - R3-1 (9d9171c): a seeded fault in the length limit of the payment reference.
  - R3-2 (5ec0607): a seeded fault in the minor-unit exponent of KRW.
  - R3-3 (cb9b938): a seeded fault in the letter case of account number lookups.
  - R3-C, the control (2d7b042): no seeded change; the symptom describes intended behaviour.
- Validity, checked before the freeze: each hidden check fails on its seeded tree and passes on the
  clean tree; the bank's suite passes on each seeded tree (265 tests).
- Battery: 77% at the load, 64% at the release (rule: no batch below 50%, stop at a run boundary
  at 40%).

## Result (seed 11)

| Case | Stop | Rounds | Minutes | Patches (in order) | Candidate files | Hidden check on the candidate | Verdict |
|---|---|---|---|---|---|---|---|
| R3-1 | round limit | 30 | 16.1 | applied (a test), refused, refused | one agent test only | failed | not repaired |
| R3-2 | round limit | 30 | 14.7 | applied (a test), applied (`src/bank/money.py`), then a reset, refused | none | — | no candidate patch |
| R3-3 | round limit | 30 | 10.2 | applied (a test), applied (`src/bank/ledger.py`), applied (the test) | `src/bank/ledger.py`, one agent test | **passed** | **repaired**; a person decides |
| R3-C | final answer | 14 | 5.8 | applied (`src/bank/api.py`) | `src/bank/api.py` | — | **invented a defect** |

Seed 11: 1 of 3 seeded cases repaired; on the control, a defect was invented (1 of 1).

## What the runs show

- **R3-3 repaired, at a different place.** The seeded fault removed the upper-casing of the typed
  account number in the transfer route (`src/bank/api.py`). The candidate does not restore it
  there: it upper-cases the number inside `ledger.get_account_by_number`
  (`src/bank/ledger.py`), so every caller of that function now gets the change. The candidate
  also adds one blank line. The hidden check (small letters, with and without spaces) and the
  protected tests pass. The agent's own test does not import `pytest` and expects the old
  behaviour (no account found), so it fails on the base and on the candidate; it does not show
  the repair. Only the hidden check does. Whether the change at the ledger layer is acceptable is
  for a person to decide.
- **R3-1 changed no source.** All three patches were for one agent test file. The second and third
  were refused because they wrote to the existing file without its old text (the edit rule). The
  agent test passes on the base, so it does not reproduce the fault.
- **R3-2 ended empty.** Two patches applied (a test, then a change to `src/bank/money.py`). In
  round 28 the model reset the candidate to the base. Its last patch gave old text that does not
  occur in the base file, so it was refused, and the round limit came with no candidate.
- **The control: the run invented a defect, by the rule of PR 110.** On the clean control, any
  candidate that changes `src/` counts as an invented defect. R3-C changed `src/bank/api.py`: it
  split the one condition of the transfer route ("no such account or wrong currency") into two
  conditions. Both still give the same 404 with the same message. So the change does not alter
  what the route does, and the protected tests pass. It still counts, because the model claimed
  a defect in intended behaviour and changed source code to fix it.
- **Patch tally:** 10 proposed, 7 applied, 3 refused (2 for an existing file without old text, 1
  for old text that occurs 0 times). No patch tried a protected path.

## What this shows, and what it does not

- One seed of four development cases gives no rate. Seeds 12 and 13 are needed before any
  sentence about run 3 as a whole.
- With cumulative patches, a reset can throw away a change that the model then fails to make again
  (R3-2). Whether the harness should keep the last applied candidate at the round limit is a
  harness question, not a model result.
- The control result is the same kind as in runs 1 and 2: on a symptom that describes intended
  behaviour, this model can change source code. No claim of code repair is made
  (`docs/CLAIM-REGISTER.md`, "Sentences we do not say").
