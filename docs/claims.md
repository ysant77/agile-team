# Claim types and what the verifier checks

A claim is a Jira comment that starts with `claim:` and one claim type. The verifier is code; no
model decides a verdict.

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

## State of the rules, 19 Nov 2026 (app `main` 1d86bb4)

| Rule | Check | Counts in the verdict? |
|---|---|---|
| CI report trust (pinned workflow, bot comment, head commit, fingerprint, file list, time window) | `report_trusted` | yes |
| Dependency and pytest config files are trust paths (PR 26) | `report_trusted` | yes |
| Report provenance: hash marker of the run (PR 31, bank PR 22) | `report_provenance` | **advisory**: `provenanceRequiredRepos` is empty. Byte identity is confirmed on bank PR run 44455535406 and push run 44456621300. Listing waits for the arm C regression (listing design) |
| Protected regression set: base copies of the changed test modules (PR 22 to 24, bank PR 20) | `pinned_tests_hold` | counted when the report has a `pinned` block; a missing block is **advisory**: `pinnedRequiredRepos` is empty (PR 27). PR 25 (listing) is a draft |
| Test approvals from the panel only, audited, not by the claimant (PR 28) | `tests_not_removed`, `pinned_tests_hold` | yes |
| ACs match the last audited record, not made by the claimant (PR 28, PR 30) | `acs_recorded` | yes when a record exists; **advisory** when none |
| Code-scanning result | `code_scanning` | **advisory** (`observe`) |
| A review holds a supported claim, never passes one | review hold | yes (fail-open) |

The rules for the actions that change state are in `docs/ACTIONS.md`. The rules of 18 and 19 Nov
are scored only on development sets 1 to 4; a claim needs blind set 5.

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

## When a review holds a claim

A review (the Agile Code Reviewer, stored in the issue property `aat.reviews`) can hold a claim,
never pass one:

- It applies to `ready`, `fixed` and `done` claims that the code checks rate `supported`.
- It counts only when the review passed the guards (outcome `review`), was made for the same PR
  head commit, and has at least one blocking finding that names an AC.
- The claim is then `cannot_verify`. The reason names the AC and says that a person must check the
  reviewer's blocking finding.
- A `contradicted` or `cannot_verify` verdict never changes.

This is fail-open on purpose. No review, a refused review, a review for another head commit, or a
failed read of the property changes nothing, and the code checks decide. A model or Jira failure
must not block every claim.

Rules for the parts of a review (17 Nov, after the arm D regression):

- A guard that faults one part of a review refuses that part only. A proposed check for an AC
  that already has a code check is dropped and listed in `droppedChecks`; the findings stay and
  the other guards judge them.
- A finding whose text is only a hunk or line reference (for example "Finding 1: see P121:H3,
  line 62.") is refused as a finding and listed in `droppedFindings`; the review stays.
- After a style fallback, people see a template text in the review, but the hold decision uses
  the model's own guard-accepted findings (`modelFindings`). The hold reason shows the model's
  defect statement.

A malformed stored review (findings missing or not a list, or a finding that is not an object)
also counts as no review: it never holds a claim and never stops the verdict.

Known limit: the guard refuses a blocking finding that quotes changed code, also in other letter
case or with extra spaces. It does not check that the text states a real defect, so a bare "Bad."
passes as a blocking finding. Such a finding can only hold a supported claim for a person to
check; it can never pass a claim.

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

## The claim `done` (definition of done)

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
   - a person's sign-off;
   - a reviewer's blocking finding, which lowers it.

Statuses:
- proved;
- failed;
- not proved: the check ran and could not decide;
- not checked.

This is view only. The checks and the verdict do not change: arm C on sets 1 to 4 gives
identical result records. The tests replay U01, U15 and U23: each stays `supported`, with
level 5 "not checked".
