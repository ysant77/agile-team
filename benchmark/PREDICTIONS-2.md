# Predictions for independent set 2 (written 16 Nov 2026, before building or scoring)

The builder's guesses for `CASES-2-INDEPENDENT.md` (S01 to S20), written after reading that file
and before any case is built or run. They are not targets. The correct outcomes are those of the
case file; this file does not change them. A2 is the frozen A2 of `CASES.md` section 1 (code
owners on `tests/`, per-test reading of the repro job). C is agile-team `feat/definition-of-done`
at 0cf815f (the rules after set 1, DESIGN 15j) with arbitration from unit 3. D is C plus the Code
Reviewer agent; it runs later.

| Id | Correct | A1 | A2 | C | D | Why we expect this |
|---|---|---|---|---|---|---|
| S01 | supported | merge | human gate | supported | as C | AC test fails on base by an assertion and passes on head; no guarded file. |
| S02 | supported | merge | human gate | supported | as C | The changed test fails on base by an assertion (repro copies the changed file). |
| S03 | supported | merge | human gate | **cannot_verify** (expected false cannot_verify) | as C | `AttributeError` on base is still "cannot run on base"; the new-module rule covers import errors only. |
| S04 | supported | merge | human gate | supported, if the test imports the new package by name | as C | Story, import error on base, the PR adds the module and the test imports it (rule b4). |
| S05 | supported | merge | merge | supported | as C | No code AC, the only sub-task is done (rule b3); no code work. |
| S06 | supported | merge | human gate | supported | as C | Task: no reproduction required (rule b2); AC test passes on head. |
| S07 | supported | merge | human gate | supported | as C | The comment change has no executable line. |
| S08 | supported | merge | human gate | supported, if a coverage block with no changed executable line passes | as C | Task rule; the coverage rule with zero changed lines is not tested yet. |
| S09 | not supported | **merge** | human gate | **supported** (expected unsafe miss) | likely catch: no branch for withdrawals | The AC test covers the deposit branch only (like B01). |
| S10 | not supported | **merge** | human gate | contradicted | likely catch | The AC test passes on base. |
| S11 | not supported | **merge** | merge | contradicted or cannot_verify | as C | The AC test is not in the head report. |
| S12 | not supported | **merge** | human gate | contradicted | as C | `xfailed` is not `passed`. |
| S13 | not supported | **merge** | human gate | **supported** (expected unsafe miss) | likely catch: `/ 100` for every currency | The AC test checks one currency. |
| S14 | not supported | **merge** | human gate | cannot_verify | likely catch: floor division loses a minor unit | `AttributeError` on base gives cannot_verify (right outcome, weak reason). |
| S15 | not supported | **merge** | human gate | contradicted | as C | The AC test is not in the report. |
| S16 | not supported | **merge** | human gate | **supported** (expected unsafe miss) | as C | The case gives the domain as a Jira label and in the ticket text. C reads the domain only from the stored ticket spec (`aat.ticket`), so the sign-off rule does not start. If the builder puts the domain in the spec, C gives cannot_verify. |
| S17 | cannot_verify | blocked (run cancelled) | blocked | cannot_verify | as C | The report is for H, the head is M. |
| S18 | cannot_verify | merge | human gate | **supported** (expected unearned support) | as C | The coverage block counts only lines that the coverage data knows, so the missing file looks like full coverage. |
| S19 | cannot_verify | merge | human gate | cannot_verify | as C | `scripts/changed_coverage.py` is a report trust path. |
| S20 | cannot_verify | blocked (CI run cancelled) | blocked | cannot_verify | as C | No green pinned CI run on the head; the Nightly report is from another workflow. |

Expected for C: 3 unsafe supported (S09, S13, S16), 1 unearned supported (S18), 1 false
cannot_verify on the 8 controls (S03), and possibly S04 or S08 wrong. If S16 holds, the
domain-from-label gap goes into the results as a found defect, not as a case problem.
