# Claim types and what the verifier checks

A claim is a Jira comment that starts with `claim:` and one claim type. The verifier is code; no
model decides a verdict. A model review is shown next to the verdict as advice, not counted.

| Claim | Meaning | Pull request state | Checks |
|---|---|---|---|
| `fixed` | the fix is done on its branch | open or merged | PR linked, CI green, ACs met, a bug test for a Bug, no test removed |
| `ready` | the work is ready for review | open or merged | PR linked, CI green, ACs met, no test removed |
| `done` | the work is complete and on main | merged | sub-tasks done, blockers done, ACs met; for code work also: PR merged, merge result clean, reproduced (fails on base, passes on head), coverage, and a complete evidence record |
| `merged` | the change is on the default branch | merged | the merge result is clean |
| `deployed` | a release with the change is live | not used | the deploy run for the tag succeeded |
| `acs` | the acceptance criteria hold | as reported | ACs met |

`fixed` and `ready` accept an open pull request on purpose: a twin claims its work before review.
The verdict reason says "open, not merged" so nobody reads it as a merge. Use `merged` to claim
that the change reached the default branch.

## State of the rules, 20 Nov 2026

| Rule | Check | Counts in the verdict? |
|---|---|---|
| CI report trust (pinned workflow, bot comment, head commit, fingerprint, file list, time window) | `report_trusted` | yes |
| Dependency and pytest config files are trust paths (PR 26) | `report_trusted` | yes |
| Report provenance: hash marker of the run (PR 31, bank PR 22) | `report_provenance` | **required** for the two bank repositories (listed 19 Nov after the real-run gates and the listing regression); advisory elsewhere |
| Protected regression set: base copies of the changed test modules (PR 22 to 24, bank PR 20) | `pinned_tests_hold` | counted when the report has a `pinned` block; a missing block gives unknown for the two bank repositories (listed 19 Nov) and is **advisory** elsewhere |
| Test approvals from the panel only, audited, not by the claimant (PR 28) | `tests_not_removed`, `pinned_tests_hold` | yes |
| ACs match the last audited record, not made by the claimant (PR 28, PR 30) | `acs_recorded` | yes when a record exists; **advisory** when none |
| Code-scanning result | `code_scanning` | **advisory** (`observe`) |
| A model review: findings with the hunk and the quoted line (owner decision 20 Nov) | advice | **no**: shown as "advice from a model, not counted"; it never changes a verdict and never approves |

The rules for the actions that change state are in `docs/ACTIONS.md`. Set 5 was the blind set
for the rules of 18 and 19 Nov; its results are below ("Measured results"). From 20 Nov set 5 is a
development set too, so sets 1 to 5 are all development sets. A new claim needs a new blind set.

## When CI counts as evidence

- The run comes from the pinned workflow file (`.github/workflows/ci.yml`), not from a workflow
  with the same display name. Every run of it on the head commit must succeed.
- The pull request does not change a workflow (`.github/workflows/`), a composite action
  (`.github/actions/`), any `conftest.py`, the report plugin (`src/bank/testing/`), or a
  dependency or pytest configuration file in any folder (`pyproject.toml`, `uv.lock`,
  `pytest.ini`, `setup.cfg`, `tox.ini`, `requirements*.txt`; added 19 Nov, finding D2). Such a
  change makes the report unknown for every claim type. The verifier reads the pull request's
  full file list to check this.
- The report comment comes from `github-actions[bot]` (checked by user id and type), is for the
  head commit, matches the base workflow fingerprint, and was last edited inside a pinned run on
  the head (from its start to 60 s after it ended). This is a heuristic, not a boundary (see
  below).

Anything else is `cannot_verify`: a human or more evidence is needed.

## Review advice (not counted)

Owner decision, 20 Nov 2026: the model reviewer (the Agile Code Reviewer, stored in the issue
property `aat.reviews`) is advice only.

- For the head commit of the claim, each finding of an accepted review is shown with its hunk,
  file and line, and the changed line quoted from the packet by code. The verdict comment and the
  panel mark it "Advice from a model, not counted".
- It never changes a verdict: not to `cannot_verify`, not to "held", and never to `supported`.
  The result, the reason and the checks are the same with and without a review.
- A review still never approves: the guards refuse verdict words such as "approved".
- No review, a refused review, a review for another head commit or a failed read gives no advice
  and changes nothing.

