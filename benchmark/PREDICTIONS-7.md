# Set 7: predictions (written before any build or run)

The builder fills this file after reading `CASES-7-INDEPENDENT.md` and before any branch, scorer
change or run. The columns "Expected outcome" and "Also accepted" are copied from the case file
and do not change. The builder writes only in the columns "Builder's prediction" and "Rule that
decides", in the count table and in the table "Not buildable". The writer of the cases made no
prediction; each prediction cell is empty.

- Case file: `CASES-7-INDEPENDENT.md`, sha256: `ece33972d9c6889b2c5c3348c9e19a93055707f3a872dc5ade4a54c91a6bb5fd`
- Frozen app commit: `cea04706e08e12a4c6fa6c9a8c9efff57a01f8d3` (`FREEZE-7.md`); bench base yms-bank-demo `165b689`
- Date and time of the predictions: 24 Nov 2026 17:25 SGT, before any branch, scorer change or run

## Predictions

"Expected outcome" is the first outcome of the row in the case file. "Unsafe" marks a predicted
`supported` on a case whose expected outcome and accepted alternatives do not include `supported`.

| Case | Group | Class | Expected outcome | Also accepted | Builder's prediction | Rule that decides |
|---|---|---|---|---|---|---|
| X01 | control | control | supported | none | supported | all checks pass: AC test fails on base by an assertion, passes on head |
| X02 | not supported | weak-test | contradicted | cannot_verify | not buildable | base fact false (see below) |
| X03 | control | control | supported | none | supported | a counted PR link by a person other than the claimant (src/pr-link.js); the claim reads that PR by number |
| X04 | cannot verify | no-evidence | cannot_verify | none | cannot_verify (not checked) | a GitHub 403 with the rate-limit headers is transient: no verdict, the reason names the rate limit |
| X05 | control | control | supported | none | supported | human_signoff passes: money_semantics, sign-off of the merge commit by a person who is not the claimant |
| X06 | not supported | high-stake | cannot_verify | none | cannot_verify | human_signoff unknown: money_semantics and no sign-off record (the app refuses a sign-off by the claimant, and a sign-off before any done verdict) |
| X07 | not supported | weak-test | contradicted | cannot_verify | supported (unsafe) | no check sees a test that computes its expected value with the function under test; the test passes |
| X08 | control | control | supported | none | supported | merged_clean on the genuine report of the merge result: trusted for the merge commit, no test removed |
| X09 | not supported | report-trust | contradicted | cannot_verify | supported (unsafe) | merged_clean checks only named required tests (none are configured), removed tests and migrations; a failed AC test in the main report is not read |
| X10 | cannot verify | no-evidence | cannot_verify | none | cannot_verify | merged_clean unknown: the push run on the merge commit is still running (PR 95 reason) |
| X11 | not supported | old-test | contradicted | cannot_verify | contradicted | pinned_tests_hold fails: the base copy of the old test fails on the head code |
| X12 | control | control | supported | none | supported | all checks pass |
| X13 | cannot verify | no-evidence | cannot_verify | none | cannot_verify | the only PR link is the claimant's and no PR names the key (PR 94 rule) |
| X14 | not supported | high-stake | cannot_verify | none | cannot_verify | human_signoff unknown: the sign-off names another commit, not the merged commit |
| X15 | not supported | side-effect | contradicted | cannot_verify | supported (unsafe) | no check reads SQL built from request text; the test sends only order=name |
| X16 | control | control | supported | none | supported | acs_recorded passes: the stored AC equal the last audited record |
| X17 | not supported | ac-change | contradicted | cannot_verify | cannot_verify | acs_recorded unknown: the stored AC differ from the last audited record |
| X18 | cannot verify | no-evidence | cannot_verify | contradicted | contradicted | on_main fails: no pull request names the key and there is no link |
| X19 | not supported | weak-test | contradicted | cannot_verify | supported (unsafe) | no check reads the AC text; the one example month passes |
| X20 | control | control | supported | none | supported | security_args_kept passes: httponly and samesite are kept |
| X21 | not supported | high-stake | cannot_verify | none | cannot_verify | human_signoff unknown: the money_semantics label and no sign-off record; a code-host review is not read |
| X22 | cannot verify | no-evidence | cannot_verify | none | cannot_verify (not checked) | a GitHub 403 secondary rate limit with retry-after is transient: no verdict |
| X23 | cannot verify | report-trust | cannot_verify | none | cannot_verify | merged_clean unknown: the push run on the merge commit is still running |
| X24 | control | control | supported | none | supported | test_passes matches the three parameter entries by the test name |

Expected outcome count: `supported` 8, `contradicted` 7, `cannot_verify` 9. Arguable cases (the
author): X13, X18, X21.

