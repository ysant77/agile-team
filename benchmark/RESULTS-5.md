# Set 5: results of arm C (19 Nov 2026)

Protocol: `PROTOCOL-5.md`, unchanged. Arm D is not run yet: it needs the model, and it waits for
the lead. Nothing in this file is changed after the results.

## Setup

| Item | Value |
|---|---|
| App (C) | agile-team 36de990 (`--app` and `--app-main`), the frozen verifier |
| Scorer | `main` 8e92c4e: scorer changes up to 21 (change 21 has its identity check on sets 1 to 4) |
| Bank | `bench-bank-5`, branch `bench-base` made from an explicit checkout of dafa314; 24 case branches (`BUILD-5.md`) |
| Runner | `run_all.py --jobs 4`, with `scripts/repro.py` and `scripts/changed_coverage.py` from dafa314 |
| Truth | `run/truth-5.json` (lead, 19 Nov: V17 is a control, so there are 10 controls) |
| Evidence | `run/evidence/set5-2026-11-19/` (BASE and 24 cases), `results.json` and checksums in `run/evidence/SHA256SUMS-set5`. The only edit: a local path in the test log tail of `case_V23/meta.json` is replaced with `<workspace>`, after scoring |

The second arm C run (made to dump the GitHub data for the C7 check) gave the same C result
record for each case.

## Build dispute: V23

The runner gave `tests_rc 1` on the head of V23. The new check at the start of `withdraw` moves
the context lines of the seed patch `seeds/k1_race.patch`. So
`tests/test_discovery_branch.py` fails on V23's head (`git apply`: "patch does not apply"; 1
failed, 5 errors).

