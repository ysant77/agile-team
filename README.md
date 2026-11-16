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
