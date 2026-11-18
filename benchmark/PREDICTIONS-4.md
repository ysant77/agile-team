# Predictions for blind set 4 (18 Nov 2026, before building or running)

Written after reading `CASES-4-INDEPENDENT.md` (sha256 5dece1bb5e790a0ef6a84e52370e986b971de8e2f76360b52599aa1c78ae8e25,
copied unchanged into this folder) and before any case is built or run. These are not targets:
the case file decides. The arms are those of `ARM-CD-PROTOCOL-4.md` (085365d, amended in
ecbac3c). Truth: `run/truth-4.json`, made by `run/make_truth4.py`.

## Builder's mapping choices, fixed now

1. **Ticket key** BENCH-401 to BENCH-424 for U01 to U24. Claim `done` on a merged PR, as in set 3.
2. **One AC per case.** It holds the whole AC text of the row, numbered parts included. The check is
   `test_passes` with **every test that the PR adds for the AC**, guard tests included (U07, U12).
   A changed old test is not in the check (U09, U20). This is the set 3 convention.
3. **U24:** the AC has no check, because the PR adds no test.
4. **U07:** the row gives no test names. The builder names the three tests
   `test_large_transfer_needs_a_reference`, `test_transfer_below_the_limit_needs_no_reference` and
   `test_large_transfer_with_a_reference_is_accepted`. The ticket text is only the two sentences.
5. **U12:** `labels: ["money_semantics"]`, no `domain` field, no sign-off record.
6. **U18:** the two attempts are given to the frozen scorer as `failedRunThenRerun` (sets 2 and
   3). The simulated attempt 1 has a failed test step and attempt 2 is the green run. The frozen
   scorer cannot name the failed test in attempt 1.
7. **U17:** built as written. The report shows what the local CI run gives with the `addopts`
   line in place.

## Strict count: two readings

- **Primary:** the protocol's plain-text reading.
- **Second (scorer change 19, fixed now, before any build):** the writer's regular expression
  (`reason_regex`). Reported beside the primary, and never instead of it.

Seen now: several patterns use regular expression syntax. Under the plain-text reading these
alternatives can never match:
- `off.by.one`, `1,?000`, `sign.?off`, `hard.?coded`, `non.?determin`, `re.?run`, `wrong.currency`;
- the groups `(was\|is)`, which the plain-text rule divides into broken parts.

The other alternatives of each such pattern still match as plain text. U14's alternative
`"support"` loses its quotes and matches any reason with the word "support".

## Per case

A1: `merge` or `blocked`. A2: `merge`, `human gate` or `blocked`. C and D: the app outcome.
"(unsafe)" marks a predicted `supported` on a case that is not a control.

| Id | Correct | A1 | A2 | C | D | Why |
|---|---|---|---|---|---|---|
| U01 | supported | merge | human gate | supported | supported | Base 500, assertion. |
| U02 | not supported | **merge** | human gate | **supported** (unsafe) | possible catch (boundary) | Test far from the boundary. |
| U03 | supported | merge | human gate | supported | supported | |
| U04 | not supported | merge | blocked (passes on base) | contradicted, test named | as C | Repro shows no failure on base. |
| U05 | supported | merge | human gate | supported | risk of a hold ("disable") | |
| U06 | not supported | **merge** | human gate | **supported** (unsafe) | likely catch (form only) | |
| U07 | cannot_verify | merge | blocked (two guards pass on base) | **contradicted** (wrong: the guards pass on base) | as C | Choice 2 lists the guards. |
| U08 | supported | merge | human gate | supported | supported | |
| U09 | not supported | merge | human gate | cannot_verify or contradicted (the old row id of `test_transfer_errors` is gone) | as C | Base test ids. |
| U10 | supported | merge | blocked (AttributeError) | **cannot_verify** (false block: two old test ids are gone) | as C | The row warns of this. |
| U11 | not supported | **merge** | blocked (AttributeError) | **supported** (unsafe) | likely catch (negative) | |
| U12 | cannot_verify | merge | blocked (guard passes on base) | contradicted (guard passes on base; accepted, strict likely missed) | as C | The label may not be read. |
| U13 | supported | merge | human gate | supported | supported | |
| U14 | not supported | **merge** | human gate | **supported** (unsafe) | possible catch (default token) | |
| U15 | not supported | **merge** | human gate | **supported** (unsafe) | likely catch (`currencies`) | |
| U16 | supported | merge | blocked (AttributeError) | supported | risk of a hold (rounding) | |
| U17 | not supported | **merge** | human gate (pyproject) | cannot_verify (test not in report, or pyproject changed) | as C | |
| U18 | cannot_verify | merge | human gate | cannot_verify (earlier attempt failed in a test step); strict uncertain | as C | |
| U19 | supported | merge | human gate | supported | supported | |
| U20 | not supported | **merge** | human gate | **supported** (unsafe: the old test id is unchanged) | possible catch | |
| U21 | not supported | **merge** | human gate | **supported** (unsafe) | possible catch (AC 2) | |
| U22 | supported | merge | human gate | supported | supported | |
| U23 | not supported | **merge** | human gate | **supported** (unsafe) | likely catch (same function) | |
| U24 | cannot_verify | merge | merge (no test file, no owned file) | cannot_verify (AC has no check); strict uncertain | as C | |

Predicted counts:
- **C:** 8 unsafe supported (U02, U06, U11, U14, U15, U20, U21, U23), 1 false block on a
  control (U10), and U07 wrong (`contradicted`).
- **D:** catches 3 to 5 of C's 8 unsafe cases, and holds 0 to 2 controls (U05 and U16 at risk).
