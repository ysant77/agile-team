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

Every check in `src/verifier/checks.js` gives `unknown` (the verdict `cannot_verify`) when an
input it reads is missing, empty, not a finite number, or of the wrong type, also when a list
holds a `null` element. A check never passes because an input was absent, and never throws on a
bad input. The readers (`src/github-evidence.js`, `src/jira-evidence.js`, `decide()` in
`src/verify-claim.js`) always set the fields the checks read, so a missing field means "not
read". For example, Jira gives `[]` for a ticket without sub-tasks; a missing `subtasks` field
gives `unknown`. Page flags (`truncated`) must be `false` to show a list is complete. A check that gives `fail` on such an input (for example "no pull request")
keeps that result. A check that only applies under a condition can return no result.

Exceptions, where an empty list is a valid read result and not missing evidence:

- `subtasks_done`, `blocked_by_done`: Jira gives an empty list when the ticket has no sub-tasks
  or links, so none is open. A missing field is not an empty list.
- `unique_migrations` (also inside `merged_clean`): a repository with no migrations reports an
  empty list, or no list.
- metric checks: the report test list is a guard (no failed test), not the evidence; an empty
  list has no failed test. The metric value itself must be a finite number.
- `ci_attempts`: an empty list of earlier failures means no earlier attempt failed.
- `reproduced`: an empty `changed_support` list means no pytest support file changed; a Bug with
  no acceptance criteria uses the tests named for its key.
- `coverage`: an empty `unmeasured_files` list means every changed file is in the coverage data.
- `merged_clean`: an empty list of tests required after merge names no test; the merge result
  must still keep every base test and have unique migrations.
- `tests_not_removed`: a report without a repro block, or a repro block with neither
  `base_test_ids` nor `base_collect`, is from before the base record existed (see "Verifier
  limits"). Approved test removals can only turn a
  fail into a pass, so none stored means none.
- A run without `run_attempt` is attempt 1 (GitHub leaves it out of old runs).

The security check mode must be `off`, `observe` or `enforce`. Any other value, or a malformed
security check config, gives `unknown`, counted in the verdict.

`test/checks-bad-input.test.js` feeds each exported check the values missing, `null`, `""`, `[]`,
`[null]`, `NaN` and `Infinity` in every input it reads, list elements included, and asserts that
the result is never `pass` and that no check throws.

## A success after a run without a result

An author can cancel a failing CI run and start a new one. So for `ci_green`, a successful run
of a pinned workflow on the head counts after a cancelled, stale or skipped run of the same
workflow file on the same head only when all of these hold:

- the success was created after the run without a result;
- the verifier read the steps of the run without a result, and no step failed;
- the verifier read the jobs of that run, and no job concluded other than success, cancelled,
  skipped or neutral (a job can fail with no step marked failure);
- no earlier attempt of that run failed (`earlierConclusions`, `earlierFailures`).

The reader reads at most 5 earlier attempts of a run. When a run has more, `ci_green` and
`ci_attempts` both give `unknown`. An earlier attempt that concluded failure with no failed step
recorded gives `unknown` in `ci_attempts`.

If the evidence cannot show this, the result is `unknown`. A cancelled earlier attempt of the
successful run's own run id, followed by a re-run, also gives `unknown`: a person checks.

## Done means on main

A `done` claim with a linked pull request needs that pull request merged (`on_main`), whatever
its acceptance criteria. A ticket with code work (a Bug, or an AC of a code type: test, metric,
version, migration, repair, recon, CI, path or `deployed`) also needs the merge result, the
reproduction, coverage and the security check. Only a ticket with no code AC and no linked pull
request (for example a parent of sub-tasks, or a ticket with only `field_equals`, `link_exists`
or `evidence_linked` ACs) has no pull request gate. "No linked pull request" needs the pull
request list read to the end: when it was cut at the page limit, or has no page flag, the claim
gives `cannot_verify`.

## Verifier limits

These cases are known and accepted. Each has a test that pins the behaviour.

- **Only the claimed head counts.** `ci_green` reads the CI runs on the head commit of the pull
  request. If CI failed on an earlier head and a new commit then passes, the result is green. The
  claim is about the head commit, and the failure on the earlier commit is not evidence about it.
- **Pre-field reports.** A CI report whose repro block has neither `base_test_ids` nor
  `base_collect` is from before those fields existed. `tests_not_removed` keeps the old reading
  (the main report's tests only), and the evidence record marks it `pre-field report`. A repro
  block with `base_collect` must also have `base_test_ids`; one without gives `unknown`.
- **Added lines only.** The rule for a Story's new function reads only the added lines of the test
  file. A string opened on an unchanged line is not seen.

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
