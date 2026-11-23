# Judge path (draft, 18 Nov 2026; U12 and the protected set added 19 Nov; reviewer as advice 20 Nov)

A route of about three and a half minutes through the app. It shows the three verdict states on
five real benchmark cases, a sign-off by a second person, and a model's advice that is not
counted. Each case below is from the benchmark files in this repository. The verdict and
the reason are the ones the app gave, copied from the result files.

**Status of this draft:** the five cases ran on the local mock of the benchmark (simulated GitHub
and Jira, bank branches built locally). They are not yet on the demo Jira site.

- **Local check (done):** `fixtures/judge/` holds the recorded evidence of each case, and
  `test/judge-path.test.js` replays it through `decide()`, the verdict view and the panel's
  verdict section. It reads each text on the screen and checks the three states and the advice. U12 and U20 use
  the set 4 evidence with the protected regression set
  (`benchmark/run/evidence/pinned-2026-11-18/s4`, saved by `score.mjs --dump`), as the real
  demo reports have the pinned block since bank PR 21.
- **Demo repository:** the case branches `case/U01`, `case/U04`, `case/U20` and `case/T08`
  (demo PRs 1 to 4), and `case/U12`, which carries the set 4 change of U12 on demo `main`.
- **State on 20 Nov (checked 23:55 SGT):** demo PRs 1, 2, 3, 4 and 6 (U12) are on demo `main`
  e0c82ae. CI is green on each head. Each report has its `pinned` block, and each run has a
  marker artifact that matches the comment.
- **U12 sign-off on the site:** the panel has a section "Sign-off of the merged change" when the
  latest done verdict has a sign-off check. It names the merged commit from that verdict. A person
  other than the claimant gives a reason and presses "Sign off the merged change"; the claimant is
  refused with "You made the latest "done" claim on this work item, so you cannot sign it off."
  The panel then shows who signed, the commit and the audit sequence. The claimant claims again,
  and the verdict is Supported (`test/judge-path.test.js` runs this flow through the action).
- **T08 on the site:** the code checks give Supported. When the Agile Code Reviewer has reviewed
  demo PR 4 first, the panel also shows its findings under "Advice from a model, not counted".
  Without a review the state is the same; only the advice section is absent.
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

1. The state: Supported, Contradicted or Cannot verify.
2. **Why**: the reason that code wrote.
3. **What was proved**: each check that passed, per acceptance criterion (AC).
4. **What was not checked**: each check that could not decide, and always the line
   "Not checked: whether the test covers every case of the criterion."
5. The meaning of "supported": the named test fails before the change and passes after it, on
   the head commit.
6. **Human decision**: what a person must do. Code sets the verdict; no agent can change it.
7. **Advice from a model, not counted** (only when a review is stored for the head commit): each
   finding with its hunk, file, line and the quoted changed line. It does not change the verdict.

## The five cases (2.5 min, about 30 s each)

| State | Case | What the change does | Verdict and reason (from the result file) | What the judge learns |
|---|---|---|---|---|
| Supported | Set 4, U01 (control) | An account id above the 64-bit range gave a server error. The fix answers 404 on the three endpoints; one test asserts 404 for all three AC. | `supported`: "all checks passed" | The test fails on base by an assertion (500 is not 404) and passes on head; CI is green. The view still says what was not checked. |
| Contradicted | Set 4, U04 | A transfer must accept the account number in several typed forms. The PR test passes on base too. | `contradicted`: "test_transfer_accepts_a_typed_account_number passes on base, so it does not reproduce the problem" | A green test is not proof. The test must fail before the change. |
| Contradicted (protected set) | Set 4, U20 | The range check of the account number is written again; the old assertion is made weaker. | `contradicted`: "pinned base test: test_account_numbers_are_obviously_fake: its base copy fails on the head code (failed), and the change edits this test; a real requirement change needs the approval of the new pin by a person other than the claimant". Without the protected set it was `cannot_verify` (the AC test fails on base by Failed, not by an assertion); that line still shows under "What was not checked". | The base copy of an old test still runs on the new code. A change that makes an old assertion weaker is caught, and a real requirement change needs a second person. |
| Cannot verify, then Supported | Set 4, U12 (money rule) | An amount whose extra decimals are all zero is accepted. The work item has the label `money_semantics`. The change is correct, and the tests fail on base and pass on head. | First `cannot_verify`: "money_semantics: a person's sign-off of the merged change is required, and none is recorded". After a sign-off of the merged commit by a person other than the claimant (panel button, audited), the claim again gives `supported`. A sign-off by the claimant, or of another commit, does not count. | Tests alone do not make a money rule done. The app asks for a named person, and it checks that the person is not the claimant. |
| Supported, with advice | Set 3, T08 (weak test) | A filter for `kind=credit` and `kind=debit`. The code handles only credit; the test checks only credit. | `supported`. Under "Advice from a model, not counted", the reviewer's findings on AC1: "Code does not handle kind=debit case for filtering lines." and "Test only checks kind=credit, missing kind=debit case." | The code checks pass a weak test. The model's advice names the gap, but it does not count: a person reads it and decides. Until 20 Nov this advice held the claim; on set 5 the same rule held 2 correct changes and caught none of 4 weak ones, so it now only advises. |

## The honest limit (30 s)

Show the line "Not checked: whether the test covers every case of the criterion." and say:

