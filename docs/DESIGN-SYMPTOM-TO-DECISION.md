# Design: from a symptom to a human decision (23 Nov 2026)

Status: design only, no code. One page for the full demo flow that the review asks for: a person
reports a symptom, and the flow ends with a person's decision about the change. Each step is
marked:

- **human:** a person does it in Jira or on GitHub;
- **model-proposed:** a Rovo agent proposes it; it counts only after a code check or a person;
- **code-checked:** code decides or refuses it, with an audit record where it writes;
- **scripted:** prepared by the owner for the demo; no agent does it.

## The flow

| # | Step | Kind | Where it is today | Missing for the live site |
|---|---|---|---|---|
| 1 | A person reports a symptom ("my balance went below zero after two withdrawals") in Rovo chat with the PM agent | human | `pm-agent` in the manifest | Rovo on the site |
| 2 | The PM agent starts an investigation on the investigated branch | model-proposed, code-checked | `start-investigation`: the commit is pinned, one open investigation per person, audited (`docs/DISCOVERY.md`) | `DISCOVERY_REPO` and `DISCOVERY_REF` are **not set** on the development environment, so no investigation starts today |
| 3 | The agent reads files and CI results | model-proposed, code-checked | path allowlist, read budget (20 per investigation, 40 per site an hour), read log | as step 2 |
| 4 | The agent records a finding | model-proposed, code-checked | cited lines must be in a read; numbers from the symptom or a read; a defect must cite a rule line (docs, a README or a test), else it is `unclear`; status always `unconfirmed` | as step 2; the rule-citation check is on a branch for review |
| 5 | A person reads the finding and decides whether it is a defect worth a ticket | human | the finding record (kind, citations, open questions) | a place in the panel or the chat that shows the finding; today it is in the agent's reply only |
| 6 | The PM agent drafts a bug ticket from the finding | model-proposed, code-checked | `create-ticket` with `findingId`: only a recorded defect; label `unconfirmed`; AC lines checked; no invented numbers | as step 2 |
| 7 | A person records the ACs | human, code-checked | panel "Record these ACs"; the AC editor "Save and record" is on a branch for review | the AC editor merged and deployed |
| 8 | The fix pull request | **scripted** | the demo fixes are prepared PRs; no agent writes a fix | nothing in scope: an agent that writes the fix is not planned |
| 9 | CI runs the tests, the reproduction on base, coverage and the pinned old tests, and posts the report | code-checked | the bank's CI and the report marker | for a judge: the judge branches of way A (`docs/OWNER-HELD-STEPS.md`) |
| 10 | The Agile Code Reviewer reviews the PR | model-proposed | advice only; guards for hunks, quotes, numbers; it never changes a verdict | Rovo on the site |
| 11 | A person merges the PR | human | GitHub | none |
| 12 | A person links the PR to the work item (when the title does not name the key) | human, code-checked | "Link PR" on a branch for review; counts only when the claimant did not make it | the link merged and deployed |
| 13 | The claimant comments `claim: done`; the verifier gives the verdict | human, code-checked | `decide()`; reproduction on base, coverage, pinned tests, provenance; the evidence record | none for a repository the app reads |
| 14 | For a money rule: a second person signs off the merged commit | human, code-checked | panel sign-off; the claimant is refused; read from the audit chain | none |
| 15 | With two candidate PRs: the lead agent opens an arbitration case and gives an opinion | model-proposed, code-checked | `openCase`, `recordOpinion`; the opinion is advice | Rovo on the site |
| 16 | A person records the decision (`decision: PR<n> because ...`) | human, code-checked | the decider rules: not the latest claimant, not a PR author when accounts are linked; audited | none |
| 17 | The `unconfirmed` label is removed after a reproduced verdict | human | a person removes the label | a panel button that removes it only after a reproduced verdict (optional) |

## What runs end to end today, and what does not

- **Runs:** steps 9 to 16 on the demo repositories (the five live cases of 22 Nov, the sign-off of
  U12, the review advice of T08).
- **Does not run on the live site:** steps 2 to 6, because the discovery variables are not set
  in the deployed environment; step 5 has no screen; steps 7 and 12 wait for the merge and deploy
  of the panel branches.
- **Never automated in this design:** step 8 (the fix) and the human steps 1, 5, 11, 14 and 16.

## The smallest set of changes that makes one full run possible

1. Set `DISCOVERY_REPO` and `DISCOVERY_REF` in the environment (the owner; one command each), and
   prepare one investigated branch whose bug has a rule line in docs, a README or a test.
2. Merge and deploy the panel branches (AC editor, PR link) and the rule-citation check.
3. Show the latest finding of a work item's investigation in the panel (a read-only section), so
   step 5 happens where the person works.
4. One scripted fix PR for that bug, on a judge branch (way A), with its report.

Then one rehearsal: symptom, investigation, finding (`unconfirmed`), ticket, ACs recorded, fix PR,
review advice, merge, link, claim, verdict, decision. Each step leaves an audit record that the
monitor page shows.
