# Set 6: build record (23 Nov 2026)

This build follows PROTOCOL-5 and the lead's rules for set 6 (23 Nov): the code under test is app
`main` 9ec52ca, frozen until set 6 is scored; nothing under `src/` changed; no scorer change;
local only (no push, PR or merge on the demo repositories, no deploy).

- Case file: `CASES-6-INDEPENDENT.md`, copied unchanged, sha256 `94ec2911...bc8d`.
- Truth: `run/truth-6.json`, made by `run/make_truth6.py` from the case file.
- Predictions: `PREDICTIONS-6.md`, committed before any case branch, manifest or scoring run.

## Base

- `bench-bank-6` is a new local clone of `bench-bank-5`, branch `bench-base` at **dafa314** (the
  bank base of set 5). The clone has no remote, and nothing is pushed from it.
- The writer's "Base facts assumed, not checked" list was checked on dafa314 before any build:
  - True: the key clash 201 then 422 and the old test's `assert clash.status_code == 422` with
    its balance assertion; the 24-hour delete and the old expiry test; the cookie
    `yms_customer=1; HttpOnly; Path=/; SameSite=lax`, and no old test reads its attributes; an
    unknown statement parameter gives 200; `EXPONENTS` has 8 codes (EUR 2, JPY 0); the three
    account numbers and the 100.00 EUR balance of the test fixture; 827 flagged holdout rows;
    `create_customer` strips the name and refuses an empty one (`"\t"` raises `LedgerError`);
    the May window has no seeded line, and `ledger.deposit` takes a date; `GET /api/customers`
    and `GET /api/accounts` ignore an unknown parameter, and no fixture name has `marl`; the
    account objects have `currency` and no `currency_decimals`, and the second account of the
    owner is JPY; the transfer reply has no `receipt` and no `balance_after`; a window from
    2025-11-01 is allowed; the statement body has no `total_lines`, `generated_at` or
    `line_no`; no CORS middleware; `IDEMPOTENCY_WINDOW_SECONDS` is 86400; `days=7` gives another
    `from` date on base; the four new paths give 404; the running balance is computed in
    `ledger.statement`, where the row order can change before it; the side-effect guard test
    lists network and process modules only.
  - **False:** `DELETE /api/session` gives 204 on base (the route `end_session` exists), and
    `GET /api/session` gives 401 with no session (the route `read_session` exists). See W01 and
    W11 below.

## Not buildable (8 of 24)

Seven were decided before the build (`PREDICTIONS-6.md`); W12 was found at the build. None was
rewritten to fit. Each is `void` in `run/manifests/bench-manifest-6.json` with its reason.

| Case | Reason |
|---|---|
| W01 | Base fact false: the base already has `end_session` (`DELETE /api/session`, 204). |
| W11 | Base fact false: the base already has `read_session` (`GET /api/session`, 401 with no session). |
| W04 | The scorer cannot answer each request with 403 and the rate-limit headers. |
| W15 | The scorer serves the report commit as the merge commit, and its report as the main report; the genuine main report of `M` with `H2`'s code cannot be served. |
| W24 | The scorer cannot serve a push run in progress and a main report for the merge commit before `M`. |
| W08 | The scorer has no audited sign-off. Also, the app refuses a sign-off by the claimant, so the row's claimant sign-off "in the app" cannot happen. |
| W17 | The scorer has no audited sign-off, so the product owner's sign-off of `M` cannot be served. |
| W12 | Found at the build: CI is red on the head, not green. The bank test `tests/test_scenario_templates.py::test_a_rendered_fraud_template_runs_beside_the_model_test[S17]` runs every test of `tests/test_fraud_model.py` on seeded code, where 686 holdout rows are flagged, so the row's fixed count 827 fails there. The branch is built (c7cb303) but not scored. |

## Branches (one commit each; W20 has two)

| Case | Head | Case | Head | Case | Head |
|---|---|---|---|---|---|
| W02 | 43e7074 | W10 | 49eef04 | W19 | 390d23e |
| W03 | e6c631c | W13 | ad3b1ea | W20 | 0ba2410 (H1 ed789a8) |
| W05 | c8cbd04 | W14 | 177802f | W21 | 2adf1f6 |
| W06 | af1f178 | W16 | 1d2e436 | W22 | 798d5da |
| W07 | c830ff5 | W18 | a8c9eee | W23 | 042a64d |
| W09 | 6ce4d87 | | | | |

