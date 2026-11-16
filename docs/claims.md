# Claim types and what the verifier checks

A claim is a Jira comment that starts with `claim:` and one claim type. The verifier is code; no
model decides a verdict.

| Claim | Meaning | Pull request state | Checks |
|---|---|---|---|
| `fixed` | the fix is done on its branch | open or merged | PR linked, CI green, ACs met, a bug test for a Bug, no test removed |
| `ready` | the work is ready for review | open or merged | PR linked, CI green, ACs met, no test removed |
| `done` | the ticket's own work is complete | not used | sub-tasks done, blockers done, ACs met |
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
