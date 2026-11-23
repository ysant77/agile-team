# Set 7: preparation (23 Nov 2026; no case is written here)

This file prepares blind set 7. It has two parts: the freeze note template and the scoring
checklist. It has no case, no case idea and no prediction. A blind writer writes the cases
outside this repository, from the brief that the lead gives. The writer does not see this
repository, and this file is not part of that brief.

The rules are the rules of set 6 (`BUILD-6.md`, `PREDICTIONS-6.md`, `RESULTS-6.md`), and
scoring is the section "Scoring" of `PROTOCOL-5.md` with no change. Where this file and
`PROTOCOL-5.md` differ, `PROTOCOL-5.md` wins, and the difference is reported to the lead.

## Part 1. The freeze note template

Copy the block below into `benchmark/FREEZE-7.md`. Fill it in and push it before the lead
releases the case file. After the push, no field changes. A change after that goes into
`run/SCORER-CHANGES.md` with "seen set 7 results: yes" or "no", and the results before and after
the change are both reported.

```markdown
# Set 7: freeze note (fixed <date> <time> SGT, before the set 7 case file is opened)

## The case file

- Writer: blind (saw no source of the app or the bank). The lead holds the file.
- sha256 of the case file, given by the lead before the release: `<64 hex>`
- Checked after the copy into `CASES-7-INDEPENDENT.md`: <yes / no, with the value found>

## Frozen code

| Part | Repository | Commit |
|---|---|---|
| The app under test (`--app`, `--app-main`) | agile-team `main` | `<sha>` |
| Configuration (`VERIFY_CONFIG` of that commit) | agile-team `main` | `<sha>` |
| Runner, scorer, summary (`benchmark/run`) | agile-team `main` | `<sha>`; scorer changes up to `<n>` |
| Bench base, and `scripts/repro.py`, `scripts/changed_coverage.py`, `scripts/pinned.py` | yms-bank-demo `main` | `<sha>` |
| Arm D (only if the lead names it for set 7) | agile-team `main` | `<sha>`; model, digest, seeds |

From the frozen commit until `RESULTS-7.md` is pushed: no change to `src/verifier/`,
`src/verify-claim.js`, `src/github-evidence.js`, `src/jira-evidence.js`, `src/approvals.js`,
`src/review*.js`, `src/sign-off.js`, `src/pr-link.js` or the scorer.

## What changed since the set 6 freeze (9ec52ca)

For the lead's record only; never given to the writer.

| PR | Change in the code under test |
|---|---|
| <n> | <one line> |

## Facts that the scorer cannot express (fixed before the case file is opened)

A case that needs one of these facts is not buildable. It is counted apart, with its reason, and
never rewritten.

- <one line per fact, with the scorer file that shows it>

## Arms

- C: the app's `decide()` on stored evidence (`run/score.mjs`), every buildable case.
- D: <not run / run as PROTOCOL-5 "Arms">

## Local only

No push, PR or merge on a demo repository, no deploy, and no Forge variable change for set 7.
The bench clone `bench-bank-7` has no remote.
```

### Values known on 23 Nov (to check again on the day of the freeze)

These help to fill the template. They are not the freeze; the freeze takes the values of its
own day.

- The code under test changed after the set 6 freeze (9ec52ca). The merged PRs that change
  `src/verifier/` or `src/verify-claim.js` are:
  - PR 69: a skipped or not-run test is `unknown`, not a fail (set 6 fault 3, W22); the rename
    rule needs a link between the old test and the new one (set 6 fault 4, W13);
  - PR 71: a linked PR read from the app's store (`pr-links:<key>`);
  - PR 72: the base report path for each branch;
  - PR 73: `samesite` is a security value argument (set 6 fault 1, part of W10).
- The scorer has no simulation of these app records:
  - the audited sign-off (`aat.signoff`, `src/sign-off.js`). Set 6 W08 and W17 were not
    buildable for this reason;
  - the PR link store (`pr-links:<key>`, `src/pr-link.js`);
  - a GitHub answer of 403 with rate-limit headers (set 6 W04);
  - a merged PR whose merge commit is not the commit that CI ran on (set 6 W15);
  - a push run in progress (set 6 W24).

  To add any of them is a scorer change: a `run/SCORER-CHANGES.md` row written before the case
  file is opened, with the old-against-new identity check on sets 1 to 6 (every result record
  identical). If it is not added before the freeze, the list above goes into the freeze note
  as it is.
