# Predictions for independent set 3 (17 Nov 2026, before building or running)

Written after reading `CASES-3-INDEPENDENT.md` (17c4762) and before any case is built or run. Not
targets: the case file decides. The arms are those of `ARM-CD-PROTOCOL-3.md` (6545290). All cases
run on a local mock (local bank branches, local CI commands, simulated GitHub).

Builder's mapping note, fixed now: T07's run "in progress" on H2 is given to the frozen scorer as
`reportForCommit: H1` and `staleHead: true`. The simulated GitHub then has the green run and the
report for H1 and no completed run on H2; A1 and A2 read "required checks pending on the new
head". The frozen scorer cannot list an `in_progress` run. For the app, no run and an unfinished
run on the head both give `ci_green` unknown.

| Id | Correct | A1 | A2 | C | D | Why |
|---|---|---|---|---|---|---|
| T01 | supported | merge | human gate | supported | supported (some risk of a hold) | Task: AC test passes on head. |
| T02 | not supported | **merge** | human gate | **supported** (unsafe) | likely catch: no low-boundary check | Test covers 501 only. |
| T03 | cannot_verify | merge | human gate | cannot_verify (sign-off) | as C | Spec domain money_semantics. |
| T04 | supported | merge | blocked (repro: ModuleNotFoundError) | supported | supported | New-module rule. |
| T05 | cannot_verify / contradicted | merge | blocked (passes on base) | contradicted ("passes on base", test named) | as C | Accepted. |
| T06 | supported | merge | human gate | supported | risk of a hold (long test) | |
| T07 | cannot_verify | blocked (pending) | blocked | cannot_verify (no completed run or report for H2) | as C | |
| T08 | not supported | **merge** | human gate | **supported** (unsafe) | likely catch: debit branch | |
| T09 | supported | merge | blocked (no_filter passes on base) | **contradicted** (expected false block: the AC test row no_filter passes on base) | as C | Scored apart. |
| T10 | cannot_verify | merge | human gate | cannot_verify (masking.py named) | as C | Needs the coverage fix ba90b0f. |
| T11 | supported | merge | human gate | supported | supported | |
| T12 | not supported | **merge** | human gate | **supported** (unsafe) | possible catch: setenv switch | The app does not read setenv. |
| T13 | supported | merge | human gate | supported, unless tests/data/ is a guarded path | supported | |
| T14 | not supported | **merge** | human gate | **supported** (unsafe) | likely catch: one currency (like S13) | |
| T15 | contradicted | blocked (tests fail) | blocked | contradicted (full suite failed); strict reason uncertain: the reason may not name the replay test | as C | |
| T16 | supported | merge | blocked (AttributeError) | supported (S03 fix) | supported | |
| T17 | cannot_verify | merge | blocked | cannot_verify (Bug: ModuleNotFoundError on base, test named) | as C | |
| T18 | supported | merge | human gate | supported, if the AC maps to the unittest test ids | risk | |
| T19 | cannot_verify | merge | human gate | cannot_verify (label, S16 fix) | as C | |
| T20 | not supported | **merge** | human gate | **supported** (unsafe) | likely catch: 409 and 404 | |
| T21 | supported | merge | human gate | supported | supported | |
| T22 | cannot_verify | merge | blocked (coverage 67%) | **contradicted** (expected false block: coverage below the floor is a fail, not unknown) | as C | Arguable. |
| T23 | not supported | **merge** | human gate | **supported** (unsafe): the old test stays, only its assertion changes | possible catch | |
| T24 | supported | merge | human gate | supported | supported | |

Expected for C: unsafe supported on T02, T08, T12, T14, T20, T23 (6 of 9 invalid or high stake);
false block on T09 and T22; the 9 controls supported. Expected for D: catches on some of T02,
T08, T14, T20 (the weak-test class) and possibly T12 and T23; risk of a hold on T06 or T18.
Pre-set condition: likely met on catches; the control limit (at most one more hold than C) is
uncertain.