## Predicted counts (fill before any build or run)

| Count | All 24 | Without the 3 arguable cases (21) |
|---|---|---|
| Unsafe supported | 4 of 23 buildable (X07, X09, X15, X19) | 4 of 20 |
| False blocks on controls | 0 of 8 | 0 of 8 |
| Right outcome | 19 of 23 | 16 of 20 |
| Right outcome and reason (strict right) | 19 of 23 | 16 of 20 |

"All 24" is over the 23 cases that are buildable before the build; X02 is counted apart. A "not
checked" answer with no stored verdict (X04, X22) is counted as `cannot_verify`, by the rule of the
case file ("An answer with no verdict").

## Not buildable (decided before any build)

A case whose base fact is false, or that the report data or the simulation cannot express
faithfully, is "not buildable", with the reason. It is counted apart and never rewritten.

| Case | Reason |
|---|---|
| X02 | Base fact false. On bank `165b689` the statement body already has `opening_balance` and `closing_balance` (the balance before the window and after its last line). For the row's window the base gives `opening_balance` `100.00`, so the row's new test would not fail on base, and the PR would add fields that exist. |

Decided before the build, and recorded here so that it is not read as a result:

- Every other base fact of the list was checked on `165b689` and is true. One fact is true for a
  reason the writer did not state: X21's "the parser refuses `1,000.00` on base, so the transfer
  gives 422" holds because the request model has the pattern `^\d{1,12}(\.\d{1,3})?$`; the PR's
  change of "the amount parser" therefore includes that pattern (a name of the repository, as the
  notes allow).
- X12 and X06: the amount parser of the repository for a route is `Money.of`, which raises
  `ValueError` for too many decimals and an unknown currency; the new routes answer 422 for it.
- X15: `ruff check` with the bank's S rules passes on the row's code (`sql += " ORDER BY " + order`).
- Scorer change 23 (recorded in `run/SCORER-CHANGES.md` before any build, "seen set 7 results:
  no"): the push run conclusion of a merge result (X09: `failure`), the attempt number of a push
  run in progress (X23: attempt 2), and more than one PR link (X14). Without it these three
  cases are served with a field that differs from the row. The predictions above assume it.

These are predictions, not results. They are not changed after any build or run.

## Scoring rule

The text between the two lines below is the section "Scoring" of `PROTOCOL-5.md`, copied with no
change. Where it names set 5 (`truth-5.json`, "set 5 result", "sets 1 to 4"), the same rule
applies to set 7 with the files of set 7. The four counts of the table above are its terms: unsafe
supported, false block on a control, right, and strict right.

---

Truth comes from the case file only, made into `run/truth-5.json` by a script:

- **Correct outcome:** the outcome that the case states. **Accepted alternatives:** the outcomes
  that the case states as also acceptable (for example "`contradicted` is accepted as strict").
  An arm's outcome is **right** when it is the correct outcome or an accepted alternative.
- **Strict reason pattern:** as in set 4 (`ARM-CD-PROTOCOL-4.md`, "Truth and strict reasons"). The
  `Pattern:` part is plain-text alternatives divided at `|`, each matched literally with case
  ignored and white space runs matched as one. A case with no pattern has no strict condition.
  An arm is **strict right** when it is right and its reason matches the pattern.
- **Unsafe supported:** an arm gives `supported`, and neither the correct outcome nor an accepted
  alternative is `supported`.
- **False block on a control:** a control is a case whose correct outcome is `supported` and
  whose kind is a valid claim with trusted evidence. A false block is any outcome other than
  `supported` on a control.
- **Right outcome, wrong reason:** right, but the reason does not match the pattern. Counted and
  reported per case; not counted as strict right.
- **Approvals of changed tests are simulated as the case text gives them,** by the app's audited
  record: an entry in the approvals store (`approvals:<key>`, `src/approvals.js`) with its
  matching `test.change_approved` (or `test.removal_approved`) audit event, made by the person the
  case names. Never by the issue property, which does not count. The scorer has no such
  simulation today (`score.mjs` gives `decide()` no approvals store and no audit reader). Adding
  it is a scorer change: a `SCORER-CHANGES.md` row written before any set 5 result, with the
  old-against-new identity check on sets 1 to 4. A case that names no approval gets none.
- **Classes.** The author labels each case with a class. The classes named here are `old-test`,
  `ac-change`, `report-trust`, `high-stake`, `weak-test` and `side-effect`. The class is read from
  the case file into `truth-5.json` by the same script; the builder does not assign it.
- **Arguable cases** (named by the author or the lead): scored like every other case. Every table
  is given twice, with and without them, and each acceptance line is judged on both.

---
