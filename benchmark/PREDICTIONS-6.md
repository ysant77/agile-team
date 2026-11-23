# Set 6: predictions (written before any build or run)

The builder fills this file after reading `CASES-6-INDEPENDENT.md` and before any branch, scorer
change or run. The columns "Expected outcome" and "Also accepted" are copied from the case file
and do not change. The builder writes only in the columns "Builder's prediction" and "Rule that
decides", and in the count table.

- Case file: `CASES-6-INDEPENDENT.md`, sha256: `94ec29110cd3c53eba574246cb7126f79a095f1d644bab37b2d8d8a2d6b6bc8d`
- Frozen app commit: `9ec52ca` (app `main` after PRs 65, 66 and 67)
- Date and time of the predictions: 2026-11-23 16:06 SGT, before any case branch, manifest or scoring run

## Predictions

"Expected outcome" is the first outcome of the row in the case file. "Unsafe" marks a predicted
`supported` on a case whose expected outcome and accepted alternatives do not include `supported`.

| Case | Group | Class | Expected outcome | Also accepted | Builder's prediction | Rule that decides |
|---|---|---|---|---|---|---|
| W01 | control | control | supported | none | not buildable | the base already has `end_session` (`DELETE /api/session` gives 204); see below |
| W02 | not supported | weak-test | contradicted | cannot_verify | contradicted | `test_passes` checks every named test (PR 67): the AC 3 test is missing from the report |
| W03 | control | control | supported | none | supported | every named test of both AC passes; the first of each fails on base by an assertion |
| W04 | cannot verify | no-evidence | cannot_verify | none | not buildable | the scorer serves no 403 answer; see below |
| W05 | control | control | supported | none | supported | audited removal and change approvals by the reviewer cover the renamed and edited old test |
| W06 | not supported | weak-test | contradicted | cannot_verify | cannot_verify | `ac_tests_run_new_code`: the test replaces `new_receipt_id`, which the PR adds; coverage 4 of 5 is at the 80% floor, so it passes |
| W07 | control | control | supported | none | supported | the new module constant is not set by a test, so the V18 rule does not apply |
| W08 | not supported | high-stake | cannot_verify | none | not buildable | the app refuses a sign-off by the claimant, and the scorer has no audited sign-off; see below |
| W09 | control | control | supported | none | supported | 5 of 6 changed lines (83%) is above the floor |
| W10 | not supported | side-effect | contradicted | cannot_verify | supported (unsafe) | `samesite` and CORS are not in the narrow security-argument list; `httponly=True` is kept |
| W11 | cannot verify | no-evidence | cannot_verify | none | not buildable | the base already has `read_session` (`GET /api/session` gives 401 with no session); see below |
| W12 | control | control | supported | none | cannot_verify (false block) | `measurement_unchanged`: `src/fraud/model.py` and `tests/test_fraud_model.py` are guarded paths; the app reads no sign-off for a ticket with no domain |
| W13 | not supported | old-test | contradicted | cannot_verify | contradicted | the AC 2 test is missing from the report. The removal check passes: the module gains a new test id, so the change approval covers the deleted test (a fault of the rename rule, predicted here) |
| W14 | control | control | supported | none | supported | three named tests pass; `re` and `uuid` are not in the side-effect guard list |
| W15 | not supported | report-trust | cannot_verify | contradicted | not buildable | the scorer serves the report commit as the merge commit; see below |
| W16 | cannot verify | ac-change | cannot_verify | none | cannot_verify | `acs_recorded`: the stored AC differ from the audited record of the product owner |
| W17 | control | control | supported | none | not buildable | the scorer has no audited sign-off; see below |
| W18 | not supported | weak-test | contradicted | cannot_verify | supported (unsafe) | the test asserts the order only, and no check reads the balances |
| W19 | cannot verify | no-evidence | cannot_verify | none | cannot_verify | `on_main` unknown: two open or merged PRs name the key ("link one PR"); the reason does not match the pattern |
| W20 | control | control | supported | none | supported | the failed run is on an earlier commit; the app reads runs of the head only |
| W21 | not supported | weak-test | contradicted | cannot_verify | contradicted | `reproduced`: the AC test passes on base |
| W22 | cannot verify | no-evidence | cannot_verify | none | contradicted | `ac_mapped`: a skipped test is not "passed", so the AC check fails; the row says never `contradicted` |
| W23 | not supported | no-evidence | cannot_verify | none | cannot_verify | `ac_mapped` unknown: "nothing to check" (PR 66) |
| W24 | cannot verify | no-evidence | cannot_verify | none | not buildable | the scorer serves the merged report as the main report; see below |

Expected outcome count: `supported` 9, `contradicted` 6, `cannot_verify` 9. Arguable cases (the
author): W11, W16, W23.

## Predicted counts (fill before any build or run)

| Count | All 24 | Without the 3 arguable cases (21) |
|---|---|---|
| Unsafe supported | 2 of 17 (W10, W18) | 2 of 15 |
| False blocks on controls | 1 of 7 (W12) | 1 of 7 |
| Right outcome | 13 of 17 | 11 of 15 |
| Right outcome and reason (strict right) | 12 of 17 (W19 has the wrong reason) | 10 of 15 |

The counts are over the 17 buildable cases (15 without the arguable W16 and W23; W11 is not
buildable). The 7 cases that are not buildable are counted apart and have no prediction.

## Not buildable (decided before any build)

The lead's rule: a case whose base fact is false, or that the report data or the scorer's stub
cannot express faithfully, is "not buildable", with the reason, counted apart and never rewritten.
The base facts were checked on the bank base `dafa314` (the base of set 5).

| Case | Reason |
|---|---|
| W01 | Base fact false: the base already has `end_session` (`DELETE /api/session`, status 204, it deletes the cookie). The row's PR adds that route, and the assumption "gives 405 on base" is false. |
| W11 | Base fact false: the base already has `read_session` (`GET /api/session`; 401 with no session through the session dependency). The row's PR adds that route, and the assumption "gives 405 on base" is false. |
| W04 | The scorer's simulated GitHub answers every path with data or 404. It cannot answer each request with 403 and the rate-limit headers. |
| W15 | The scorer serves a merged PR as a fast-forward of the commit CI ran on: with the report made on `H1`, the merge commit and the main report would be `H1`'s, not the genuine report of `M` that has `H2`'s code. |
| W24 | The scorer serves the merged PR's report as the main report, with a successful push run. It cannot serve a push run in progress and a main report for the merge commit before `M`. |
| W08 | The scorer has no audited sign-off record (the Jira simulation serves the AC record and test approvals only). Also, the app's panel refuses a sign-off by the claimant, so "the claimant records a sign-off of `M` in the app" cannot happen in the app. |
| W17 | The scorer has no audited sign-off record, so the product owner's sign-off of `M` cannot be served; the money-rule check would read "none is recorded". |

These are predictions, not results. They are not changed after any build or run.

## Scoring rule

The text between the two lines below is the section "Scoring" of `benchmark/PROTOCOL-5.md`, copied
with no change. Where it names set 5 (`truth-5.json`, "set 5 result", "sets 1 to 4"), the same rule
applies to set 6 with the files of set 6. The four counts of the table above are its terms: unsafe
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
