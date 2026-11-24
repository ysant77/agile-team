# Set 7: build record (24 Nov 2026)

This build follows PROTOCOL-5, `FREEZE-7.md` and the lead's rules for set 7 (24 Nov): the code
under test is app `main` cea0470, frozen until set 7 is scored; nothing under `src/` changed; one
scorer change (23), recorded before any build; local only (no push, PR or merge on the demo
repositories, no deploy).

- Case file: `CASES-7-INDEPENDENT.md`, copied unchanged, sha256 `ece33972...bb5fd` (the value of
  `FREEZE-7.md`; checked before the file was read).
- Truth: `run/truth-7.json`, made by `run/make_truth7.py` from the case file (2637bd5). The set 6
  second reading of the patterns as regular expressions is not made: the case file states that
  each alternative is plain text, and one alternative (`display(`) is not a valid expression.
- Predictions: `PREDICTIONS-7.md`, committed (3492299) before the scorer change, any case branch,
  manifest or scoring run.
- Commit ids are those on the pushed branch (the local commits were rebased onto `main` 0752ad5
  before the first push; the order of the commits did not change).
- Scorer change 23 (c33a348), "seen set 7 results: no": `run/SCORER-CHANGES.md`, with the identity
  check on sets 1 to 6 (`run/evidence/identity-23-2026-11-24.txt`).

## Base

- `bench-bank-7` is a new local clone of the bank at **165b689** (bank `main`, `FREEZE-7.md`),
  branch `bench-base`. The clone has no remote, and nothing is pushed from it. Its `.venv` is the
  locked environment of the bank at 165b689 (Python 3.12.15).