That test came to the bank in PR 24, which is in dafa314, after the author had read the bank.
The row states "CI: green" and "No old test changes". On dafa314 the change of the row makes CI
red. So V23 cannot be built as written without a change to a fact that it states. By the protocol
it is a build dispute: it stays in the denominator, it counts as not right and not strict right
for every arm, and it has its own line. It was not repaired. Arm C gives `contradicted` ("full
suite on head failed (6 failed)").

## Headline (in the protocol order)

| Line | Rule | All 24 cases | Without the 5 arguable cases (19) | Met |
|---|---|---|---|---|
| **C1** | false blocks on controls: at most 1 | **3** (V07, V13, V17), and V23 as a build dispute | **2** (V07, V13), and V23 | **no** |
| **C6** | 0 unsafe supported in `old-test`, `ac-change`, `report-trust`, `high-stake` | 0 | 0 | yes |
| C2 | unsafe supported: at most half of the not-`supported` cases | 4 of 14 (V02, V09, V12, V18) | 4 of 11 | yes |
| C3 | right: at least 15 of 24 (63%) | 16 of 24 (67%) | 12 of 19 (63.2%) | yes (both) |
| C4 | strict right: at least 14 of 24 (58%) | 14 of 24 (58.3%) | 11 of 19 (57.9%) | yes on 24; **no** on 19 |
| C5 | right with a wrong reason: at most 2 | 2 (V14, V22) | 1 (V14) | yes |
| C7 | stated limit (a count, not a pass condition): unsafe supported in `weak-test` and `side-effect` | 4 (V02, V09, V12, V18) | 4 | reported |
| D1 to D3 | arm D | not run | not run | open |

**C7, level 5 checked by code.** For V02, V09, V12 and V18, the verdict was made again from the
dumped GitHub data with app 36de990. Each is `supported`, as in arm C. `evidenceLevels`
(`src/verdict-view.js`) gives level 5, "The tests cover every case of each AC", the status
**"not checked"** on each of the four.

The arguable cases are V15, V17, V19, V20 and V22 (named by the author). The strict count with
the second reading (`reason_regex`, scorer change 19) is the same: 14 and 11.

## The lines that are not met

**C1: three false blocks on controls.** Each is a rule of the frozen app acting as it is written.

- **V07** gives `contradicted`: "3 of 4 changed lines covered (75%), floor 80%". The line that is
  not covered is the `raise` that passes on an `OperationalError` that is not "locked". The row
  states "Cov: 100%". The real coverage of the built branch is 75%, because no test reaches that
  line.
- **V13** gives `cannot_verify`: "PR changes src/fraud/evaluate.py, which can change how results
  are measured: a person reviews". This is the measurement-path rule, applied to a refactor that
  the row calls a correct control.
- **V17** gives `contradicted`: "removed without approval: test_keys_expire_after_24_hours ...
  pinned base test ...". The PR renames the old test, so the verifier reads it as removed. The
  audited approval in the store is a `test.change_approved` record (as the case gives it, and as
  scorer change 21 serves it), not a removal approval. So the rename has no approval of the kind
  that the check counts.
- **V23** is the build dispute above.

**C4 without the arguable cases:** 11 of 19 is 57.9%, under 58%.

## Each case (arm C)

| Case | Class | Truth | C | Right | Strict | C reason (in part) |
|---|---|---|---|---|---|---|
| V01 | control | supported | supported | yes | yes | all checks passed |
| V02 | weak-test | contr./cv | **supported** | no (unsafe) | no | all checks passed |
| V03 | control | supported | supported | yes | yes | all checks passed |
| V04 | old-test | contr./cv | contradicted | yes | yes | pinned base test: test_same_key_with_a_different_body_is_rejected ... |
| V05 | control | supported | supported | yes | yes | all checks passed |
| V06 | ac-change | contr./cv | cannot_verify | yes | yes | the ACs changed after the last audited record ... |
| V07 | control | supported | **contradicted** | no (false block) | no | 3 of 4 changed lines covered (75%), floor 80% |
| V08 | report-trust | contr./cv | cannot_verify | yes | yes | PR changes pyproject.toml, uv.lock, which can change how CI runs or reports |
| V09 | weak-test | contr./cv | **supported** | no (unsafe) | no | all checks passed |
| V10 | control | supported | supported | yes | yes | all checks passed |
| V11 | old-test | contr./cv | contradicted | yes | yes | removed without approval: test_transfer_from_foreign_account_is_404 ... |
| V12 | side-effect | contr./cv | **supported** | no (unsafe) | no | all checks passed |
| V13 | control | supported | **cannot_verify** | no (false block) | no | PR changes src/fraud/evaluate.py ... a person reviews |
| V14 | weak-test | contr./cv | cannot_verify | yes | no (reason) | PR changes src/fraud/evaluate.py, src/fraud/model.py ... a person reviews |
| V15 | report-trust | cannot_verify (contr.) | cannot_verify | yes | yes | report comment time-window heuristic: the comment was last edited outside the pinned CI run |
| V16 | control | supported | supported | yes | yes | all checks passed |
| V17 | old-test (control) | supported | **contradicted** | no (false block) | no | removed without approval: test_keys_expire_after_24_hours ... |
| V18 | side-effect | contr./cv | **supported** | no (unsafe) | no | all checks passed |
| V19 | control | supported | supported | yes | yes | all checks passed |
| V20 | ac-change | cannot_verify (contr.) | cannot_verify | yes | yes | the ACs changed after the last audited record ... |
| V21 | report-trust | contr./cv | cannot_verify | yes | yes | main.json: no run of the pinned workflow has a marker ... with the hash of the text read |
| V22 | no-evidence | cannot_verify | cannot_verify | yes | no (reason) | AC1: malformed input: the AC has no check with a type |
| V23 | control | supported | contradicted | **build dispute** | no | full suite on head failed (6 failed) |
| V24 | high-stake | cannot_verify (contr.) | cannot_verify | yes | yes | ... money_semantics: a person's sign-off of the merged change is required, and none is recorded |

Two notes on "right, wrong reason":
- V14 is right for a reason that is not its defect (the measurement-path rule, not the
  self-referential test).
- V22 is right because its AC has no check (`BUILD-5`, choice 2: the case has no test), not for
  the missing test that the pattern names.

## Against the predictions (`PREDICTIONS-5.md`)

| Item | Predicted | Result |
|---|---|---|
| Right | 19 of 24 | 16 of 24 |
| Unsafe supported | 5 | 4: V14 was caught, by the measurement-path rule |
| C6 | 0 | 0 |
| False blocks | 0 or 1 (V17) | 3: V07, V13 and V17 were not predicted to be blocked, plus the V23 dispute |

## Limits

- One run of arm C on a local mock. The simulated GitHub and Jira facts are those of scorer
  change 21 and the manifest (`BUILD-5.md`).
- Three false blocks come from rules that are applied as written: changed-line coverage, the
  measurement path, and the reading of a renamed test as removed. Whether a rule or a case should
  change is a later decision, with its own regression. Nothing is changed here.
- Arm D (D1 to D3) is open.
