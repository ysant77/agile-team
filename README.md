# Agile team verifier for Jira

A Forge app for Jira in which AI agents do agile work, and code decides whether the work is done.

- The **Agile PM** agent turns a request into a ticket whose acceptance criteria a machine can
  check. It may not invent numbers that are not in the request.
- A comment such as `claim: fixed` starts the **verifier**. The verifier is code, not a model. It
  checks the linked pull request, the CI report and Jira, and returns `supported`,
  `contradicted` or `cannot_verify`, with each check and its reason.
- When two pull requests compete for one ticket, a fixed rule decides where it can. The **Agile
  Team Lead** agent may add an opinion, marked "not verified". A person makes the final decision
  with a `decision:` comment.
- Every verdict, case, opinion and decision goes into an append-only, hash-chained audit log. A
  Jira page shows the log check and the team's assignment statistics.
- Read-only tools are also available to other agents through MCP.

The demo bank that the scenarios run against is a separate public repository,
[`ysant77/yms-bank-demo`](https://github.com/ysant77/yms-bank-demo).

## Status

This repository starts from the Forge template. The app code arrives in reviewed pull requests,
one review unit at a time. Each pull request needs green CI, an independent review and the
owner's approval.

## No check passes by default

Every check in `src/verifier/checks.js` gives `unknown` (the verdict `cannot_verify`) when a key
input is missing, empty, not a finite number, or of the wrong type. A check never passes because
an input was absent. A check that gives `fail` on such an input (for example "no pull request")
keeps that result. A check that only applies under a condition can return no result.

Exceptions, where an empty list is a valid read result and not missing evidence:

- `subtasks_done`, `blocked_by_done`: Jira gives an empty list when the ticket has no sub-tasks
  or links, so none is open.
- `unique_migrations` (also inside `merged_clean`): a repository with no migrations reports an
  empty list, or no list.
- metric checks: the report test list is a guard (no failed test), not the evidence; an empty
  list has no failed test. The metric value itself must be a finite number.
- `ci_attempts`: an empty list of earlier failures means no earlier attempt failed.
- `reproduced`: an empty `changed_support` list means no pytest support file changed; a Bug with
  no acceptance criteria uses the tests named for its key.
- `coverage`: an empty `unmeasured_files` list means every changed file is in the coverage data.

`test/checks-bad-input.test.js` feeds each exported check the values `null`, `""`, `[]`, `NaN`
and `Infinity` in its key inputs and asserts that the result is never `pass`.

## A success after a run without a result

An author can cancel a failing CI run and start a new one. So for `ci_green`, a successful run
of a pinned workflow on the head counts after a cancelled, stale or skipped run of the same
workflow file on the same head only when all of these hold:

- the success was created after the run without a result;
- the verifier read the steps of the run without a result, and no step failed;
- no earlier attempt of that run failed (`earlierConclusions`, `earlierFailures`).

If the evidence cannot show this, the result is `unknown`. A cancelled earlier attempt of the
successful run's own run id, followed by a re-run, also gives `unknown`: a person checks.

## Run the tests

You need Node.js 24 (the Forge runtime is `nodejs24.x`).

```bash
npm ci
npm test
```

The tests need no Atlassian site, no account and no network. To deploy the app you need the
Forge CLI and your own Atlassian developer site (`forge deploy`, then `forge install`).

## Licence

MIT. See [LICENSE](LICENSE).
