# Set 8: build record (24 Nov 2026)

This build follows PROTOCOL-5, `FREEZE-8.md` and the rulings that held for set 7: the code under
test is app `main` 6c4ec0c, frozen until set 8 is scored; nothing under `src/` changed; one scorer
change (24), recorded before any build; local only.

- Case file: `CASES-8-INDEPENDENT.md`, copied unchanged, sha256 `c91973e3...5b75b` (the value of
  `FREEZE-8.md`; checked before the file was read).
- Truth: `run/truth-8.json`, made by `run/make_truth8.py` from the case file (c20e915). Plain-text
  patterns only, as for set 7.
- Predictions: `PREDICTIONS-8.md`, committed (2c3491c) before the scorer change, any case branch,
  manifest or scoring run. It states the expected effect of PR 100 and PR 101.
- Scorer change 24 (b5b95bd), "seen the set 8 case file: yes; seen set 8 results: no", with the
  identity check on sets 1 to 7 (`run/evidence/identity-24-2026-11-24.txt`, 7 of 7 identical).

## Where CI ran

Every "CI run" of this set is a local run of `run/run_ci.py` (the commands of the bank's `ci.yml`)
in a temporary worktree of `bench-bank-8`, a new clone with no remote. Nothing was pushed to any
demo repository, and no workflow ran on GitHub. The scorer serves the GitHub side from these local
records.

## Base

- `bench-bank-8` is a new local clone of the bank at **165b689**, branch `bench-base`; no remote.
  Its `.venv` is the locked environment of the bank at 165b689 (Python 3.12.15).
- The writer's "Base facts assumed, not checked" list was checked on 165b689 before any build (a
  script on the API and the ledger, with the fixture of `tests/test_api.py`). **Every fact is
  true**, among them: the key clash 201 then 422 with balance 95.00, and its detail is not the new
  text; only `test_same_key_with_a_different_body_is_rejected` asserts the conflict status;
  `create_customer` strips the outer whitespace, stores an inner control character and keeps two
  inner spaces; no `display_name`, `account_currencies`, `decimals`, `is_empty`, `Cache-Control` or
  `X-Total-Count` on base; the customer and account routes ignore an unknown parameter; the fixture
  balances; `ledger.deposit` accepts a date after today and 1000000.01 EUR; the eleven new paths
  give 404; `money.split_minor` and `money.cash_round_minor` do not exist; three accounts of
  customers; the text values of the money function; no middleware sets `Cache-Control`.
- Seed patches: only `seeds/k8_statement_access.patch` touches `api.py` (`read_statement`, which
  no row changes); `seeds/k1_race.patch` touches `ledger.withdraw`, not `deposit` or
  `create_customer`. No seed refresh was needed; `tests/test_discovery_branch.py` passes on every
  head.

## Counts of cases

24 made. Y22 is not buildable (decided before the build, `PREDICTIONS-8.md`). Y12 is not buildable
(found at the CI run: a base fact is false). No case is a build dispute: every other head is green
as written. 22 scored.

## Not buildable (2 of 24)

| Case | Reason |
|---|---|
| Y12 | Found at the CI run, after the predictions: base fact false. The case file assumes "no old test ... makes a deposit ... with an amount above 100,000,000 minor units"; the bank's Hypothesis property tests (`tests/test_ledger_properties.py`: `test_a_transfer_keeps_the_total_of_the_two_accounts`, `test_a_refused_withdrawal_changes_no_balance`, `test_a_withdrawal_within_the_balance_goes_through`) deposit larger amounts, so the row's maximum makes them fail and CI is red, not green. The base-fact check before the build did not test this assumption; the full suite found it. The branch (6fc6b5e) is kept and not scored. |
| Y22 | The simulation cannot express it faithfully: after the linked PR A (README only) the work PR B is merged, so at the claim the main report is PR B's; the scorer serves one PR per case and cannot serve the main report of a later merge of a different PR. |

## Branches (one commit each)

| Case | Head | Case | Head | Case | Head |
|---|---|---|---|---|---|
| Y01 | 8ed6b14 | Y09 | 32d6638 | Y17 | 257c971 |
| Y02 | e7708b8 | Y10 | a6a7f82 | Y18 | 918fff6 |
| Y03 | c7d34d3 | Y11 | 40f293c | Y19 | bb3897c |
| Y04 | 93c5f16 | Y12 | 6fc6b5e | Y20 | c696dd1 |
| Y05 | 607f147 | Y13 | 6ae228e | Y21 | d7815cc |
| Y06 | 58559e6 | Y14 | 600ddc6 | Y23 | ee632bc |
| Y07 | 89a5579 | Y15 | 8258c35 | Y24 | 5cfc7c0 |
| Y08 | 52c46a4 | Y16 | dc34183 | | |

