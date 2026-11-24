# Repair harness, development run 1 (24 Nov 2026)

Kind: development run on three development cases. It is not a blind measurement, and no claim of
the product rests on it. Scores only: `scores/dev-1-scores.json`. The traces, the patches and the
model text are kept outside the repository, as the README says ("Run records"); this page quotes
none of them.

## Set-up (frozen before the first model call)

- App commit 6f33f0a. The sha256 of the harness files (`patch.mjs`, `run.mjs`, `sandbox.mjs`,
  `task.mjs`), the two hidden checks, `cases-dev.json`, `symptoms-dev.json`, the discovery task and
  tool specs, `manifest.yml` and `bakeoff/ollama.js` were written down before the first call; they
  are unchanged on `main` 7565e7f.
- Model: qwen3-coder:30b (digest 06c1097efce0), local, temperature 0.6, context 16384, seeds 11, 12
  and 13. Limits for each run: 30 rounds, 8 checks, 3 patches.
- Cases and trees (each a clean local commit of the bank):
  - D2-1: a defect of the held-out discovery set, on its seeded tree (d193c76). Only this case of
    the held-out file was read. Its symptom text is not in this repository.
  - D7-1: a seeded defect in the idempotency window (e0de365).
  - D7-C: the control: the same symptom on a tree with no seeded defect (2d7b042).
- Sandbox: no network; reads only in the scratch copy and the Python install; writes only in the
  scratch copy. A patch may change `src/*.py` and add `tests/test_agent_*.py` only.
- Scoring is by the harness, not by the model: the hidden check (owned by the evaluator, never
  shown to the model) on the base and on the candidate, and the protected test files of the case.

## Result

| Case | Repaired | Not repaired | Invented a defect (control) |
|---|---|---|---|
| D2-1 | 0 of 3 | 3 of 3 | — |
| D7-1 | 0 of 3 | 3 of 3 | — |
| D7-C | — | — | 0 of 3 (no change in each run) |

| Case | Seed | Stop | Rounds | Minutes | Patches proposed / applied | Hidden check on the candidate | Verdict |
|---|---|---|---|---|---|---|---|
| D2-1 | 11 | final answer | 17 | 6.7 | 1 / 1 | failed | not repaired |
| D2-1 | 12 | final answer | 23 | 10.8 | 3 / 1 | failed | not repaired |
| D2-1 | 13 | final answer | 28 | 18.9 | 3 / 3 | failed | not repaired |
| D7-1 | 11 | round limit | 30 | 13.4 | 3 / 0 | — | no candidate patch |
| D7-1 | 12 | final answer | 22 | 16.5 | 3 / 0 | — | no candidate patch |
| D7-1 | 13 | final answer | 23 | 14.3 | 1 / 1 | failed | not repaired |
| D7-C | 11 | final answer | 10 | 3.9 | 0 / 0 | — | no change |
| D7-C | 12 | final answer | 8 | 3.0 | 0 / 0 | — | no change |
| D7-C | 13 | final answer | 12 | 4.7 | 0 / 0 | — | no change |

The hidden check fails on the base of D2-1 and D7-1 in each run, so each case has a real defect for
the check to see.

## What the failures were

- **Patches that did not apply: 8 of 14.** Each was a change of `src/bank/ledger.py` whose context
  lines did not match the file (`git apply` refused it). In D7-1 seeds 11 and 12, all three patches
  of the run failed this way, so the run ended with no candidate.
- **Patches that applied: 6 of 14.** One changed `src/` (D2-1 seed 11); it did not repair the
  defect. The other five only added a test file `tests/test_agent_*.py`, with no change of `src/`.
- **The model's own tests showed nothing.** Three runs added a test that was meant to reproduce
  the defect. None did: two passed on the base and on the candidate, and one failed on both.
- **The protected tests** of each case passed on each candidate that applied.
- **A tool that does not exist.** In D2-1 seed 13 the model called a tool to create a ticket. The
  harness answered "unknown tool" and did nothing; the run went on.
- **The control.** In each D7-C run the model read the code and the CI results, recorded a
  finding that the second request was a replay (or recorded nothing), proposed no patch and
  changed nothing.

## What this shows, and what it does not

- On these two seeded defects, this local model did not produce a repair in six tries. It also did
  not invent a defect on the clean control in three tries.
- The most common failure was mechanical (a patch with wrong context lines), not a wrong idea that
  was tested and failed. A harness that gives the model the exact lines of the file before a patch
  could change that; it is not tried here.
- Three cases and three seeds are too few for a rate. This run checks that the harness works end
  to end with a real model: sandbox, patch limits, hidden check, control. It is not evidence that
  the product repairs code.

## Files

- `scores/dev-1-scores.json`: one entry for each run: case, seed, stop, rounds, seconds, tool call
  counts, patches proposed and applied, the hidden check on the base and the candidate, the
  protected tests, the model tests (base, candidate, reproduces) and the verdict. No model text, no
  symptom and no patch.
