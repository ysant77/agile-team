# Comparison plan (24 Nov 2026)

What we compare, on which data, and what a new figure needs. The rules are those of
`benchmark/PROTOCOL-5.md`; this file does not change them.

## What is compared

| Arm | What it is | Run on |
|---|---|---|
| A1 | Standard GitHub rules: required checks, branch protection, one approval, branch up to date (rule evaluation on the same CI results) | sets 1 to 7 (scorer) |
| A2 | A1 plus code owners on CI, test and config paths, and this project's repro and changed-line coverage scripts as required checks: what a team can build with the same scripts and no app | sets 1 to 7 (scorer) |
| C | This app's `decide()` on the stored evidence | sets 1 to 7 |
| D | C plus the model reviewer as a gate on each case that C supports | sets 4 and 5; not met on set 5 (caught 0 of 4); advice only since 20 Nov |

The question each blind set answers: on claims that a separate writer made, how often does each arm
give the right answer, how often does it pass a wrong change (unsafe Supported), and how often does
it block a correct one (false block on a control)?

## Results so far (arm C, headline of record)

| Set | Cases made | Scored | Right | Strict right | Unsafe Supported | False blocks on controls |
|---|---|---|---|---|---|---|
| 5 | 24 | 24 | 16 | 14 | 4 | 3 of 10 |
| 6 | 24 | 16 buildable | 13 | 12 | 2 | 0 of 6 |
| 7 | 24 | 19 undisputed (23 with the build readings) | 16 (19) | 15 (18) | 2 (3) | 1 of 8 (1 of 8) |
| 8 | 24 | 22 (Y12 and Y22 not buildable; 0 disputed) | 18 | 18 | 4 | 0 of 8 |

Arms A1 and A2 for sets 6 and 7 are in `run/summarize.py` output (set 4 definitions); they are not
the headline.

## What set 8 measured, and what changed after it

- Set 8 is the first held-out measure of PR 100 and PR 101. PR 100: Y01 and Y05 are `supported`
  (the app before it gave two false blocks on the same evidence). PR 101: Y06 and Y14 are
  `contradicted` with the failed AC test on the merge result named.
- After set 8 (development data only, pushed for review): the high-stake mark is kept with the AC
  record, so a label removed by the claimant still asks for the sign-off (Y08 moves to
  `cannot_verify`); a test that a later PR added to main in another module is no longer read as
  removed (the reasons of Y06 and Y14 change; no outcome moves).
- Recorded, not fixed: Y02 and Y09 (weak tests), Y13 (a missing ownership check that no test
  exercises).

## What a new figure needs

1. A new blind set (set 9), written by a separate writer who sees no source, test, fixture, run
   folder or result, from the same writer inputs as set 8.
2. A freeze note before the case file is opened: the app commit (after the fixes of Y08 and of
   the removed-test reason, and any other change to the verifier), the scorer changes, the bank commit, the case file hash.
3. Predictions committed before any build or run.
4. The same counting: every case made stays in the denominator; a case that cannot be built is
   counted apart with its reason; a build dispute is scored with its flag, and the headline is the
   undisputed cases.
5. Expected effects to test, written before the cases are read: fewer false blocks on controls
   with a `pytest.raises` test; a red merge result for an AC test that fails on the merge commit.
   Expected to stay: weak tests and harmful changes that no test exercises can pass (rows 7 and 8
   of `docs/CLAIM-REGISTER.md`).

## What is out of scope

- A comparison with another product: no other tool was run on these cases.
- The repair harness: development only (`bakeoff/repair/RESULTS-DEV-1.md`); a new measurement needs
  new development cases first (lead's plan, 24 Nov).
