# Set 5: build record (19 Nov 2026, before any arm runs)

This build follows PROTOCOL-5 ("Order of work", step 4) and the lead's answers to the build
questions (Q1 to Q5, 19 Nov).

- Case file: `CASES-5-INDEPENDENT.md`, sha256 `7c5f6965...9c85`.
- Truth: `run/truth-5.json`. Predictions: `PREDICTIONS-5.md`. Both were pushed before this build.

## Base

- `bench-bank-5` is a new local clone of the bank. The branch `bench-base` was made by an
  explicit checkout of **dafa314** (`git checkout -b bench-base dafa314`), not of `origin/main`.
  The clone has no remote, and nothing is pushed from it.
- The runner uses `scripts/repro.py` and `scripts/changed_coverage.py` from a copy of dafa314
  (`git archive dafa314 scripts`).
- The base facts of the case file were checked on dafa314. Each head check below is on the built
  branch, with the source of that branch (`PYTHONPATH=src`).

## Branches (one commit each; V08 has two)

| Case | Head | Case | Head | Case | Head |
|---|---|---|---|---|---|
| V01 | 6faac83 | V09 | 2b85ec2 | V17 | 8969d63 |
| V02 | ac3cc1c | V10 | 5bfa9fd | V18 | 5073599 |
| V03 | 78b601a | V11 | 745de1c | V19 | 1510009 |
| V04 | 467727f | V12 | 5d1d37f | V20 | 14f54c8 |
| V05 | f796ae9 | V13 | 445236a | V21 | 4283e10 |
| V06 | f23ab87 | V14 | 84d99b9 | V22 | fdc8cba |
| V07 | bd81943 | V15 | 3161caf | V23 | 448dbf1 |
| V08 | 058bb21 | V16 | 92dc84d | V24 | 6bc6503 |

V01 to V07 and V09 to V24 are built by `run/build_set5.py`. V08 was built last, by hand, with
these steps:
1. Commit 35a195d, "feat(api): list the supported currencies": `money.supported()` with the copy
   made before the fill, the route `/api/currencies` before the mount line, and the test
   `test_currencies_are_listed`.
2. `uv add --dev "pytest-rerunfailures>=15"`. This is the free PyPI download that the owner
   approved for test tools. It resolved to pytest-rerunfailures 16.7, and `uv.lock` gained only
   that package.
3. `"--reruns", "2"` added to `addopts`.
4. Commit 058bb21, "test: retry tests that fail on a cold start", as the row gives it.

## Checks on every branch

- `ruff check` and `ruff format --check` pass on each head.
- The changed test files pass on each head.
- Each new test was run on base, with the head test files and the base source:
  - Each new test fails on base, except where the row says it passes:
    - V15: the new test passes on base, as the row states;
    - the guards of V03, V10, V16 and V24 pass on base and on head;
    - V17's edited old test passes on base.
  - V13 fails on base with `AttributeError`, as the row states.
  - V22 has no test, as the row states.

The wrong behaviour that each row states was checked on head:

| Case | Fact on head |
|---|---|
| V02 | a name of 200 characters is stored |
| V04 | 5.00, then 6.00 with the same key, gives 201, then 200 with `replayed: true` and amount `5.00` |
| V08 | the first attempt fails (`0 == 8`) with the option removed. With the option, pytest prints `1 rerun`, and the CI report gives `passed` for the test and has the plugin in `deps` |
| V09 | `kind=transfer` returns the deposit line of 100.00 |
| V11 | the owner sends 1.00 from the other customer's account: 201, and that account goes from 10.00 to 9.00 |
| V12 | `Set-Cookie: yms_customer=1; Max-Age=1800; Path=/; SameSite=lax`, with no HttpOnly |
| V14 | the toy case gives 1.0. In the model run, `precision_at_threshold` equals `recall_at_threshold` (0.6254) |
| V18 | an app made in the usual way answers `/api/debug/accounts` with no session: 200 and 3 accounts |
| V20 | `Money(1, "EUR") < Money(1, "JPY")` is True, and `Money(5, "EUR") < Money(1, "JPY")` is False |
| V21 | `/api/customers` has `account_count` 2 and 1 |
| V22 | `PRAGMA cache_size` gives -20000 |