- The writer's "Base facts assumed, not checked" list was checked on 165b689 before any build
  (a script on the API and the ledger, with the test fixture of `tests/test_api.py`):
  - True: the key clash 201 then 422, with the old test's `assert clash.status_code == 422` and
    its balance assertion (95.00); the cookie `yms_customer=1; HttpOnly; Path=/; SameSite=lax`,
    and no old test reads its attributes; an unknown parameter of the statement, customer and
    account routes gives 200; `EXPONENTS` has 8 codes (EUR 2, JPY 0); the fixture's two customers,
    the owner's EUR (100.00) and JPY accounts and the other customer's EUR account;
    `create_customer` strips the name; no test customer name is longer than 80 characters;
    the window 2026-05-02 to 2026-05-31 has no line and `ledger.deposit` takes a date; the account
    objects have `currency` and a `balance` text and no `balance_display`; the four new paths and
    `/api/no-such-path` give 404; `money` has no `FX_RATES`, `display`, `interest_minor` or
    `convert_minor`; a deposit of 20000.00 and transfers of 10000.00 and 10000.01 EUR are
    accepted; `1,000.00` is refused with 422; `Money.of` accepts `12.50` EUR, `0.01` EUR and `300`
    JPY and refuses `1.005` EUR and `1.5` JPY; keys of 64 and 65 characters give 201; a `to` date
    of today and of tomorrow give 200; the new transfer reply has its id and the conflict body
    has no `first_transfer_id`; the customer objects have `name` and no `initials` or
    `account_count`, and no `ETag`; the base list is not in name order; `month=2026-07` does not
    give `to` 2026-07-31, and a July window is allowed; `format=csv` gives `application/json`;
    no reply has `X-Api-Version`; the web page sends only `from` and `to` to the statement.
  - **False:** the statement body already has `opening_balance` and `closing_balance` (for the
    row's window, `100.00` and `100.00`). See X02 below.
  - True for a reason the writer did not state: `1,000.00` gives 422 because the request model
    has the pattern `^\d{1,12}(\.\d{1,3})?$`; the amount parser of this repository is that pattern
    and `api.parse_amount` (X21).

## Counts of cases

24 made. X02 is not buildable (a false base fact). Four cases are not buildable as written and
are scored as build disputes, with a built reading: X11 (choice 7 below; the lead's ruling) and
X10, X17, X19 (found at the CI run; choice 20 below). 19 undisputed buildable cases; 23 with the
built readings.

## Not buildable (1 of 24, and X11 disputed)

| Case | Reason |
|---|---|
| X02 | Base fact false: the base statement already has `opening_balance` and `closing_balance`, computed from the window. The row's test would pass on base, and the PR would add fields that exist. Decided before the build (`PREDICTIONS-7.md`). |

X02 is `void` in `run/manifests/bench-manifest-7.json` with its reason. It stays in the count of
cases made (24).

## Branches (one commit each)

| Case | Head | Case | Head | Case | Head |
|---|---|---|---|---|---|
| X01 | 07a4d56 | X10 | c41218b (asis 9e140bb) | X18 | 16878c4 |
| X03 | 904ef8f | X11 | 215eab4 | X19 | 90fd980 (asis 03ae4e1) |
| X04 | b121e65 | X12 | 32f24a3 | X20 | d292b04 |
| X05 | 1f7e94f | X13 | 33f7c87 | X21 | 4c67ebb |
| X06 | 084be5c | X14 | 9bf0042 (on X14-A ce491dc) | X22 | b43fcd8 |
| X07 | f3b93f7 | X15 | bfc8380 | X23 | ac570a7 |
| X08 | fc61e7a | X16 | c802525 | X24 | 68278b1 |
| X09 | e8ecdee | X17 | 55f9144 (asis 65aa417) | | |

Extra branches, not scored as PRs: `other/X08` 4047107 (the PR of a different ticket: one
docstring in `money.py`) and `merge/X08` f89b580 (the squash merge of X08 on it: one parent);
`other/X09` 9a45675 (the PR of a different ticket: a future end date is set to today, with its own
test) and `merge/X09` c2a257d (the merge commit, parents `other/X09` and X09, joined by git with no
conflict); `case/X14-A` ce491dc (PR A, the rate table; PR B starts from it, so the base of X14 is
`M_A`).

All are built by `run/build_set7.py`; the manifest is made by `run/make_manifest7.py`.

## Checks on every branch

- `ruff check` and `ruff format --check` pass on each head, with the bank's S rules on. X15's
  `sql += " ORDER BY " + order` passes them.
- The wrong behaviour that each row states, checked on head (X09 on `M`):

| Case | Fact on head |
|---|---|
| X07 | the owner's accounts show `100.00 EUR` and `5,000.00 JPY` (two decimals for JPY) |
| X09 | on `merge/X09`, a statement with `to` equal to tomorrow gives 200 |
| X11 | 5.00 then 6.00 with one key: 201, 422, and the source balance is 89.00 |
| X15 | `order=nosuch` gives 500; `order=(select count(*) from accounts)` gives 200 (the database runs it) |
| X17 | the CSV reply is `date,amount` and one line per statement line, with no balance |
| X19 | `month=2026-06` gives 2026-06-01 to 2026-07-01; `month=2026-02` gives 2026-02-01 to 2026-03-03 |

## Where CI ran

Every "CI run" of this set is a local run of `run/run_ci.py` (the commands of the bank's
`ci.yml`) in a temporary worktree of `bench-bank-7`, a clone with no remote. Nothing was pushed to
any demo repository, and no workflow ran on GitHub. The scorer serves the GitHub side from these
local records.

## CI results (local runs, `run/evidence/set7-2026-11-24/`)

- `lint_rc` 0 and `tests_rc` 0 on each scored head and on `merge/X08`. `merge/X09` has `tests_rc` 1:
  `test_statement_refuses_a_future_to` fails there (200 is not 422), as the row states for `M`.
- Base and head outcomes of the named tests (repro block): each fails on base and passes on head.
  Each base failure is `AssertionError`, except X01: its `pytest.raises` block ends with
  `DID NOT RAISE`, which pytest reports as `Failed` (the case file counts it as an assertion).
- The tests that the rows say do not exist are absent: X17's
  `test_statement_csv_has_date_amount_balance`. X24's report has the three parameter entries.
- X11: the pinned block has `test_same_key_with_a_different_body_is_rejected` with the outcome
  `failed` (its base copy fails on the head code), as the row states.
- Changed-line coverage (report against row): X15 90% (9 of 10; the row says 100%; above the 80%
  rule, recorded as the notes ask); X23 0 of 0 (the new key is inside the line's `return`
  statement, which the counter does not count; the writer foresaw this); all others 100%.
- The first CI runs of X10, X17 and X19 (`asis_X10`, `asis_X17`, `asis_X19`) were red: three tests
  of `tests/test_discovery_branch.py` error. See choice 20.

## Choices the case text left to the builder

1. **Ticket keys:** BENCH-701 to BENCH-724, in id order. Every claim is `done` on a merged PR.
2. **ACs and checks:** each numbered AC of a row is one AC, with the text cut from the row and the
   check names of the row exactly. The product owner's audited AC record is given for every case
   (the default of the case file).
3. **Accounts:** claimant `acct-claimant`, product owner `acct-product-owner`, finance owner
   `acct-finance-owner`.
4. **Domain:** X05, X06 and X14 have the stored spec domain `money_semantics`; X21 has the Jira
   label only.
5. **X05:** the finance owner's sign-off of the merge commit. The app records a sign-off only
   after a `done` verdict names the merged commit, so the record implies an earlier claim; the row
   does not exclude one.
6. **X06:** no sign-off record. The app refuses the claimant's sign-off action (before any verdict
   it refuses every sign-off; after one, it refuses the claimant). The case file names this state
   as the same case. The colleague's Jira comment is not served (the app does not read comments
   for a sign-off).
