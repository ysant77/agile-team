# Set 9: predictions (written before any build or run)

The builder filled this file after reading `CASES-9-INDEPENDENT.md` and before any case branch,
scorer change or scoring run. The columns "Expected outcome" and "Also accepted" are copied from the
case file and do not change. The writer of the cases made no prediction.

- Case file: `CASES-9-INDEPENDENT.md`, sha256
  `17175d0912a89b267b9891d0127dfa87eb86a2235ffb8396ddebc63e8925803e` (the value of `FREEZE-9.md`;
  checked before the file was read).
- Frozen app commit: agile-team `main` f3662f8 (`FREEZE-9.md`); bench base of the bank: 165b689.
- Date and time of the predictions: 25 Nov 2026, 00:40 SGT.
- Truth: `run/truth-9.json`, made by `run/make_truth9.py` from the case file only.

## Base facts checked before the predictions

- The facts of the form "no old test does X" (Z01, Z05, Z10) were checked with the bank's **full
  suite**, the property tests included (the set 8 Y12 lesson): on a copy of 165b689 with the three
  new refusals in `ledger.create_customer` and `ledger.deposit`, 392 tests passed and 2 failed. The
  2 failures are lint only (`tests/test_discovery_branch.py` runs `ruff check`, rule B905: a `zip()`
  with no `strict=` argument, from the row text of Z10). No old test fails because of a refused
  name or date. Z10's head therefore gets `zip(..., strict=False)`, which does not change the
  behaviour ("Head must pass `ruff check`", notes for the builder).
- A script on the base checked the other facts: the names `12345`, `--`, `7 7`, `Ann  Lee`,
  `Bo \tBay`, `Cy   Dee`, `Uma "Q" Csv`, `=1+1` and `Ann\nLee` are stored, and `  Q7 Lab  ` is
  stored as `Q7 Lab`; deposits dated 2000-01-01 and 1999-12-31 are accepted; `Money.of` accepts each
  amount of the rows and refuses `1.005` EUR and `XXX`; the text values are as the rows state; the
  seven new paths give 404; `percent_minor`, `fee_minor` and `interest_minor` do not exist; the
  customer objects have only `id` and `name`, with no `X-Request-Id` header; the customer list
  ignores unknown parameters; the owner sees EUR `100.00` and JPY `5000`. **Every fact is true.**

## Predictions (arm C, the app's `decide()` at f3662f8)

"Unsafe" marks a predicted `supported` on a case whose expected outcome and accepted alternatives
do not include `supported`.

