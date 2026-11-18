# Build record, set 4 (18 Nov 2026, before any arm runs)

Built from `CASES-4-INDEPENDENT.md` (sha256 5dece1bb...) on a local clone of the bank,
`bench-bank-4`. The base is `bench-base` = bank `main` 00167dd. The clone has no remote.
- Builder script: `run/build_set4.py`. Manifest: `run/manifests/bench-manifest-4.json`, written
  by `run/make_manifest4.py`. The mapping choices are in `PREDICTIONS-4.md`.
- Evidence: `run/run_all.py` with the frozen bank scripts of 00167dd. The BASE report has 311
  tests, and lint and tests pass.
- Head facts: `run/check_set4_heads.py` checks, on each head, the wrong behaviour that a row
  states: U02, U04, U06, U09, U11, U14, U15, U17, U20, U21 and U23. All hold.

## Void cases

None. The cases the writer flagged were checked:
- **U17:** built as written. With the `addopts` line, the AC test is not in the head report. The
  base run of the repro step does not deselect it, so it is not a repro row either. Without the
  option, the test fails on head (500).
- **U18:** built as written. The two attempts are simulated (`failedRunThenRerun`). The local
  CI run on the head passed.
- **U14:** built as written. The default `"support"` is in the source only.
- **U20:** no other test has an exact account number for a sequence of 1,000 or more. The base
  run of the new test fails with `Failed` (DID NOT RAISE), which the case counts as an assertion.

## Builder choices recorded

1. The mapping choices 1 to 7 of `PREDICTIONS-4.md` (ticket keys, one AC with every PR test,
   U24 with no check, U07 test names, the U12 label only, U18 simulated attempts, U17 as written).
2. **Changed-line coverage made to match the rows.** Coverage counts the first line of a
   statement only. In the first build, U18 and U19 changed only the inner lines of a statement,
   so the report gave 0 of 0 changed executable lines. The rows state 100%, and the verifier reads
   0 of 0 with changed code as unknown (a known limit; set 3 T24 had the same shape). U14's
   first dependency had two branches the row does not ask for, which gave 10 of 13 lines (77%).
   Rebuilt before any arm ran, with the same behaviour:
   - **U19:** `internal` is computed in its own statement (1 of 1).
   - **U18:** the new DELETE text is one statement (2 of 2).
   - **U14:** the support path returns the account directly (7 of 7). The row does not say what
     happens for an unknown id or a system account with the token, so the build does not add it.
3. **U03 and U06** read the statement with `?from=2026-05-01`, so the deposit line of the
   fixture is in the window. The rows give no window.
4. **U11 and U16** tests import the module inside the test (`from bank import money`), so the
   file still collects on base (case notes).
5. Each head was formatted with the repository's ruff settings. Lint and format pass on every
   head.

## Evidence summary (repro rows of the AC tests)

| Case | Base outcome of the AC tests | Changed-line coverage | Other |
|---|---|---|---|
| U01, U02, U03, U05, U06, U08, U09, U13, U15, U21, U22, U23 | failed, AssertionError | full | U09: the old row id `test_transfer_errors[100.01-YMS-0000-0003-409]` is not on head |
| U04 | passed | 1/1 | |
| U07 | first test failed (AssertionError); two guards passed | 3/3 | |
| U10, U11, U16 | failed, AttributeError | full | U10: two old test ids are not on head (renamed) |
| U12 | two failed (AssertionError); the guard passed | 4/4 | |
| U14 | failed, AssertionError | 7/7 | |
| U17 | no repro row (the AC test is deselected on head) | 0/0, no source change | `pyproject.toml` in `changed_support` |
| U18 | failed, AssertionError | 2/2 | attempts simulated |
| U19 | failed, AssertionError | 1/1 | |
| U20 | failed, Failed (DID NOT RAISE) | 4/4 | |
| U24 | no test | 0/0, JavaScript only | |

## Head commits

```
U01 5a1adae
U02 df73d52
U03 71a23b4
U04 f5ff887
U05 6bf7263
U06 a6bbdb4
U07 487e3bf
U08 75ee644
U09 6f23216
U10 084c30a
U11 8421d61
U12 d4fec0f
U13 d5adeb6
U14 d15ec22
U15 9765647
U16 a07318c
U17 0b62ec4
U18 3a82f2d
U19 6c68d1c
U20 c94ba7d
U21 1ace822
U22 d3184f5
U23 2974296
U24 0114338
```
