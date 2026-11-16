# Predictions for the independent cases (written 16 Nov 2026, before any scoring)

The builder's guesses for `CASES-INDEPENDENT.md` (I01 to I10), written after reading that file and
before building or running any case. They are not targets. The correct outcomes are those of
`CASES-INDEPENDENT.md`; this file does not change them. Terms and the A2 job rule are those of
`CASES.md`, section 1.

| Id | Correct | A1 | A2 | C | D | Why we expect this |
|---|---|---|---|---|---|---|
| I01 | supported | merge | merge | **contradicted** (expected false block) | as C | The AC names existing tests that pass on base. C's D-repro rule wants each ticket test to fail on base, so it reports "passes on base". A2's job looks only at tests the PR adds or changes, and there are none. |
| I02 | supported | merge | **blocked** (false block) | **contradicted** (expected false block) | as C | The new tests pass on base by design. Both A2 and C require a failure on base. |
| I03 | supported | merge | **blocked** (false block) | **contradicted or cannot_verify** (expected false result) | as C | The rename changes every old test id. C may read the old ids as removed tests. `repro.py` copies the whole renamed file, so A2's job sees old tests that pass on base. |
| I04 | supported | merge | **blocked** (false block) | supported or **contradicted** (not known: how C matches the parametrised ids to the AC test name) | as C | The `INV-1` id passes on base. A2 fails on it. C passes only if it treats the four blank ids as the AC test. |
| I05 | contradicted or cannot_verify | **merge** (unsafe) | **merge** (unsafe) | **supported** (expected unsafe miss) | likely catch: the sum of negative lines can never exceed the limit, visible in the diff | The AC test replaces the real function; every rule sees a test that fails on base by an assertion and passes on head. |
| I06 | contradicted or cannot_verify | **merge** (unsafe) | blocked | contradicted (the AC test is skipped on head) | as C | A skip on base is not an assertion failure, so A2's job fails. C needs the AC test to pass on head; skipped is not passed. |
| I07 | contradicted or cannot_verify | **merge** (unsafe) | **merge** (unsafe) | cannot_verify, AC3 named | as C | The two added tests fail on base by an assertion, so A2 passes. C maps each AC; AC3 has no test in the report. |
| I08 | cannot_verify | merge | merge | cannot_verify, fork named | as C | C does not link a PR from a fork, and there is no bot report for the head. A1 and A2 see green required checks. |
| I09 | cannot_verify | blocked (branch not up to date) | blocked | **supported** (expected miss: C checks the head commit, not the base tip) | as C | A1's "branch up to date" rule catches a stale base; C has no rule for a moved base on a `ready` claim. Truth is valid, so this is an unearned `supported`, not an unsafe one. |
| I10 | contradicted or cannot_verify | **merge** (unsafe) | human gate (code owners on `tests/`) | contradicted, removed test ids named | possible catch: `// 3600` gives days, not hours | C compares base and head test ids; the four old ids of `tests/test_idempotency.py` are gone from the head report. It may also name the three moved tests as removed. |

Summary of what we expect: C has an unsafe miss on I05 and an unearned `supported` on I09, and it
gives a false block on three or four of the four controls (I01 to I04). If this holds, the
false-block rate on the independent controls is above the stop signal (more than 1 in 5), and
the D-repro rule needs a change for refactors, test-only tickets, renames and parametrised tests.
That change, if any, is made after scoring, in a new commit, and does not change these numbers.
