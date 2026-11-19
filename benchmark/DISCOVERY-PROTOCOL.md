# Discovery from symptoms: evaluation protocol (Mode B, minimal form)

Written 19 Nov 2026, before any run and before the builder saw any symptom. Nothing in this
file changes after the first run. A change made after a result is a new protocol version with
its reason, and the result of the old version is still reported.

## What is tested

The PM agent gets a symptom in a user's words. It reads the investigated branch with the
read-only actions of `src/discovery.js` and records one finding. The test asks whether the
agent finds the defect and the faulty file, and whether it invents a defect when there is none.

## Frozen build

The build is frozen when the builder reports these commits to the lead. The lead then gives the
cases. The builder does not change these files after that:

- App: `src/discovery.js`, `bakeoff/tasks/discovery.js` (the tools, the scoring patterns in
  `TRUTH`), the PM agent prompt in `manifest.yml`, `src/tool-specs.js`. The commit is the head of
  `feat/discovery-from-symptoms` that the builder reports.
- Investigated branch: `investigate/symptoms`, built by the bank's
  `scripts/build_discovery_branch.py` from demo `main` 1c34369. Head commit 45a211d. It has
  three commits: the development kits removed; the withdrawal race in `src/bank/ledger.py`; the
  hidden Send button in `src/bank/web/app.css`. It has no seed patch, no scenario, no scenario
  generator, no thread or two-process race test and no Send button CSS check.

## Cases

- Written by the lead, not by the builder, before the runs, in a file
  `[{ id, symptom, truth }]`, where truth is `race`, `button` or `none`.
- Three cases: one symptom of the race, one of the hidden button, one control with no defect
  (for example a user error).
- The builder sees the cases only after the build is frozen.

## Runs

- Local model `qwen3-coder:30b`, Ollama digest 06c1097efce0 (the arm D model; already on the
  machine).
- The repeat setting of `config/models.json`: temperature 0.6, seeds 11, 12 and 13 (repeats 1,
  2 and 3 of the bake-off runner). Context 16,384 tokens.
- Three runs per case, nine runs in all. One command:

  ```bash
  DISCOVERY_CASES=<cases.json> DISCOVERY_TREE=<work tree at 45a211d> \
    node bakeoff/run.js --models qwen3-coder:30b --roles discovery --repeats 1,2,3 --run discovery-1
  ```

- A run ends when `record-finding` succeeds, when the model stops calling tools, or after 30
  model turns. The read budget is the deployed one: 20 GitHub calls per investigation.
- A run that fails in transport (the model server, not the model) is run again and named in the
  report. Nothing else is run again.

## Scores (by code, `scoreDiscovery`)

Per run:
- **Defect identified:** the finding's kind is `defect` and its hypothesis matches the fixed
  pattern of the case's truth (`TRUTH` in `bakeoff/tasks/discovery.js`).
- **Faulty file named:** a citation names `src/bank/ledger.py` (race) or
  `src/bank/web/app.css` (button). Every citation is already checked by code to be a line that a
  read returned.
- **Invented defect (control):** the finding's kind is `defect`.
- **Counts:** tool calls, refused calls, GitHub calls, `record-finding` attempts.

Reported, not scored:
- **Reproducer that fails on base.** In the minimal form the reproducer is proposed (name, file,
  what it asserts), not written, so it is not run. The report lists each proposed reproducer.
  This is a gap against part f, accepted with the minimal scope.
- **Human steps.** There is no person in a local run, so this is 0 here. It is measured only in
  the live runs (f6).

## Acceptance (fixed now)

- **Pass:** for each defect case, at least 2 of 3 runs both identify the defect and name the
  faulty file; and the control has no run with an invented defect.
- Anything else is a miss. A miss is reported with each run's finding text. It is not tuned
  away: a change to the prompt, the tools or the patterns after the runs is a new protocol
  version and needs new cases from the lead.
- These are development cases: three cases cannot support a general claim. The report says so.

## Limits

- The scoring pattern can accept a vague hypothesis that only names the right words, and can
  reject a right one with other words. The report shows every hypothesis so a person can check.
- The local model is not the deployed model (Rovo). The live runs (f6) wait for the owner.
- The investigated branch is the demo bank. One branch with two defects is not a general result.
