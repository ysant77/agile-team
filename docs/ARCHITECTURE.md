# Architecture

One Forge app on Jira. The verifier is code. The Rovo agents write tickets, give opinions and
review pull requests; their output is shown as advice and never sets a verdict.

```mermaid
flowchart LR
  subgraph Jira["Jira Cloud site"]
    C["Comment<br/>claim: done"]
    P["Issue panel<br/>Agile team verifier"]
    M["Global page<br/>Agile team monitor"]
    IP[("Issue properties<br/>aat.ticket, aat.verdicts,<br/>aat.reviews, aat.signoff")]
  end

  subgraph Rovo["Rovo"]
    PM["Agile PM agent"]
    TL["Agile Team Lead agent"]
    CR["Agile Code Reviewer agent"]
    MCP["rovo:mcp<br/>read-only tools"]
  end

  subgraph Forge["Forge runtime (nodejs24.x)"]
    T["trigger<br/>onComment"]
    Q[["queue<br/>verify-queue"]]
    V["consumer<br/>verifier (code only)"]
    R["panel resolver<br/>record ACs, approve test,<br/>sign off"]
    A["rovo:action functions<br/>create ticket, lint, get diff,<br/>record review, ..."]
    KVS[("Forge storage<br/>hash-chained audit log")]
  end

  subgraph GitHub["GitHub (api.github.com, read only)"]
    PR["Pull request,<br/>files, runs, artifacts"]
    CI["CI report comment<br/>from the pinned workflow"]
  end

  C --> T --> Q --> V
  V -- reads --> PR
  V -- reads --> CI
  V -- reads --> IP
  V -- "verdict comment" --> C
  V -- "verdict event" --> KVS
  P <--> R
  R -- "audited action" --> KVS
  R --> IP
  M -- "chain check" --> KVS
  PM --> A
  TL --> A
  CR --> A
  MCP --> A
  A -- "review = advice" --> IP
  IP -. "advice shown,<br/>not counted" .-> P
```

## What decides a verdict

- Only `src/verifier/` decides: `checks.js` runs each check, `verdict.js` combines them into
  `supported`, `contradicted` or `cannot_verify`. A check that is marked advisory is shown and not
  counted.
- Inputs: the pull request and its CI report from GitHub; the work item, its acceptance criteria,
  the AC record, approvals and sign-offs from Jira and the audit log.
- A person's action in the panel (record ACs, approve a test change, sign off) writes the audit
  event first. The verifier counts it only when the audit event exists and the person is not the
  claimant.
- A model's review is stored in `aat.reviews` and shown under "Advice from a model, not counted".
  `test/review-advice.test.js` checks that a review never changes a verdict.

## Where to read more

- Claim types and checks: `docs/claims.md`
- CI report format: `docs/ci-report.md`
- Actions that change state: `docs/ACTIONS.md`
- The five demo cases: `docs/JUDGE-PATH.md`