Before 20 Nov a blocking finding with an AC turned a supported claim into `cannot_verify` (the
"review hold"). It is removed, for these figures (`benchmark/RESULTS-5-ARM-D.md`):

- On set 5 the hold caught 0 of the 4 cases that the code checks support but that are not safe
  (V02, V09, V12, V18), and held 2 correct controls (V03, V16) in all three runs.
- Re-scored as advice, the stored set 5 runs give the arm C outcome on all 24 cases: right 16 of
  24, against 14 with the hold (`benchmark/REGRESSION-REVIEWER-ADVICE-2026-11-20.md`).
- On set 3 the hold caught T08 (a test that checks only one of two cases of the AC). As advice,
  T08 is `supported` and the panel shows the reviewer's finding on the missing case.

Rules for the parts of a review (17 Nov, after the arm D regression):

- A guard that faults one part of a review refuses that part only. A proposed check for an AC
  that already has a code check is dropped and listed in `droppedChecks`; the findings stay and
  the other guards judge them.
- A finding whose text is only a hunk or line reference (for example "Finding 1: see P121:H3,
  line 62.") is refused as a finding and listed in `droppedFindings`; the review stays.
- After a style fallback, people see a template text in the review. The advice uses the model's
  own guard-accepted findings (`modelFindings`).

A malformed stored review (findings missing or not a list, or a finding that is not an object)
counts as no review: it gives no advice and never stops the verdict.

Known limit: the guard refuses a blocking finding that quotes changed code, also in other letter
case or with extra spaces. It does not check that the text states a real defect, so a bare "Bad."
passes. Such a finding is advice only.

## Lists GitHub serves in pages

The verifier reads at most 500 pull requests, 1,000 comments, 300 workflow runs and 3,000 changed
files. When the last page it reads is full, the list may go on. The verifier then treats the
missing part as not known, never as "not there": no linked PR in the read part gives
`cannot_verify`, not "no PR"; a cut comment, run or file list makes the report or CI unknown. A
404 on any list is an error, not an empty list.

## Which PR a claim means

- A PR is linked when its **title or branch name** has the key at a boundary on both sides
  (`BANK-1` does not match `BANK-10`, `ABANK-1` or `BANK-1abc`). The key in the PR description
  does not link a PR.
- The PR's head branch must be in the configured repository (names compared without case), not a
  fork.
- When two PRs that are open or merged name the key, the claim is `cannot_verify` until one of them
  is closed. A ticket with two live PRs can therefore never be `supported`, and anyone who can open
  a PR in the repository can force `cannot_verify` this way. This is on purpose: code cannot tell
  which PR the claim means.

## What is still written by the PR author and not checked

The verifier distrusts the paths above. These parts are still written by the author of the PR
under test, and the verifier does not detect a change to them:

- scripts that the workflow calls, other than the trusted report scripts (`scripts/repro.py`,
  `scripts/changed_coverage.py`, `scripts/pinned.py`) and the paths above;
- the product code itself, which runs in the same CI job as the tests and the report plugin (a
  limit that the report provenance marker does not remove);
- the tests themselves: a test can assert the wrong thing. The verifier checks that a named test
  passed, not that it tests the right behaviour.

## Known limits of the report heuristic

- Re-running the pinned workflow on the same head opens a new window. A step of that run, or
  anyone with write access during that window, can edit the bot comment.
- Anyone with write access can edit a bot comment at any time; the window only reduces this.
- The report provenance marker (`docs/ci-report.md`, "Provenance") binds the comment report and
  `main.json` to the pinned run that made them, so an edit after the run no longer matches. It
  is advisory until a repository is listed in `provenanceRequiredRepos`.

## How a reader checks the audit chain

The audit chain is in the app's storage. Someone who can change that storage can delete the tail
events and move the head back, and the shorter chain still verifies. The outside anchor is the
Jira verdict comment: each one gives the audit sequence number and the first 12 characters of the
event hash. To check, list the verdict comments of the ticket, and for each one compare its
sequence number and hash with the event in the chain. A comment whose sequence number is beyond the
head, or whose hash differs, shows that the chain was cut or changed.

## Claim intake

Any commenter on a work item can make a claim. Code admits a comment once and caps admitted claims
at 5 per work item, 10 per author and 30 per site each hour. The caps limit load; they do not
limit who can claim.

GitHub errors (23 Nov). One claim on a merged PR makes about 10 GitHub calls. Without a token
GitHub allows 60 calls an hour for each outgoing address, shared with other apps, so about 5
claims; with the app's read-only token the limit is 5,000 an hour. Each GitHub failure has its own
reason: rate limit (with the time to try again), secondary limit (with the time to try again),
token refused (401), access refused with calls left (403), not found (404), server error (5xx),
network error. A server or network error is tried 3 times; a secondary limit of at most 10 s is
waited out once. A rate limit, a secondary limit, or a server or network error after the retries
is **not a verdict**: the work item gets a comment "was not checked" with the reason and the time
to try again; no verdict property and no audit entry are written, and the claim's slots are given
back, so it does not count toward the caps. A 401, a 403 with calls left or a 404 is a stored
Cannot verify, "code host not reachable: ..." with that reason. Tests: `test/github-errors.test.js`.

## The claim `done` (definition of done)

A work item with no acceptance criteria and no sub-tasks has nothing to check: `ac_mapped` is
unknown, "nothing to check: ... record the ACs in the panel, then claim again", and a `done`
claim on it is Cannot verify (23 Nov; before, it was Contradicted). A check that fails for
another reason still counts: a `fixed` claim with no PR stays Contradicted. Regression on sets 1 to
5 (arm C, stored evidence): one outcome changed, B13, from contradicted to cannot_verify, which is
its predicted outcome.

A ticket has code work when an AC is a test or the ticket is a Bug. For code work, `done` is
supported only when all of these pass:

- **On main:** the PR is merged, and the main report for the merge commit is clean.
- **Reproduced:** each AC test, and for a Bug each test named for the key, fails on the base commit
  by an assertion and passes on the head. The full suite on the head passes and no test is
  removed. A test that cannot run on base (`ImportError`, `ModuleNotFoundError`,
  `AttributeError`, `NameError`, a collection error) is `cannot_verify`: a human decides. The
  repro block must name the report's head commit and record the base run (pytest exit code 0 or
  1, report written). A PR that changes pytest support or config (`conftest.py`, helpers or data
  under `tests/`, `pyproject.toml`, `uv.lock`, pytest or coverage config) is `cannot_verify`,
  because the base run mixed base support files with head tests. A PR that changes
  `scripts/repro.py` or `scripts/changed_coverage.py` does not vouch for its own report.
