# Repair harness (local research harness, 24 Nov 2026)

One bounded agent with typed tools goes from a user's symptom to a candidate patch; checks the
agent never sees decide the outcome; a person decides on any change. Local only: no remote system
is changed, and nothing here is a product feature.

## What the agent can do

- The five read-only discovery tools of the app (`src/discovery.js`), served from the local
  investigated work tree at its commit (`bakeoff/tasks/discovery.js`, `localGithub`). The rules
  are the app's: path allowlist, read budget, citations only from reads, no invented numbers, a
  defect must cite a rule.
- `run-check { test, on }`: pytest for one test id that exists in the base copy or the candidate
  copy. The harness builds the command; the agent gives only the test id (`TEST_ID` pattern).
  At most 8 checks.
- `propose-patch { diff, reason }`: one unified diff. Allowed: change Python files under `src/`,
  add `tests/test_agent_<name>.py`. Refused: the bank's own tests (the protected oracle),
  scripts, CI, config, lock files, deletes, renames, binary, paths with `..`; more than 5 files or
  20,000 bytes. Each patch goes on a fresh copy of the base; at most 3 patches.

## Where commands run

Every test run is `<bank python> -m pytest -q ...` on a scratch copy (`git archive` of the tree),
under `sandbox-exec` with a profile that denies all network use and every file write outside the
scratch copy. The environment is replaced (no variable of the caller passes, so no token), and a
run over its time limit is killed. The investigated tree is never written.

## How a run is judged (`evaluate` in `task.mjs`)

- The hidden check of the case (`hidden/<case>.py`, evaluator-owned, written from the bank's
  stated rule, not from the seeded patch) must fail on the base copy; else the case is not valid.
- On the candidate: the hidden check passes and the protected test files of the case pass gives
  "repaired"; a protected failure gives "regression"; else "not repaired". On a clean control any
  candidate is "invented change".
- An agent test counts as a reproducer only if it fails on base and passes on the candidate.
- Every patch, applied or refused, is kept with its reason; every tool call is in the trace.

## Cases

`cases-dev.json`: D2-1 only, labelled development (its discovery result is known). The symptom is
read at run time from the lead's case file, unchanged. A new synthetic symptom and a clean control
are added in a later step; nothing here is held out or blind.

## Run

```text
node bakeoff/repair/run.mjs --case D2-1 --symptoms <lead's case file> --tree <investigated tree> \
  --python <bank .venv python> --out <dir> --model <local model> --seed 11
```

`--scripted <steps.json>` replays fixed tool calls instead of a model. A scripted result tests the
harness and is labelled "scripted"; it is never an agent result.

## Limits

- macOS only (`sandbox-exec`, which Apple marks as deprecated). Elsewhere there is no sandbox and
  the harness must not run model-proposed code.
- The evaluator runs the protected test files of the case, not the whole bank suite (about 13
  minutes); the full suite is a separate step before any change is proposed for real.
- The Python environment is built from another bank commit; the copy's `src/` comes first on the
  path. A dependency change in a patch is refused, so this holds.
- One development case so far. No model has run in this harness yet.
