# UI list (24 Nov 2026)

Every screen that a person sees, where it is, and which deployed version shows it. Development
version 5.14.0 is `main` aa62146 (deployed 24 Nov). Items marked "next deploy" are on `main` or in
an open PR, and are not on the site yet.

## Jira issue panel (`aat-issue-panel`, `src/frontend/panel.jsx`)

| Section | What it shows and does | Version |
|---|---|---|
| Acceptance criteria | The ACs of the stored ticket spec, with the check of each | 5.14.0 |
| Edit the acceptance criteria | A person types AC lines; the app writes the spec as the user and records the ACs (audit event) | 5.14.0 |
| Linked pull request | The latest PR link, who made it and its audit sequence; a field to link a PR with a reason. A claim counts it only when the claimant did not make it | 5.14.0 |
| Approval | Approve the requirement with a reason; "Record these ACs" | 5.14.0 |
| Verdict | The newest verdict: lozenge, "Why", evidence scope, evidence levels, what was proved, what failed, what was not checked, "Never checked by the code checks", human decision, and "Advice from a model, not counted" | 5.14.0 (the two set 7 lines of "Never checked": next deploy) |
| Sign-off of the merged change | For a high-stake ticket: the merged commit of the latest done claim and a sign-off with a reason; the claimant is refused | 5.14.0 |
| Approve an old test change | Approve the removal or change of one old test, with a reason | 5.14.0 |
| Reviews (not verified) | The reviewer agent's stored reviews, marked "review, not verified"; adopt a proposed check with a reason | 5.14.0 |
| Verdicts | The last 10 verdicts with time and reason | 5.14.0 |
| Discovery finding | Show a stored finding by its id (investigator, or a person who can browse a linked work item) | 5.14.0 |
| Drafts waiting for you | The viewer's stored ticket drafts that state a number or money, beside the request; Create and Reject | next deploy, after `feat/ticket-draft-confirmation` merges |

## Monitor page (`aat-monitor`, `src/frontend/monitor.jsx`)

| Section | What it shows | Version |
|---|---|---|
| Audit chain | The chain check (hash links) and its length; the events the viewer may browse | 5.14.0 |
| Runs (tickets with claims) | Each ticket with claims and its latest verdict | 5.14.0 |
| Human decisions on arbitration cases | Decisions of the lead agent's cases that a person made | 5.14.0 |
| Assignment posterior per twin and skill | The assignment figures of the lead agent | 5.14.0 |

## Jira comments

- A verdict comment on the work item after each claim: the answer, the reason, the audit sequence
  and the evidence hash. Version 5.14.0.

## Rovo agents and actions (`manifest.yml`)

| Agent | What a person does with it | Writes |
|---|---|---|
| PM agent | Lints a requirement and drafts a checkable ticket (`create-ticket`); investigates a symptom (discovery actions) and records an unconfirmed finding | a work item, or (next deploy) a stored draft for a draft with a number or money; a finding |
| Lead agent | Opens an arbitration case and records an opinion; reads verdicts | case and opinion records |
| Reviewer agent | Reads a PR diff and records a review, shown as advice | a review record |

## Not a screen

- The benchmark, the scorer and the repair harness have no UI in the app. Their results are in
  `benchmark/` and `bakeoff/repair/`.