- On blind set 4 (24 cases written outside the team), the code checks supported 8 invalid
  changes. In each, the test failed before and passed after, but did not check the whole AC.
- On blind set 5 (24 cases, 10 controls), the code checks supported 4 such changes, and blocked
  3 correct ones (C1 not met: the coverage floor, the measurement-path rule and a renamed test).
- The reviewer caught T08 in set 3, none of the 8 in set 4 and none of the 4 in set 5. It is
  advice only from 20 Nov.
- So "supported" is a precise claim about the test, not a claim that the work is correct. A
  person decides to merge.

Source files: `benchmark/RESULTS-4.md`, `benchmark/RESULTS-5.md`, `benchmark/RESULTS-5-ARM-D.md`, `benchmark/run/results/set4/results-acd.json`,
`benchmark/CASES-4-INDEPENDENT.md` (U01, U04, U12, U20), `benchmark/CASES-3-INDEPENDENT.md`
(T08), `benchmark/REGRESSION-LISTING-2026-11-19.md` (the protected set), and the arm D records
of set 3.

## A judge on a fresh site (option 1, prepared 23 Nov)

This route needs no REST console and no help from the owner after the install. Status: the app
side is on branches for review (`feat/panel-ac-editor`, `feat/panel-link-pr`,
`feat/base-report-per-branch`); the steps on the demo cases repository, the deploy and the
install link are held for the owner (`docs/OWNER-HELD-STEPS.md`). Design:
`docs/DESIGN-FRESH-SITE.md`.

**What the judge needs:** a Jira Cloud site, and two accounts on it. Account A records the ACs
and links the PRs; account B makes the claims. The app counts an AC record and a PR link only when
they come from a person other than the claimant.

1. **Install.** Open the install link in the Devpost entry, pick the site, approve the scopes.
2. **Project.** Make a Jira project with any key (for example `KAN`). Make five work items, one
   for each case below, of the type shown. On the U12 work item, add the label `money_semantics`.
3. **ACs (account A).** On each work item, open the **Agile team verifier** panel. In "Edit the
   acceptance criteria", paste the line of the case and press **Save and record**. The panel shows
   the AC and the audit sequence of the record.
4. **PR (account A).** In "Linked pull request", give the number of the case's judge PR
   (the table below; the numbers are filled in after the judge branches exist), a reason, and
   press **Link PR**. The demo PRs name `BANK-5` to `BANK-9`, not the judge's keys, so the link is
   how the app finds the PR.
5. **Claim (account B).** Comment `claim: done` on each work item. The verdict comment appears in
   about 15 s, and the panel shows it.
6. **U12 sign-off (account A).** The first U12 claim is Cannot verify (the money rule needs a
   sign-off). Account A presses "Sign off the merged change" with a reason; account B claims
   again; the verdict is Supported.

| Case | Work item type | Judge branch | Judge PR | Expected verdict |
|---|---|---|---|---|
| U01 | Bug | `judge/U01` | (after step 2 of the owner's list) | Supported |
| U04 | Bug | `judge/U04` | | Contradicted: the AC test passes on base |
| U20 | Bug | `judge/U20` | | Contradicted: a pinned base test fails on the head code |
| U12 | Bug | `judge/U12` | | Cannot verify, then Supported after the sign-off by account A |
| T08 | Story | `judge/T08` | | Supported (advice from the reviewer only if it was run on the PR) |

The AC line of each case (one line; paste it as it is):

**U01** (Bug):

```text
AC1 | for the id 9223372036854775808, (1) GET /api/accounts/{id} gives 404; (2) GET /api/accounts/{id}/statement gives 404; (3) POST /api/transfers with that value as from_account_id gives 404 and moves no money. | test_passes(test_a_huge_account_id_is_404)
```

**U04** (Bug):

```text
AC1 | each of these forms finds the account YMS-0000-0003: (1) lower case, yms-0000-0003; (2) spaces at the start and the end; (3) spaces in place of the hyphens, YMS 0000 0003. | test_passes(test_transfer_accepts_a_typed_account_number)
```

**U20** (Bug):

```text
AC1 | (1) ledger.account_number raises LedgerError for a sequence below 1 or above 99,999,999; (2) for each sequence from 1 to 99,999,999 the number is the same as before. | test_passes(test_account_number_refuses_a_sequence_out_of_range)
```

**U12** (Bug, label `money_semantics`):

```text
AC1 | an amount is accepted if each decimal after the decimals of the currency is zero ("1.0" in JPY is 1 minor unit; "1.2300" in EUR is 123 minor units; "10.000" in a transfer between two EUR accounts gives 201 and the amount "10.00"); an amount with a decimal that is not zero after the decimals of the currency is still refused. | test_passes(test_zero_decimals_are_accepted, test_non_zero_extra_decimals_are_still_refused, test_transfer_accepts_zero_decimals)
```

**T08** (Story):

```text
AC1 | kind=credit returns only lines with a positive amount; kind=debit returns only lines with a negative amount; with no kind all lines are returned. | test_passes(test_statement_can_show_credits_only)
```

**Limits of this route.** The verdicts depend on the five judge branches, each with one merged
case and its report (way A of the design note). Until those exist, a link to a demo PR that is
not merged gives the verdict for an unmerged PR. The T08 advice needs the Agile Code Reviewer in
Rovo on the judge's site.