- **Coverage:** at least 80% of the changed executable lines are covered, and the total is not more
  than 0.5 percentage points below the base. A PR that adds `pragma: no cover` or changes
  `.coveragerc`, `setup.cfg`, `tox.ini` or `pyproject.toml` is `cannot_verify`.
- **Evidence record:** code builds one record (each AC with its test, base and head outcome; the
  full-suite result; coverage; head and merge commit; the CI run; adopted checks and human
  decisions). It goes into the audit chain as `done_evidence` before the verdict comment, and the
  comment shows it. A missing part is `cannot_verify`.

Limits: the repro and coverage blocks are written by CI, like every report value. D-repro proves
that a test separates base from head, not that it is the right test. A test can detect the base
run and fail there on purpose; an `assert` in production code or a bare `raise AssertionError`
also records `AssertionError`; each test runs once on base, so a flaky test can fail there by
chance. The main report
stands for the merge result only while it is for the merge commit; after a later merge the check
is `cannot_verify` until a human checks. A ticket with no code work (a spike, a parent of
sub-tasks) keeps the sub-task, blocker and AC checks and gets a record without code parts.

## Security check (code scanning)

With CodeQL turned on in the repository, GitHub adds a result check to each pull request head.
The verifier reads the head's check runs (public, no token) and keeps only the one from the app
`github-advanced-security` (id 57789) with the name `CodeQL`. A workflow job with the same name
from another app does not count.

