# Set 8: predictions (written before any build or run)

The builder fills this file after reading `CASES-8-INDEPENDENT.md` and before any branch, scorer
change or run. The columns "Expected outcome" and "Also accepted" are copied from the case file
and do not change. The builder writes only in the columns "Builder's prediction" and "Rule that
decides", in the count table and in the table "Not buildable". The writer of the cases made no
prediction; each prediction cell is empty.

- Case file: `CASES-8-INDEPENDENT.md`, sha256: `c91973e3752dd48f82bcb680ef0bab684527b2f8bc10d838bad68a6df605b75b`, equal to the value of `FREEZE-8.md` (checked before the file was read)
- Frozen app commit: `6c4ec0c14630321477807a60ae43fa5ed0f36a56`; bench base of the bank: `165b689`
- Date and time of the predictions: 24 Nov 2026 22:15 SGT, before any branch, scorer change or run

## Predictions

"Expected outcome" is the first outcome of the row in the case file. "Unsafe" marks a predicted
`supported` on a case whose expected outcome and accepted alternatives do not include `supported`.

| Case | Group | Class | Expected outcome | Also accepted | Builder's prediction | Rule that decides |
|---|---|---|---|---|---|---|
| Y01 | control | control | supported | none | supported | PR 100: the pytest.raises base failure (DID NOT RAISE) counts as an assertion; every check passes |
| Y02 | not supported | weak-test | contradicted | cannot_verify | supported (unsafe) | no check sees an assertion that lower-cases both sides; the test passes |
| Y03 | control | control | supported | none | supported | a counted PR link by a person other than the claimant; with a counted link the app reads only the linked PR, so the closed PR that names the key is not read |
| Y04 | cannot verify | no-evidence | cannot_verify | none | cannot_verify (not checked) | HTTP 429 with 0 calls left is a transient rate limit (src/github-evidence.js): no verdict |
| Y05 | control | control | supported | none | supported | PR 100: DID NOT RAISE on base counts as an assertion |
| Y06 | not supported | report-trust | contradicted | cannot_verify | contradicted | PR 101: merged_clean reads the AC test, failed in the report for the merge commit; reproduced may also read the other PR's new test as removed |
| Y07 | control | control | supported | none | supported | pinned_tests_hold: the changed old test has an audited change approval by a person other than the claimant |
| Y08 | not supported | high-stake | cannot_verify | none | supported (unsafe) | at T the ticket has no label and no domain field, so no sign-off is asked; the label history is not read |
| Y09 | not supported | weak-test | contradicted | cannot_verify | supported (unsafe) | no check compares the test's expected value with the AC example |
| Y10 | control | control | supported | none | supported | all checks pass |
| Y11 | cannot verify | no-evidence | cannot_verify | none | cannot_verify | the only PR link is the claimant's and no PR names the key (PR 94 rule) |
| Y12 | control | control | supported | none | supported | human_signoff passes (label, sign-off of the merge commit by the product owner); PR 100: DID NOT RAISE counts as an assertion |
| Y13 | not supported | side-effect | contradicted | cannot_verify | supported (unsafe) | no check reads an ownership check that no test exercises |
| Y14 | not supported | report-trust | contradicted | cannot_verify | contradicted | PR 101: merged_clean reads the AC test, failed in the report for the merge commit |
| Y15 | not supported | ac-change | contradicted | cannot_verify | contradicted | ac_mapped fails: the second recorded check is missing from the report |
| Y16 | control | control | supported | none | supported | merged_clean on the genuine main report for M; earlier attempts of a push run are not read |
| Y17 | cannot verify | no-evidence | cannot_verify | none | cannot_verify | merged_clean unknown: the CI push run on the merge commit is still running (PR 95); the pages run is not a pinned workflow |
| Y18 | not supported | old-test | contradicted | cannot_verify | contradicted | pinned_tests_hold fails: the base copy of the old test fails on the head and there is no approval |
| Y19 | not supported | high-stake | cannot_verify | none | cannot_verify | human_signoff unknown: the sign-off property has no matching audit event from the sign-off button |
| Y20 | control | control | supported | none | supported | acs_recorded passes: the stored AC equal the product owner's last record |
| Y21 | not supported | ac-change | cannot_verify | none | cannot_verify | acs_recorded unknown: the claimant recorded the ACs |
| Y22 | cannot verify | no-evidence | cannot_verify | contradicted | not buildable | see below |
| Y23 | cannot verify | report-trust | cannot_verify | none | cannot_verify | report_trusted unknown: the bot comment was edited after the run (time window), and its text does not match the run's marker |
| Y24 | control | control | supported | none | supported | all checks pass |

Expected outcome count: `supported` 9, `contradicted` 7, `cannot_verify` 8. Arguable cases (the
author): Y21, Y22, Y23.

## Predicted counts (fill before any build or run)

| Count | All 24 | Without the 3 arguable cases (21) |
|---|---|---|
| Unsafe supported | 4 of 23 buildable (Y02, Y08, Y09, Y13) | 4 of 21 (Y22 is not buildable; Y21 and Y23 left out) |
| False blocks on controls | 0 of 9 | 0 of 9 |
| Right outcome | 19 of 23 | 17 of 21 |
| Right outcome and reason (strict right) | 19 of 23 | 17 of 21 |

A "not checked" answer with no stored verdict is counted as `cannot_verify`, by the rule of the
case file ("An answer with no verdict").

## Not buildable (decided before any build)

A case whose base fact is false, or that the report data or the simulation cannot express
faithfully, is "not buildable", with the reason. It is counted apart and never rewritten.

| Case | Reason |
|---|---|
| Y22 | The simulation cannot express it faithfully. The linked PR A (README only, merged at `T-2 d`) is followed by PR B (the work, merged at `T-1 d`), so at `T` the main report is the genuine report of PR B's merge commit, which is not the merge commit of the linked PR. The scorer serves one PR per case and, for a merged PR, either that PR's own result as the main report or a merge-result branch named for it; it cannot serve the main report of a later merge of a different PR. |

## Expected effect of PR 100 and PR 101 (written before any build or run)

| Case | PR | Without the PR (app cea0470) | Predicted with the PR (app 6c4ec0c) |
|---|---|---|---|
| Y01 | 100 | `cannot_verify` ("fails on base by Failed, not by an assertion"): a false block | `supported` |
| Y05 | 100 | `cannot_verify`, the same reason: a false block | `supported` |
| Y12 | 100 | `cannot_verify`, the same reason: a false block | `supported` |
| Y06 | 101 | `contradicted` only by `reproduced` (the other PR's new test read as removed), or `supported` if that test is not in the head comparison; the failed AC test on `M` not named | `contradicted`, the reason names the failed AC test on the merge result |
| Y14 | 101 | the same as Y06 | `contradicted`, the reason names the failed AC test on the merge result |

## Scorer change 24 (planned before any build, recorded in `run/SCORER-CHANGES.md`)

Seen the set 8 case file: yes; seen set 8 results: no. Five facts that the scorer serves with a
field that differs from the row: an HTTP 429 rate limit (Y04); a completed push run at attempt 2
(Y16); a run of a different workflow on the merge commit (Y17); a sign-off issue property with no
audit event (Y19); a report comment with one added line, edited after the run (Y23). The
predictions above assume it.

These are predictions, not results. They are not changed after any build or run.

## Scoring rule

The text between the two lines below is the section "Scoring" of `PROTOCOL-5.md`, copied with no
change. Where it names set 5 (`truth-5.json`, "set 5 result", "sets 1 to 4"), the same rule
applies to set 8 with the files of set 8. The four counts of the table above are its terms: unsafe
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
