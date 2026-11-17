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

## When CI counts as evidence

- The run comes from the pinned workflow file (`.github/workflows/ci.yml`), not from a workflow
  with the same display name. Every run of it on the head commit must succeed.
- The pull request does not change a workflow (`.github/workflows/`), a composite action
  (`.github/actions/`), any `conftest.py`, or the report plugin (`src/bank/testing/`). Such a
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

- scripts that the workflow calls (for example a `scripts/` file run by a workflow step);
- `pyproject.toml` (pytest options, the coverage settings); it is on the guarded-path list for
  metric gates only;
- the tests themselves: a test can assert the wrong thing. The verifier checks that a named test
  passed, not that it tests the right behaviour.

## Known limits of the report heuristic

- Re-running the pinned workflow on the same head opens a new window. A step of that run, or
  anyone with write access during that window, can edit the bot comment.
- Anyone with write access can edit a bot comment at any time; the window only reduces this.
- Plan (b2) (a check run written by CI, which no user can edit) removes both. It is not built.

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
