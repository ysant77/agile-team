# Actions that change state: rules per tool (19 Nov 2026)

Every action, trigger and panel call that writes something.

**Rules for all of them:**
- The model can only call the actions listed in the manifest.
- No action can merge, deploy, change CI or a workflow, change a protected test, or change a
  repository setting.
- The app has no GitHub write path and no GitHub token.
- "As the user" means Jira checks the person's own permission on each call.
- "As the app" means the app's own permission, so the action first checks that the person can
  see the work item.

| Tool | Identity and role | Target | Input checks | Idempotency | Audit event | Human approval | Retry and failure |
|---|---|---|---|---|---|---|---|
| `create-ticket` (Rovo action) | The calling person (`/myself`). Jira checks create permission (call as the user) | A new work item in the project named in the input | Project key `^[A-Z][A-Z0-9_]{1,9}$`; type Task, Story or Bug; story points from the fixed list; AC lines; every number grounded in the request | Hash of person and draft in KVS: the same draft within 24 hours returns the first work item | `ticket.created` (key, project, type, points, AC hash) | The person confirms the draft in the chat (Rovo agent step). The code cannot see the chat: see "Limits" | A failed create removes the key, so the person may try again. A create still running (10 min) refuses a second call |
| `get-pr-diff` (Rovo action) | The calling person must see the work item (browse check) | KVS review packet of one PR | Issue key, PR number | One packet per work item and PR (overwritten) | none (a read for the reviewer) | none | Fails closed on a GitHub error |
| `record-review` (Rovo action) | The calling person must see the work item | Issue property `aat.reviews`, comment | Review guards (`src/review.js`), packet of the same PR | One retry, then "invalid review" | `review` | A review can only hold a claim, never pass one | A failed property write posts no comment and no audit event |
| `open-case` (Rovo action) | The calling person must see the work item | KVS case, comment | Issue key, 2 or 3 PR numbers, question, domain from the ticket | A new case keeps the old one as history | `case_opened` | The code decides; the final choice is a person's decision comment | Fails closed on a GitHub error |
| `record-opinion` (Rovo action) | The calling person must see the work item | KVS case, comment | Opinion guards (`src/opinion.js`) | One retry for style | `opinion` | An opinion never decides | - |
| Comment `claim: <type>` (trigger) | The comment author (Jira) | Verdict property, audit, comment | Claim type from a fixed list | One claim per comment id; limits per work item, author and site per hour | `verdict`, `done_evidence` | - | The queue retries; each step is recorded, so no verdict is posted twice |
| Comment `decision: PR<n> because <reason>` (trigger) | The comment author (Jira). **Role rule open: waits for the owner** | KVS case, audit, comment | An open case; the PR is a side of the case; a reason of at least 5 characters | One decision per comment id (a second delivery does nothing) | `decision` | It is the human decision | On an error the comment id is released, so a later delivery may record it |
| Panel `approve` | The person (as the user: must be able to edit the work item) | Issue property `aat.approval` | Reason of at least 5 characters | Overwrites | `requirement.approved` | It is the approval | - |
| Panel `signOff` | The person (as the user: must be able to edit) | Issue property `aat.signoff` | Full merge commit id; reason of at least 5 characters | Overwrites | `change.signed_off` (written first; the verifier needs the match, and a signer who is not the claimant) | It is the sign-off | - |
| Panel `adoptCheck` | The person (as the user: must be able to edit) | Issue property `aat.ticket` (one AC check) | Proposal from a stored review; reason of at least 5 characters | - | `check.adopted` | It is the adoption | - |
| Panel `approveTest` | The person; Jira `mypermissions` must give EDIT_ISSUES | App store (KVS) `approvals:<key>` | Kind removal or change; one test name; reason of 5 to 500 characters | Appends (at most 50 per kind) | `test.removal_approved` or `test.change_approved` (written first; the verifier needs the match, and an approver who is not the claimant) | It is the approval | Refused before any write when an input or the permission fails |
| Panel `recordAcs` (also run by `adoptCheck`) | The person; EDIT_ISSUES | App store (KVS) `approvals:<key>` | - | Overwrites the record | `acs.recorded` (AC hash) | It records the ACs a person accepts | Refused before any write when the permission fails |

**Read-only tools:**
- `lint-requirement`
- `read-github-commit` (public repositories only)
- `get-verdicts` (reads as the user)
- the monitor page (reads as the user, with a permission filter)


**Limits:**
- **The chat confirmation before `create-ticket`.** It is a step of the Rovo agent. The app
  cannot see the chat, so it cannot prove that the person confirmed. The person is the one who
  calls the action, and Jira checks their create permission. The idempotency key stops a
  repeated call.
- **Who may decide on a case.** Any commenter can record a decision today, the PR author
  included. The role rule waits for the owner's decision.
- **The browse check.** It asks Jira as the user, so it depends on the Rovo action running with
  the user's identity (as `create-ticket` already does).