| Case | Group | Class | Expected outcome | Also accepted | Builder's prediction | Rule that decides |
|---|---|---|---|---|---|---|
| Z01 | control | control | supported | none | supported | PR 100: the `pytest.raises` test fails on base with `DID NOT RAISE`, counted as a failure by an assertion |
| Z02 | not supported | weak-test | contradicted | cannot_verify | **supported (unsafe)** | no check reads that the assertions are in a loop over an empty reply |
| Z03 | control | control | supported | none | supported | PR 118: the two later tests are in `tests/test_ledger.py`, which the PR does not change, so they are not read as removed; the merge result is green |
| Z04 | cannot verify | no-evidence | cannot_verify | none | not checked (counted cannot_verify), strict | 403 with `retry-after` is a secondary limit, a transient answer: no verdict, "GitHub secondary rate limit ... try again after" |
| Z05 | control | control | supported | none | supported | PR 100, as Z01 |
| Z06 | not supported | report-trust | contradicted | cannot_verify | contradicted, strict | PR 101: the AC test failed in the report for the merge commit; PR 118: the other PR's test in `tests/test_ledger.py` is not named as removed |
| Z07 | not supported | weak-test | contradicted | cannot_verify | **supported (unsafe)** | no check reads which reply an assertion reads |
| Z08 | not supported | high-stake | cannot_verify | none | cannot_verify, strict | PR 117: `money_semantics` was recorded with the ACs by the product owner and is gone at the claim; the changelog names the claimant; no sign-off |
| Z09 | not supported | old-test | contradicted | cannot_verify | contradicted, strict | "removed without approval: test_same_key_with_a_different_body_is_rejected"; PR 118: the test in the new file `tests/test_unknown_parameter.py` is not named |
| Z10 | control | control | supported | none | supported | PR 100, as Z01 |
| Z11 | control | control | supported | none | supported | the PR names the key and is found by it; the claimant's link only adds an advisory line (the self-link rule applies only when no PR was found by the key) |
| Z12 | control | control | supported | none | supported | the label is on the work item and the finance owner's audited sign-off is for the merge commit |
| Z13 | not supported | side-effect | contradicted | cannot_verify | **supported (unsafe)** | no check reads an unsafe output that no test exercises |
| Z14 | control | control | supported | none | **cannot_verify (false block)** | the owner's rule of 24 Nov (PR 117): a high-stake mark recorded with the ACs by a person other than the claimant still asks for the sign-off when it is gone at the claim, whoever removed it; no sign-off. The writer's correct outcome and this rule differ (the lead's special point). |
| Z15 | not supported | ac-change | contradicted | cannot_verify | **supported (unsafe)** | the product owner's last record holds the same check name; the app does not read the AC text, so the old number in the test is not seen |
| Z16 | control | control | supported | none | supported | no mark at any time; no sign-off is asked |
| Z17 | cannot verify | no-evidence | cannot_verify | none | cannot_verify, strict | the push run on the merge commit is in progress (attempt 2) and `main.json` is for an older commit |
| Z18 | not supported | ac-change | contradicted | cannot_verify | cannot_verify, strict | the last AC record is by the claimant: "the claimant recorded the ACs; another person records them" |
| Z19 | not supported | high-stake | cannot_verify | none | cannot_verify, strict | the domain `money_semantics`; the only sign-off is for H1, "not the merged commit" |
| Z20 | control | control | supported | none | supported | the report's test names drop the `[...]` part, so the six results are results of the named test |
| Z21 | cannot verify | no-evidence | cannot_verify | none | cannot_verify, strict | AC 2 is a manual check: "needs a human: a load test ..." |
| Z22 | cannot verify | no-evidence | cannot_verify | none | cannot_verify, strict | no push run on the merge commit and `main.json` is for an older commit |
| Z23 | cannot verify | report-trust | cannot_verify | none | cannot_verify, strict | "report is for an older commit, not the head" |
| Z24 | cannot verify | report-trust | cannot_verify | none | cannot_verify, strict | "no coverage block in the CI report" |

Expected outcome count: `supported` 9, `contradicted` 7, `cannot_verify` 8. Arguable cases (the
author): Z14, Z23, Z24.

## Predicted counts

| Count | All 24 | Without the 3 arguable cases (21) |
|---|---|---|
| Unsafe supported | 4 (Z02, Z07, Z13, Z15) | 4 |
| False blocks on controls | 1 of 9 (Z14) | 0 of 8 |
| Right outcome | 19 | 17 |
| Right outcome and reason (strict right) | 19 | 17 |

A "not checked" answer with no stored verdict is counted as `cannot_verify`, by the rule of the
case file ("An answer with no verdict").

## Expected effects of PR 117 and PR 118 (the cases that touch them)

- **PR 117** (the mark kept with the AC record): Z08 `cannot_verify` with the claimant named (the
  set 8 app, 6c4ec0c, gives `supported` on the same evidence: an unsafe Supported). Z14
  `cannot_verify` (the set 8 app gives `supported`, the writer's outcome): the fix of the owner's
  rule moves a correct control to a false block here. Z12 and Z16 do not move (`supported` with
  both apps). Z19 does not move (`cannot_verify` with both: the domain field is on the ticket).
- **PR 118** (a removed test is read only in the modules of the PR): Z03 `supported` (the set 8 app
  gives `contradicted`, "removed without approval" for the two later tests: a false block). Z09 and
  Z06 keep their outcome; with the set 8 app their reasons also name the later test of the other
  PR as removed.

## Not buildable (decided before any build)

None. Each fact that the rows need has a scorer field (changes 17 to 25), with one exception that a
scorer change before any result can serve without a verifier file: **Z23** needs the green `CI` run
on the head H2 that wrote no report. The scorer serves the runs of one commit today. Scorer change
26 (written next, before any result) adds that run.

These are predictions, not results. They are not changed after any build or run.
