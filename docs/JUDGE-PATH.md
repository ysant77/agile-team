# Judge path (draft, 18 Nov 2026)

A route of about three minutes through the app. It shows the four verdict states on four real
benchmark cases. Each case below is from the benchmark files in this repository. The verdict and
the reason are the ones the app gave, copied from the result files.

**Status of this draft:** the four cases ran on the local mock of the benchmark (simulated GitHub
and Jira, bank branches built locally). They are not yet on the demo Jira site.

- **Local check (done):** `fixtures/judge/` holds the recorded evidence of each case, and
  `test/judge-path.test.js` replays it through `decide()`, the verdict view and the panel's
  verdict section. It reads each text on the screen and checks the four states.
- **Demo site (prepared, not done):** `scripts/judge-seed.mjs` writes the `aat.ticket` property
  of each case (with the case's own test names) and prints the branch, PR title and claim.
  - Each case claims `done`, so its PR must be merged. A `ready` claim does not run the
    reproduction check, and U04 and U20 then show Supported.
  - Where to merge (the bank `main` or a second demo repository) is an owner decision.
  - Setting the property needs the owner's sign-in.

## What a judge must see first (30 s)

Open a work item and its **Agile team verifier** panel. The top section is the verdict view:

1. The state: Supported, Contradicted, Cannot verify or Held by review.
2. **Why**: the reason that code wrote.
3. **What was proved**: each check that passed, per acceptance criterion (AC).
4. **What was not checked**: each check that could not decide, and always the line
   "Not checked: whether the test covers every case of the criterion."
5. The meaning of "supported": the named test fails before the change and passes after it, on
   the head commit.
6. **Human decision**: what a person must do. Code sets the verdict; no agent can change it.

## The four cases (2 min, about 30 s each)

| State | Case | What the change does | Verdict and reason (from the result file) | What the judge learns |
|---|---|---|---|---|
| Supported | Set 4, U01 (control) | An account id above the 64-bit range gave a server error. The fix answers 404 on the three endpoints; one test asserts 404 for all three AC. | `supported`: "all checks passed" | The test fails on base by an assertion (500 is not 404) and passes on head; CI is green. The view still says what was not checked. |
| Contradicted | Set 4, U04 | A transfer must accept the account number in several typed forms. The PR test passes on base too. | `contradicted`: "test_transfer_accepts_a_typed_account_number passes on base, so it does not reproduce the problem" | A green test is not proof. The test must fail before the change. |
| Cannot verify | Set 4, U20 | The range check of the account number is written again; the old assertion is made weaker. | `cannot_verify`: "test_account_number_refuses_a_sequence_out_of_range fails on base by Failed, not by an assertion" | The app does not guess. A test that fails for the wrong reason is not evidence; a person must look. |
| Held by review | Set 3, T08 (weak test) | A filter for `kind=credit` and `kind=debit`. The code handles only credit; the test checks only credit. | Code alone: `supported`. With the reviewer: `cannot_verify` in all three runs, held by two blocking findings on AC1: "Code does not handle kind=debit case for filtering lines." and "Test only checks kind=credit, missing kind=debit case." | Code checks passed, but a review found the gap. A review can hold a claim for a person; it can never pass one. |

## The honest limit (30 s)

Show the line "Not checked: whether the test covers every case of the criterion." and say:

- On blind set 4 (24 cases written outside the team), the code checks supported 8 invalid
  changes. In each, the test failed before and passed after, but did not check the whole AC.
- The reviewer, as frozen for set 4, caught none of those 8. It caught T08 in set 3.
- So "supported" is a precise claim about the test, not a claim that the work is correct. A
  person decides to merge.

Source files: `benchmark/RESULTS-4.md`, `benchmark/run/results/set4/results-acd.json`,
`benchmark/CASES-4-INDEPENDENT.md` (U01, U04, U20), `benchmark/CASES-3-INDEPENDENT.md` (T08),
and the arm D records of set 3.