- Known limits that stay (stated, not fixed): the verifier does not read AC text (set 6 W18), and
  it has no check for a side effect that no test asserts. The CORS part of W10 is not in the
  security check.

## Part 2. The scoring checklist

Do the steps in this order. Write "done" and the commit or file for each step in `BUILD-7.md` or
`RESULTS-7.md`, as the step says. Do not go to the next step while a step is open.

### Before the case file is opened

- [ ] `FREEZE-7.md` is filled in from the template and pushed. The frozen app commit is on app
      `main`.
- [ ] The scorer changes, if any, have their `SCORER-CHANGES.md` rows and the identity check on
      sets 1 to 6. The check output is in `run/evidence/`.
- [ ] The regression of the frozen app is run on sets 1 to 6, as in the dated regression
      notes (`benchmark/REGRESSION-*.md`), and the counts are recorded in a new dated note. Set 7 results are compared only with this run.
- [ ] The lead says that the case file is released.

### When the case file is opened

- [ ] The file is copied unchanged into `benchmark/CASES-7-INDEPENDENT.md`. Its sha256 is the
      value in `FREEZE-7.md`. If it is not, stop and tell the lead.
- [ ] `run/truth-7.json` is made by a script (`run/make_truth7.py`) from the case file only:
      expected outcome, accepted alternatives, strict pattern, class, arguable flag. The script
      and its output are committed.
- [ ] Each "base fact assumed" of the writer is checked on the bench base. Each false fact is
      written down with the file and line that shows it.

### Before any build or run

- [ ] `PREDICTIONS-7.md`: for each case, the builder's predicted outcome and the rule that
      decides it. The columns copied from the case file do not change.
- [ ] The predicted counts (all cases, and without the arguable cases): unsafe supported, false
      blocks on controls, right, strict right.
- [ ] The not-buildable list, with a reason for each case: a base fact that is false, or a fact
      from the list of `FREEZE-7.md` that the scorer cannot express. No case is rewritten to
      make it buildable.
- [ ] `PREDICTIONS-7.md` is committed and pushed, with the date and time. Nothing in it changes
      after this push.

### The build

- [ ] `bench-bank-7` is a new local clone with no remote, on the bench base of `FREEZE-7.md`.
- [ ] One branch for each buildable case. On each head: `ruff check` and
      `ruff format --check` pass, unless the case states a failure; `tests_rc` is 0 unless
      the case states a failure.
- [ ] For each named test: the base and head outcome from the repro block match the case.
- [ ] The wrong behaviour that each case states is checked on the head and written in a table.
- [ ] The coverage of the changed lines from the report is compared with the case. A difference
      is a dispute, written with its cause. It does not change the case.
- [ ] A case found not buildable at the build is added to the list with its reason. Its
      prediction stays as it was.
- [ ] Every choice that the case text left to the builder is written in `BUILD-7.md`.
- [ ] The manifest is in `run/manifests/bench-manifest-7.json`. `BUILD-7.md` and the manifest
      are pushed before any scoring run.

### The run and the score

- [ ] `run/run_all.py`, then `run/score.mjs` with the frozen app, then `run/summarize.py`, with
      the commands of `PROTOCOL-5.md` "Commands" and the set 7 files.
- [ ] The run records are in `run/evidence/set7-<date>/`, with their sha256 in
      `run/evidence/SHA256SUMS-set7`.
- [ ] For each case: the outcome, the reason, right or not, strict right or not, and whether it
      is unsafe supported or a false block on a control.
- [ ] The counts over the scored cases, and again without the arguable cases. The not-buildable
      cases are counted apart, in their own line.
- [ ] Each scored outcome is compared with its prediction. Each difference is written with its
      cause.

### The results file

- [ ] `RESULTS-7.md` is written in this order: the counts, each case, the not-buildable cases,
      against the predictions, the faults that set 7 shows, the disputes, the notes, the summary
      table.
- [ ] Each fault is recorded as found, with the case and the check. No fault is fixed in the
      same round, and no rule or scorer is changed after a result is seen.
- [ ] The score stands as labelled. A dispute is written beside the score; it does not change
      it.
- [ ] `RESULTS-7.md` is pushed. Then the freeze ends, and a fix goes into its own branch, with a
      regression run on sets 1 to 7.

### Each time

- Owner identity only on each commit. No tool names in any commit, branch or file.
- Before each push: the pre-push scan, `node --check`, `npm test`, and gitleaks.
- No site name, account id, email, home path or secret in a tracked file.