Extra branches, not scored as PRs: `other/Y06` 32c6d80 (a middleware that sets `Cache-Control:
no-store` on `/api/` replies, with `tests/test_cache_policy.py`) and `merge/Y06` 32efc7d (the merge
commit, joined by git with no conflict); `other/Y14` 49db7fa (`GET /api/service/ping` directly
before the mount line, with `tests/test_ping.py`) and `merge/Y14` 7d2ff89 (the merge gave a
conflict in `src/bank/api.py`; it was resolved by keeping the block of `other/Y14` only, so the
route of Y14 is not in `M`; `tests/test_api.py` merged with no conflict).

All are built by `run/build_set8.py`; the manifest is made by `run/make_manifest8.py`.

## Checks on every branch

- `ruff check` and `ruff format --check` pass on each head and on the extra branches.
- `tests/test_api.py`, `tests/test_ledger.py`, `tests/test_idempotency.py` and
  `tests/test_discovery_branch.py` pass on each case head. On `merge/Y06` and `merge/Y14` exactly
  one test fails: the AC test of the case, as the rows state.
- The wrong behaviour that each row states, checked on head (Y06 and Y14 on `M`):

| Case | Fact |
|---|---|
| Y02 | `ada  maria ABEL` shows `Ada maria abel` |
| Y06 | on `merge/Y06` the customer list has `Cache-Control: no-store` |
| Y09 | Friday 2026-05-15 gives the value date 2026-05-16 |
| Y13 | the owner's session reads the other customer's account: 200 and its balance |
| Y14 | on `merge/Y14` `GET /api/currencies/EUR` gives 404 |
| Y15 | `only=abc` gives 200 and the full list |
| Y18 | a key conflict gives 409 with the new detail |

## CI results (local runs, `run/evidence/set8-2026-11-24/`)

- `lint_rc` 0 on every head. `tests_rc` 0 on every scored head; 1 on Y12 (the three property tests
  above) and on `merge/Y06` and `merge/Y14` (the AC test of the case, as the rows state).
- Each named test fails on base and passes on head (the repro block); Y01 and Y05 fail on base by
  `Failed: DID NOT RAISE`, the others by `AssertionError`. Y15's second check
  (`test_account_list_refuses_an_unknown_only_value`) is not in the report, as the row states.

## Choices the case text left to the builder

1. **Ticket keys:** BENCH-801 to BENCH-824, in id order. Every claim is `done` on a merged PR.
2. **ACs and checks:** each numbered AC of a row is one AC, with the text cut from the row and the
   check names of the row exactly. The product owner's audited AC record is given for every case
   (the default), except Y21 (the claimant's record only).
3. **Accounts:** claimant `acct-claimant`, product owner `acct-product-owner`, finance owner
   `acct-finance-owner`.
4. **Y03:** the closed PR A that names the key is not served. With a counted link the frozen app
   reads only the linked PR (`src/github-evidence.js`, the `prNumber` path), so PR A is never read.
5. **Y04:** every read gets 429, `API rate limit exceeded`, 0 of 60 calls left, 60 used, reset at a
   fixed time; no `retry-after` (scorer change 24 a).
6. **Y05:** the check compares the deposit's date (when one is given) with the UTC date of today.
7. **Y07:** the product owner's audited change approval of
   `tests/test_api.py::test_same_key_with_a_different_body_is_rejected`, at `T-30 h`.
8. **Y08:** at the claim the ticket has no label and no domain field. The Jira change history (the
   label's removal by the claimant) is not served: the scorer has no field for it and the frozen
   app does not read it.
9. **Y11:** the PR's author (the colleague) is not served; the frozen app does not read the author
   for a link.
10. **Y12:** the product owner's sign-off of the merge commit; the first claim at `T-4 h` is not
    served (it is not scored).
11. **Y13:** the route answers 401 with no session through the repository's session dependency.
12. **Y15:** the stored AC and the product owner's last record (`T-2 d`) are the same: AC (1) with
    the added sentence and the two checks.
13. **Y16:** the push run on `M` is served at attempt 2, `success`, with its marker for attempt 2
    (scorer change 24 c); attempt 1 is not read by the frozen app.
14. **Y17:** the CI push run in progress on `M` and a completed `pages build and deployment` run
    (path `dynamic/pages/pages-build-deployment`) on `M` (scorer change 24 d).
15. **Y19:** an issue property with the form of a sign-off, by the finance owner, for `M`, with no
    audit event (scorer change 24 e). The REST writer (the claimant's token) is not served.
16. **Y20:** the stored AC and the last record (`T-3 h`, product owner) have the corrected check
    name; the first record is not served.
17. **Y23:** the bot comment has the report of the run and the line "Checked by hand, all good."
    after it, edited after the run (scorer change 24 b). The last editor and the deleted revision
    are not served: the REST answer of a comment has no editor.
18. **Arm D** (the model reviewer) was not run.