All are built by `run/build_set6.py`.

## Checks on every branch

- `ruff check` and `ruff format --check` pass on each head. W20's first commit (H1) fails
  `ruff format --check` on purpose; H2 changes white space only.
- The CI run (`run/run_ci.py`, as for set 5) has `tests_rc` 0 on every scored head.
- Base and head outcomes of the named tests, from the repro block:
  - each named test fails on base by an assertion and passes on head, except: W13's purge test
    fails on base with `AttributeError` (as the row states); W21's test passes on base (as the
    row states); W22's test is skipped on base and on head (as the row states);
  - the tests that the rows say do not exist are absent: W02's AC 3 test, W13's deleted old test.
- The wrong behaviour that each row states, checked on head:

| Case | Fact on head |
|---|---|
| W02 | `q=%%` returns every customer (the `%` is a wildcard) |
| W06 | two transfers in the same second get the same receipt |
| W10 | `Origin: https://evil.example` gets `Access-Control-Allow-Origin: https://evil.example` and credentials `true`; the cookie is `yms_customer=1; HttpOnly; Path=/; SameSite=none` |
| W13 | a key used three days ago with 5.00 is refused with `IdempotencyConflict` for 6.00; no code of `src/` calls `purge_expired_keys` |
| W18 | the `sort=desc` balances are 103.00, 105.00, 106.00 |
| W21 | `"Ada\tAbel"` is refused; `"Ada\rAbel"` and `"Ada\x00Abel"` are stored |

## Coverage of the changed lines (report against row)

| Case | Row | Report | Note |
|---|---|---|---|
| W06 | 80% (4 of 5; the body of `new_receipt_id` not run) | 100% (4 of 4) | Dispute: the old transfer tests of the bank run the real `new_receipt_id`, so its body is covered. The row's code and tests are as stated. |
| W09 | 83% (5 of 6) | 91% (10 of 11) | The bank's counter also counts the changed `def`, import and final `return` lines. The row's property holds: above the 80% rule, and the one line that no test runs is the early `return []`. |
| W19 | 100% | 100% (1 of 1) | The numbering is one statement of its own; a field inside the `return` statement alone gives 0 changed executable lines. |
| W21 | 100% | 50% (1 of 2) | Dispute: the row's own test names are empty after the strip, so the new `raise` never runs. |
| W22 | 100% | 0 of 0 | Dispute: the row gives the one changed line, a field inside the `return` statement, which the counter does not count as an executable line. |
| others | 100% | 100% | |

## Choices the case text left to the builder

1. **Ticket keys:** BENCH-601 to BENCH-624, in id order. Every claim is `done` on a merged PR.
2. **ACs and checks:** each numbered AC of a row is one AC, with the text cut from the row and the
   check names of the row exactly (`run/make_manifest6.py`). W05's two AC both name the one test.
   W23 has no AC.
3. **Accounts:** claimant `acct-claimant`, product owner `acct-product-owner`, reviewer
   `acct-reviewer`. The product owner's audited AC record is given for every case with AC (the
   default of the case file); W23 has none.
4. **W05:** the reviewer's audited change approval and removal approval of
   `tests/test_api.py::test_same_key_with_a_different_body_is_rejected`, with the row's reason. The
   app has both kinds; both are given.
5. **W13:** one audited change approval by the reviewer; no removal approval. The delete statement
   of `transfer_once` is removed with its age cutoff, which is then unused (ruff F841).
6. **W16:** the product owner's audited record has the limit 30; the stored AC text has 90. No new
   record.
7. **W19:** PR B is the scorer's second open PR (SCORER-CHANGES 17): open, same repository, the
   key in its title. The scorer's title and branch text differ from the row's (`follow-up`); the
   app links by the key only.
8. **W20:** the route counts the customer accounts (`kind = 'customer'`). The database also holds
   two clearing accounts; counting every row gives 5, and the row's test asserts 3.
9. **W12:** the sign-off of the reviewer is not served; the frozen app reads a sign-off only for a
   ticket with a high-stake domain. (W12 is not scored; see above.)
10. **W06, W10:** the commit messages carry the row's text.
11. **Not served,** because the scorer has no field for them and the frozen app does not read them:
    the Jira change history (W16), the PR descriptions (W02, W13), H1's failed run on W20 (the app
    reads the runs of the head commit only).
12. **Arm D** (the model reviewer) was not run: it is advice only and has its own cost.