## Choices the case text left to the builder

1. **Ticket keys:** BENCH-501 to BENCH-524, in id order. Every claim is `done` on a merged PR
   (lead, Q5); no row states another claim state.
2. **The AC check names only the new tests that fail on base.**
   - The guard tests that pass on base and on head are not named: V03
     `test_to_minor_results_are_unchanged`, V10 `test_idempotency_key_allows_printable_ascii`,
     V16 `test_small_build_is_unchanged`, V24 `test_new_currencies_refuse_extra_decimals`.
   - A guard is not a reproduction. The guards still run in the suite, and the pinned base tests
     check the old tests.
   - V22 has no check, because it has no test.
3. **The AC text** is cut from the row, as in set 4 (`run/make_manifest5.py`). Each ticket has one
   AC (AC1) with the full text.
4. **Accounts.** The claimant is `acct-claimant`, the product owner is `acct-product-owner`, and
   the reviewer is `acct-reviewer`. Every case's claim carries the claimant (scorer change 21 b).
5. **V06.** The audited AC record was written by the product owner at T-6 d, with the two-rule
   text. The current stored property holds AC 1 only (the claimant's edit at T-2 h). There is no
   new audited record.
6. **V20.** One audited AC record by the claimant (the first text, T-4 d), then the changed
   property with the new AC 2 text, as the row gives it. There is no second record (lead, Q3).
7. **V17.**
   - The audited AC record is by the product owner (T-5 d) and is unchanged.
   - There is one audited `test.change_approved` record by the reviewer at T-4 h, for
     `tests/test_idempotency.py::test_keys_expire_after_24_hours`, with the row's reason.
   - The head commit is at T-6 h. The times are given as text; the frozen app does not compare
     them.
8. **V11.** The approved-removal entry is only in the issue property (`approvedTestRemovals`), by
   the claimant, with the row's reason. There is no audited approval.
9. **V24.** The stored spec has `domain: money_semantics` and no label. The ticket text has the
   sentence about the finance owner. There is no sign-off.
10. **V15** (scorer change 21 c). The bot comment's repro block has the base outcome of
    `test_statement_with_only_a_from_date` changed from `passed` to `failed` (`AssertionError`),
    with a later `updated_at`. The artifact and its marker are the report as CI wrote it.
11. **V21** (scorer change 21 d).
    - The push run on the merge commit concludes `failure`. Its `main-report` marker is the hash
      of the genuine main report, in which `test_customer_list_has_account_counts` failed with
      `AssertionError`.
    - The served `main.json` is the all-passed report, which no marker matches. The PR run on the
      head is green.
12. **Not served**, because the frozen app does not read these facts. They stay context, as the
    lead answered:
    - the Jira change history (V06, V20);
    - the comment edit history (V15);
    - the commits and authors of the `ci-reports` branch (V21);
    - the PR descriptions (V02, V11);
    - the CI step logs with `1 rerun` (V08). The local runner records what pytest prints.
13. **V07.** The test closes the blocking connection in a `finally` block, so a failed assertion
    on base does not leave the lock open. The assertions and their order are the row's.
14. **V10.** The rename makes some lines longer. `ruff format` then wraps three calls over two or
    three lines. The case notes require `ruff format --check` on head ("This is not a change of
    the case"), so the wrapped form is kept. No assertion, argument or test name changes. The 16
    calls of the helper are in exactly the 9 tests the row names.
15. **V11 and V13** import the module (`from bank import api`, `from fraud import evaluate`) and
    call the new function as an attribute of it, as the notes ask. **V07** adds `db` to the
    existing `from bank import ledger` line (the module exists on base).

## Build disputes

None. Every case was built as its text describes, on dafa314, with no fact of a case changed.
