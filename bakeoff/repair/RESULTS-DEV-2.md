# Repair harness, development run 2 (24 Nov 2026)

Kind: development run on three new development cases that no earlier run had seen. It is not a
blind measurement, and no claim of the product rests on it. Scores only:
`scores/dev-2-scores.json`. The traces, the patches and the model text are kept outside the
repository (README, "Run records"); this page quotes none of the model text.

What changed since run 1: `propose-patch` takes search-and-replace edits (PR 105) in place of a
unified diff. In run 1, 8 of 14 diffs did not apply. The three run 1 cases were not run again.

## Set-up (frozen before the first model call)

- App: branch `test/repair-dev-2` on `main` beee9ed (the edit form). The sha256 of the harness
  files, the two hidden checks, `cases-dev.json`, `symptoms-dev-2.json`, the discovery task and
  tool specs, `manifest.yml` and `bakeoff/ollama.js` were written down before the first call. The
  branch was later rebased onto a newer `main` for the push; those files did not change.
- Model: qwen3-coder:30b (digest 06c1097efce0), local, temperature 0.6, context 16384, seeds 11, 12
  and 13. Limits for each run: 30 rounds, 8 checks, 3 patches.
- Cases (local bank branches from 165b689 with the development kits removed, 2d7b042):
  - R2-1: statement lines are ordered by entry, not by date (57deaf0). A payment booked late for an
    earlier day comes out of date order, with a wrong running balance.
  - R2-2: the session cookie is `SameSite=none` instead of `lax` (29ba7d4).
  - R2-C, the control: no seeded change (2d7b042, the same tree content as D7-C of run 1); a new
    symptom that describes correct behaviour (an opening balance that is right).
- Validity, checked before the freeze: each hidden check fails on its seeded tree and passes on the
  clean tree; the bank's own suite is green on both seeded trees (264 tests in archive copies, and
  the 10 import-guard tests, which need git, in the worktrees).
- Sandbox and scoring as in run 1: the hidden check (owned by the evaluator, never shown to the
  model) on the base and on the candidate, and the protected test files of the case.
- Battery: 100% at the load, lowest 92%, 96% at the release (rule: no start below 35%, stop at
  20%).

## Result

| Case | Repaired | Not repaired | Invented a change on the control |
|---|---|---|---|
| R2-1 | 1 of 3 (seed 13) | 2 of 3 | — |
| R2-2 | 0 of 3 | 3 of 3 | — |
| R2-C | — | — | 1 of 3 (seed 11; a test file only, see below) |

| Case | Seed | Stop | Rounds | Minutes | Patches (in order) | Candidate changes `src/` | Hidden check on the candidate | Verdict |
|---|---|---|---|---|---|---|---|---|
| R2-1 | 11 | final answer | 12 | 8.1 | refused (protected path) | — | — | no candidate patch |
| R2-1 | 12 | final answer | 14 | 5.1 | applied, applied | no | failed | not repaired |
| R2-1 | 13 | final answer | 22 | 15.8 | applied, applied, refused (protected path) | yes | **passed** | **repaired**; a person decides |
| R2-2 | 11 | final answer | 9 | 2.3 | none | — | — | no candidate patch |
| R2-2 | 12 | final answer | 8 | 2.1 | none | — | — | no candidate patch |
| R2-2 | 13 | model error (terminated) | 13 | 9.9 | refused (protected path), applied, applied | yes | failed | not repaired |
| R2-C | 11 | round limit | 30 | 13.1 | refused (edits not a list), applied, refused (protected path) | no | — | **invented change** |
| R2-C | 12 | final answer | 8 | 3.1 | none | — | — | no change |
| R2-C | 13 | final answer | 9 | 3.9 | none | — | — | no change |

## What the runs show

- **The edit form removed the format failure of run 1.** Of 12 patches proposed, 7 applied. No
  edit was refused because its old text did not occur exactly once. The 5 refusals: 4 tried to
  change a protected file (the bank's `tests/test_ledger.py` three times, `src/bank/web/app.js`
  once), and 1 passed the edits as a text, not as a list.
- **One repair.** R2-1 seed 13 changed the statement query to order the lines by their date; the
  hidden check and the protected tests pass on the candidate.
- **A later patch replaces an earlier one.** Each patch goes on a fresh copy of the base. In R2-1
  seed 12 the first patch changed `src/` and the second added only a test, so the candidate was the
  test alone and the hidden check failed. The model treated the patches as cumulative; the harness
  does not. This is a harness behaviour to decide on, not a model result.
- **R2-2 was not repaired.** Two runs proposed nothing; the third added code that does nothing (a
  placeholder) and then ended with a model connection error ("terminated"). No run changed the
  cookie setting.
- **The control.** R2-C seed 11 counts as an invented change under the harness rule (any candidate
  on a clean control). Its candidate was only a new agent test about the opening balance, which
  passes on the base and on the candidate; it changed no source code. It also tried to edit a
  protected test and ran to the round limit. Seeds 12 and 13 proposed nothing.
- **A tool that does not exist** was called once again (R2-1 seed 13, a ticket tool); the harness
  answered "unknown tool" and did nothing.

## What this shows, and what it does not

- On two new seeded defects this local model repaired one of six tries (R2-1 once, R2-2 never), and
  on a new clean control it made a change in one of three tries (a test only).
- Three cases and three seeds give no rate. The run shows that the edit form works with a real
  model, and it shows two harness questions: whether patches should build on each other, and
  whether a test-only candidate on a control should count as an invented change.
- It is not evidence that the product repairs code. The harness is not part of the app.

## Files

- `scores/dev-2-scores.json`: one entry for each run (case, seed, stop, rounds, seconds, tool call
  counts, each patch as applied or refused with the kind of refusal, whether the candidate changes
  `src/`, the hidden check on the base and the candidate, the protected tests, the agent tests and
  the verdict), and the battery values. No model text, no symptom and no patch.
