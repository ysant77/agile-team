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
- The pull request does not change a workflow or the report plugin. The verifier reads the
  pull request's full file list to check this.
- The report comment comes from `github-actions[bot]`, is for the head commit, matches the base
  workflow fingerprint, and was not edited after the pinned run ended.

Anything else is `cannot_verify`: a human or more evidence is needed.