7. **X11: not buildable as written; scored as a build dispute.** The row says the lookup of the
   key "now runs after the new transfer is written and committed". Built literally, three old
   bank tests fail on head (`test_retry_with_the_same_key_moves_money_once`,
   `test_concurrent_requests_with_one_key_move_money_once`,
   `test_the_key_is_stored_in_the_transfer_transaction`: a replay moves money twice, and the key
   is no longer stored in the transfer's transaction). So X11 is **not buildable as written: the
   stated design makes three old bank tests fail, against the row's green CI** (lead's ruling, 24
   Nov). No case is rewritten. The branch that is scored is a built reading, flagged "build
   dispute" in every table: the lookup runs after the new transfer is written, in the same
   transaction; a conflict commits the new transfer and is raised after the commit (the row's
   6.00 moves, balance 89.00); a replay of the same request undoes the new transfer, as on base.
   Every headline figure is given with X11 (built reading) and without it.
8. **X12, X06, X14:** the new routes read amounts with `Money.of` (the repository's parser) and
   answer 422 for its `ValueError` (too many decimals, unknown currency). No rule for amounts is
   added.
9. **X21:** the change of "the amount parser" is in `src/bank/api.py` (the request pattern and
   `parse_amount`), the parser of this repository, not `money.py`.
10. **X14:** PR A's number is 999 in the link; the finance owner's sign-off names the head of
    `case/X14-A` as `M_A`. Both links are served (scorer change 23 c), the newest last.
11. **X04:** the first three reads (the PR list, the PR, its files) get normal answers; every other
    read gets 403 `API rate limit exceeded`, 0 calls left, reset 2026-11-24 10:41 UTC. The header
    `x-ratelimit-remaining: 0` on the third good read is not served (a normal answer of the scorer
    has no rate headers).
12. **X22:** every read gets 403 with the row's text, `retry-after: 60` and 4312 calls left.
13. **X23:** the push run on `M` is served at attempt 2, `in_progress` (scorer change 23 b). Attempt
    1 is not served: GitHub lists a run once, at its current attempt, and the frozen app reads no
    earlier attempt of a push run.
14. **X09:** the push run on `M` has the conclusion `failure` (scorer change 23 a); the main report
    is the genuine report of `merge/X09`.
15. **X08:** the main report is the genuine report of `merge/X08`; its push run is `success`.
16. **X21:** the reviewer's approval on the code host is not served: the frozen app reads no PR
    review for a verdict.
17. **X16, X17:** the Jira change history is not served (the scorer has no field for it, and the
    frozen app does not read it). X16's record is the product owner's second record (limit 100);
    X17's record is the product owner's text with the balance, and the stored AC is the
    claimant's edit (text and check).
18. **X24:** the check is the test name with no parameter id; the report has three entries.
19. **Arm D** (the model reviewer) was not run.
20. **X10, X17, X19: not buildable as written; scored as build disputes.** Each row changes the
    signature of `read_statement` (a new parameter; X17 also the decorator and the return type).
    The bank's test `tests/test_discovery_branch.py` builds a discovery tree by applying the seed
    patch `seeds/k8_statement_access.patch`, whose context is that signature, so on the literal
    heads (`asis/X10`, `asis/X17`, `asis/X19`) the seed does not apply and three tests error: CI is
    red, against the rows' green CI. The writer could not know this bank test. The built reading
    (`case/X10`, `case/X17`, `case/X19`) also refreshes the seed patch so that it applies to the new
    signature (both sides of the 3-way merge kept), as a developer would to keep CI green; the PR
    then changes one more file, `seeds/k8_statement_access.patch`. With it CI is green.
