# Judge path (draft, 18 Nov 2026; U12 and the protected set added 19 Nov)

A route of about three and a half minutes through the app. It shows the four verdict states on
five real benchmark cases, and a sign-off by a second person. Each case below is from the benchmark files in this repository. The verdict and
the reason are the ones the app gave, copied from the result files.

**Status of this draft:** the five cases ran on the local mock of the benchmark (simulated GitHub
and Jira, bank branches built locally). They are not yet on the demo Jira site.

- **Local check (done):** `fixtures/judge/` holds the recorded evidence of each case, and
  `test/judge-path.test.js` replays it through `decide()`, the verdict view and the panel's
  verdict section. It reads each text on the screen and checks the four states. U12 and U20 use
  the set 4 evidence with the protected regression set
  (`benchmark/run/evidence/pinned-2026-11-18/s4`, saved by `score.mjs --dump`), as the real
  demo reports have the pinned block since bank PR 21.
- **Demo repository:** the case branches `case/U01`, `case/U04`, `case/U20` and `case/T08`
  (demo PRs 1 to 4), and `case/U12`, which carries the set 4 change of U12 on demo `main`.
- **Demo site (prepared, not done):** `scripts/judge-seed.mjs` writes the `aat.ticket` property
  of each case (with the case's own test names) and prints the branch, PR title, labels, claim
  and the expected verdict.
  - **The judge path uses `done` claims only.** Each case claims `done`, so its PR must be
    merged. The other claim types do not show the intended verdicts on these cases (scored on
    the real demo reports, 19 Nov):
    - `fixed` on a Bug ticket needs a test whose name carries the key token (for example
      `test_BENCH401_...`; `create-ticket` names tests this way). The case tests keep their own
      names, so `fixed` gives Contradicted ("no test named for ...") on every Bug case.
    - `ready` does not run the reproduction check, so U04 shows Supported; it also needs CI on
      the current base.
    - Only `done` runs the reproduction, the merge, the coverage and the sign-off checks. A
      rehearsal on the real demo data (U01, merged as demo PR 7) gave Supported with all of them.
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

## The five cases (2.5 min, about 30 s each)

| State | Case | What the change does | Verdict and reason (from the result file) | What the judge learns |
|---|---|---|---|---|
| Supported | Set 4, U01 (control) | An account id above the 64-bit range gave a server error. The fix answers 404 on the three endpoints; one test asserts 404 for all three AC. | `supported`: "all checks passed" | The test fails on base by an assertion (500 is not 404) and passes on head; CI is green. The view still says what was not checked. |
| Contradicted | Set 4, U04 | A transfer must accept the account number in several typed forms. The PR test passes on base too. | `contradicted`: "test_transfer_accepts_a_typed_account_number passes on base, so it does not reproduce the problem" | A green test is not proof. The test must fail before the change. |
| Contradicted (protected set) | Set 4, U20 | The range check of the account number is written again; the old assertion is made weaker. | `contradicted`: "pinned base test: test_account_numbers_are_obviously_fake: its base copy fails on the head code (failed), and the change edits this test; a real requirement change needs the approval of the new pin by a person other than the claimant". Without the protected set it was `cannot_verify` (the AC test fails on base by Failed, not by an assertion); that line still shows under "What was not checked". | The base copy of an old test still runs on the new code. A change that makes an old assertion weaker is caught, and a real requirement change needs a second person. |
| Cannot verify, then Supported | Set 4, U12 (money rule) | An amount whose extra decimals are all zero is accepted. The work item has the label `money_semantics`. The change is correct, and the tests fail on base and pass on head. | First `cannot_verify`: "money_semantics: a person's sign-off of the merged change is required, and none is recorded". After a sign-off of the merged commit by a person other than the claimant (panel button, audited), the claim again gives `supported`. A sign-off by the claimant, or of another commit, does not count. | Tests alone do not make a money rule done. The app asks for a named person, and it checks that the person is not the claimant. |
| Held by review | Set 3, T08 (weak test) | A filter for `kind=credit` and `kind=debit`. The code handles only credit; the test checks only credit. | Code alone: `supported`. With the reviewer: `cannot_verify` in all three runs, held by two blocking findings on AC1: "Code does not handle kind=debit case for filtering lines." and "Test only checks kind=credit, missing kind=debit case." | Code checks passed, but a review found the gap. A review can hold a claim for a person; it can never pass one. |

## The honest limit (30 s)

Show the line "Not checked: whether the test covers every case of the criterion." and say:

- On blind set 4 (24 cases written outside the team), the code checks supported 8 invalid
  changes. In each, the test failed before and passed after, but did not check the whole AC.
- The reviewer, as frozen for set 4, caught none of those 8. It caught T08 in set 3.
- So "supported" is a precise claim about the test, not a claim that the work is correct. A
  person decides to merge.

Source files: `benchmark/RESULTS-4.md`, `benchmark/run/results/set4/results-acd.json`,
`benchmark/CASES-4-INDEPENDENT.md` (U01, U04, U12, U20), `benchmark/CASES-3-INDEPENDENT.md`
(T08), `benchmark/REGRESSION-LISTING-2026-11-19.md` (the protected set), and the arm D records
of set 3.