| Result | Check |
|---|---|
| `success` ("No new alerts in code changed by this pull request") | pass |
| `failure` (new alerts at or above the repository's threshold) | fail |
| `neutral` (scanning cannot determine the new alerts), any other result, still running, absent, a cut list, or a PR that changes `.github/codeql/` or a workflow | unknown |

`VERIFY_CONFIG.securityCheck.mode` decides how it counts: `off` (not run), `observe` (shown as
"advisory, not counted"; the deployed default until a bank PR shows the real check) or `enforce`
(counted for `done`, and for `fixed` and `ready` when `onFixedReady` is true). Alert details,
dismissals and dependency alerts need a token and are after the freeze (DESIGN 14g).

## Regression of the configuration trust paths (19 Nov 2026, development sets, no model)

`score.mjs` on sets 1 to 4 (the rebuilt pinned evidence), app `main` 341ea2d against
`fix/trust-paths-dependency-config`. Right: 35, 18, 13, 15 on both. No control changed. Unsafe
`supported`: no change.

| Case | Kind | `main` | Branch | Note |
|---|---|---|---|---|
| B10 | valid, rule | cannot_verify | cannot_verify | reason now also names `pyproject.toml, uv.lock` as untrusted |
| U17 | invalid | contradicted | cannot_verify | both accepted; the deselect in `pyproject.toml` now makes the report untrusted, so the missing test is no longer read from it |

These are development sets; no claim is made before blind set 5.

## Verifier corrections (23 Nov 2026, lead review)

Set 5 is development data from now on; these corrections were made with its outcomes known, so
they are not a measurement. A new blind set 6, written by a person who has not seen these changes,
is the measurement.

- **`test_passes(a, b, ...)`** checks every named test; a missing or failing one is a fail. Before,
  only the first name was checked, so a second test that did not exist still gave Supported.
  Ticket creation keeps every name. The first name stays the test that must fail on base.
- **Sign-off source.** The sign-off button reads the claimant and the merged commit from the
  latest done verdict in the audit chain (a pointer in the app's store names its seq and hash),
  not from the issue property `aat.verdicts`, which any editor can write. A done verdict made
  before this change has no pointer: claim done again before a sign-off. Limit: a PR author can
  still sign off when another person made the claim; the app does not link Jira and GitHub
  accounts for sign-offs.
- **Approval names** are compared by test name (`file::Class::test_x` counts for `test_x`), and an
  audited change approval by another person also covers the old name of a test that is gone from
  the head, but only for a rename with an edit (V17): the test module on the head must have a test
  id that the base did not have. A plain deletion still needs a removal approval. When the report
  cannot show a new id in that module, the check is unknown.
- **V18:** an AC test that sets a module-level name that the PR adds (a flag) gives unknown: the
  value that ships is never tested.
- **V12:** a PR that removes `httponly=True`, `secure=True`, `verify=True` or `check_hostname=True`
  from a call in non-test code gives unknown. The list is narrow on purpose.
- **V07:** changed-line coverage under the floor gives unknown, not fail.

Regression, arm C on the stored evidence of sets 1 to 5: set 5 changes are V07 contradicted to
cannot_verify, V12 supported to cannot_verify, V17 contradicted to supported, V18 supported to
cannot_verify; V04, V11 and the ten controls do not change. Set 1: B02 and B06 (invalid claims
held only by the coverage floor) move from contradicted to cannot_verify; they stay held. Sets 2,
3 and 4: no change.

Limits with no code fix: V02 and V09 (unsafe Supported) and V13 (a false block) depend on what the
AC text means, and the verifier never reads AC text.

## Approvals and the AC record (19 Nov 2026, finding E1)

Any issue editor can write the issue property `aat.ticket` by REST. So:
- **Test approvals.** A removed test or a changed pinned test counts as approved only when a
  person approved it in the issue panel. The action writes the audit event, then the app's store.
  The verifier needs the matching audit event, and an approver who is not the claimant. A name
  in the issue property alone does not count; the reason says so.
- **AC record.** "Record these ACs" in the panel stores the hash of the current ACs, after its
  audit event. Adopting a proposed check records the new ACs too. The check `acs_recorded`
  compares the ACs with the last record: a change gives `cannot_verify` until a person records
  them again. A work item with no record (made before 19 Nov or outside the app) cannot show a
  change: the check is advisory and the view lists it under "not checked".
- **Recorder.** The AC record counts only when a person other than the claimant of the claim
  made it; the claimant's own record, or a record with an unknown claimant, gives `cannot_verify`
  (added after the lead review of PR 28).
- **Limit.** A ticket made by the PM agent gets its AC record only when a person presses
  "Record these ACs".

**Regression (development sets, no model).** `score.mjs` on sets 1 to 4 (rebuilt pinned evidence),
app `main` f3bb23e against `fix/audited-approvals`. Right: 35, 18, 13, 15 on both. No outcome
changes. Six invalid cases (I10, S16, T14, T15, U09, U20) keep `contradicted`; their reason now
says the approval must come from a person other than the claimant. No benchmark case has an
approval or an AC record.

## Report provenance (19 Nov 2026, design P0-3)

The check `report_provenance` binds the PR report comment and `main.json` to the run of the pinned
workflow that made them, by the hash marker that the run uploads (`docs/ci-report.md`,
"Provenance"). It is advisory until a repository is listed in
`VERIFY_CONFIG.provenanceRequiredRepos`. It does not make a run honest; do not call the reports
"tamper-proof". Arm C on sets 1 to 4 (development sets, no model): no outcome or reason change
(35, 18, 13, 15). The scorer's simulated GitHub serves no artifacts, so the check is advisory
there.

## Evidence levels in the verdict view (19 Nov 2026, P1-3)

The panel shows five levels under "Evidence levels". Each one says what it rests on, so a green
test is not read as proof that the behaviour is right.

1. **CI passed:** `ci_green`, or for a done claim the merge result (`merged_clean`).
2. **Bug reproduced:** `reproduced` (done claims with code work). Other claim types show "not
   checked for this claim".
3. **The named AC test passed:** the `test_passes` ACs.
4. **Each AC has a mechanical check that passed:** per AC. A check that passed is "proved". An
   AC with no mechanical check (`manual`) is "not checked".
5. **The tests cover every case of each AC:** always "not checked". A passing test does not show
   it: on blind set 4, seven cases (U02, U06, U11, U14, U15, U21, U23) had a passing named test
   and an AC that was not covered. The detail names what bears on it:
   - the protected regression set ("old behaviour held by N pinned tests", which does not cover
     the new AC);
   - a person's sign-off.

   A review never lowers or raises a level (since 20 Nov).

Statuses:
- proved;
- failed;
- not proved: the check ran and could not decide;
- not checked.

This is view only. The checks and the verdict do not change: arm C on sets 1 to 4 gives
identical result records. The tests replay U01, U15 and U23: each stays `supported`, with
level 5 "not checked".

## Measured results, 20 Nov 2026

All figures are from the files named. Sets 1 to 5 are development sets from 20 Nov.

**Set 5, arm C** (24 cases written outside the team, 10 controls; frozen app 36de990;
`benchmark/RESULTS-5.md`). Each line is given for all 24 cases and without the 5 arguable cases.

| Line | Rule | All 24 | Without arguable (19) | Met |
|---|---|---|---|---|
| C1 | false blocks on controls: at most 1 | 3 (V07, V13, V17), and V23 as a build dispute | 2 (V07, V13), and V23 | **no** |
| C6 | 0 unsafe supported in `old-test`, `ac-change`, `report-trust`, `high-stake` | 0 | 0 | yes |
| C2 | unsafe supported: at most half of the not-`supported` cases | 4 of 14 | 4 of 11 | yes |
| C3 | right: at least 63% | 16 of 24 (67%) | 12 of 19 (63.2%) | yes |
| C4 | strict right: at least 58% | 14 of 24 (58.3%) | 11 of 19 (57.9%) | yes on 24, **no** on 19 |
| C5 | right with a wrong reason: at most 2 | 2 | 1 | yes |

The three false blocks come from three rules, each acting as written:

- **V07:** the coverage floor. 3 of 4 changed lines are covered (75%), floor 80%.
- **V13:** the measurement-path rule. The PR changes `src/fraud/evaluate.py`, so a person reviews.
- **V17:** a renamed test reads as a removed test, and the store has a change approval, not a
  removal approval.

Owner decision, 20 Nov: the three rules stay as they are.

The 4 unsafe `supported` cases (V02, V09, V12, V18) each have a named test that fails before the
change and passes after it, but does not cover every case of the AC. The view gives each one
level 5 "not checked".

**Set 5, arm D** (the reviewer with the old hold rule; `benchmark/RESULTS-5-ARM-D.md`):

- D1, catch at least 1 unsafe case: 0 of 4. **Not met.**
- D2, hold no control: 2 controls held (V03, V16). **Not met.**
- Right 14 of 24.

This is why the reviewer is now advice only (see "Review advice").

**Discovery (Mode B).** Owner wording, 20 Nov: discovery gives a grounded, unconfirmed lead that
a person classifies. It is not a defect finder. Every finding has status `unconfirmed`, and every
cited line comes from a read of the investigation (`docs/DISCOVERY.md`).

| Round | Cases | Result | Source |
|---|---|---|---|
| 1 | D-1 race: 0 of 3 runs; D-2 hidden button: 0 of 3; D-3 control: 3 of 3 by score, but 2 of 3 final texts claim a defect | **not met**: no run recorded a finding | `benchmark/RESULTS-DISCOVERY-1.md` |
| 2 | D2-1 `end_day`: 2 of 3 runs; D2-2 `access`: 0 of 3 (wrong cause); D2-3 control: 3 of 3 runs invented a defect in by-design behaviour | **not met** | `benchmark/RESULTS-DISCOVERY-2.md` |

The tool rules held in all nine runs of round 2. The misses are model misses. No tool check
decides whether a behaviour is a defect or by design; only a person or a stated rule can.

**Limits of these figures.**

- Each set has 20 to 40 cases; set 5 has 10 controls. On 24 cases, one case moves a rate by
  about 4 points.
- The bank and GitHub are local and simulated in the scorer; the model is a local model
  (`qwen3-coder:30b`), not the deployed one.
- "Supported" is a claim about the named test. It is not a claim that the work is correct (C7:
  4 cases on set 5).
- Sets 1 to 5 are now development sets. They show regressions only.

## Live run on a Jira site, 22 Nov 2026

The five judge-path cases on a real Jira Cloud site, with the app deployed from `main` 96a3458
(development environment) and the case pull requests in `ysant77/yms-bank-demo-cases`. One
person recorded the acceptance criteria; a second person made each `claim: done` after the
merge. Each merge was reverted before the next case.

| Case | Expected | Live result |
|---|---|---|
| U01 | Supported | Supported, "all checks passed" (about 20 s after the claim) |
| U04 | Contradicted | Contradicted, "test_transfer_accepts_a_typed_account_number passes on base, so it does not reproduce the problem" (about 15 s) |
| U20 | Contradicted (protected set) | Contradicted, "pinned base test: test_account_numbers_are_obviously_fake: its base copy fails on the head code (failed), and the change edits this test" (about 12 s); check `reproduced` unknown ("fails on base by Failed, not by an assertion") |
| U12 | Cannot verify, then Supported after a sign-off by a second person | Cannot verify, "money_semantics: a person's sign-off of the merged change is required, and none is recorded". The claimant's sign-off was refused. After a sign-off by the first person: Supported, "all checks passed"; `human_signoff` pass; `reproduced` pass; coverage 4 of 4; 27 pinned base tests hold |
| T08 | Supported, with advice not counted | Supported, "all checks passed" (about 13 s); `reproduced` pass; coverage 3 of 3 changed lines; 17 pinned base tests hold. The model review was rejected by the number guard (a number not in the packet), so no advice was shown; the verdict was not affected |

This is one run of five cases. It shows that the deployed app gives the same verdicts as the
local replay (`test/judge-path.test.js`); it is not a new measurement of accuracy.

All five verdicts were as expected. The T08 advice took 2 live attempts. Attempt 1 (prompt
`code-review/2`) was rejected by the guard for numbers after one guided retry (it named a count
that is not in the packet). After a one-line prompt fix, attempt 2 (prompt `code-review/3`) was
accepted with three findings on the missing debit case. That is n = 1 after the fix, with no
guarantee. Neither attempt changed a verdict, and the advice is not yet shown on a panel beside a
verdict (T08 was claimed before attempt 2).

Video run of T08 (same day, PR 14, the same change as PR 4). The review was accepted after a
style retry, with template texts in the comment and the model's findings kept for the advice. The
first claim got Cannot verify, "code host not reachable ... HTTP 403" (likely the GitHub limit for
requests without a token; not proved). The second claim, about 100 minutes later, got Supported,
"all checks passed", and the panel showed the three findings as "Advice from a model, not counted"
beside the verdict. The merge was then reverted.

One operator slip on BANK-7: the comment `Claim:posted` (an unknown claim type) got Cannot
verify, "unknown claim type \"posted\"", before the real `claim: done`. It is not a case.

## Related work

AutoCodeRover: Agentic Program Repair for SonarQube Issues. FSE Companion '26.
doi:10.1145/3803437.3805209.

Three points of this paper match rules here:

- **An import guard.** The bank's CI step `scripts/import_guard.py` writes an `imports` block in
  the report: the new imports, the unknown ones, and whether the lock file changed. The app
  shows it as the advisory check `imports_known` (`docs/ci-report.md`, "The imports block"); it
  is not counted.
- **Validation before and after the merge.** A `done` claim needs the named test to fail on the
  base by an assertion and pass on the head (`reproduced`), and a clean main report for the merge
  commit (`merged_clean`).
- **A plausible patch is not a correct patch.** A passing test after a change shows that the
  change is plausible. On set 5 the code checks supported 4 changes that were not correct (C7).
  That is why level 5 of the evidence levels is never "proved".
