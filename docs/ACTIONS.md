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
| `start-investigation` (Rovo action, Mode B) | The calling person (`/myself`); only that person can use the investigation | KVS investigation and its read log | A symptom of 1 to 2,000 characters; `DISCOVERY_REPO` and `DISCOVERY_REF` set | The same symptom from the same person is one investigation | `investigation.started` (id, branch, commit, symptom hash) | none | A GitHub error or a used budget starts nothing |
| `record-finding` (Rovo action, Mode B) | The person who started the investigation | KVS finding (not Jira) | Every cited line from a read of the investigation; every number from the symptom or a read; status always `unconfirmed`; see `docs/DISCOVERY.md` | One record per content: a repeated call returns the first | `finding.recorded` (id, kind, commit, hash) | The person confirms a ticket draft; a ticket with `findingId` is labelled `unconfirmed` | - |
| `get-pr-diff` (Rovo action) | The calling person must see the work item (browse check) | KVS review packet of one PR | Issue key, PR number | One packet per work item and PR (overwritten) | none (a read for the reviewer) | none | Fails closed on a GitHub error |
| `record-review` (Rovo action) | The calling person must see the work item | Issue property `aat.reviews`, comment | Review guards (`src/review.js`), packet of the same PR | One retry, then "invalid review" | `review` | A review can only hold a claim, never pass one | A failed property write posts no comment and no audit event |
| `open-case` (Rovo action) | The calling person must see the work item | KVS case, comment | Issue key, 2 or 3 PR numbers, question, domain from the ticket | A new case keeps the old one as history | `case_opened` | The code decides; the final choice is a person's decision comment | Fails closed on a GitHub error |
| `record-opinion` (Rovo action) | The calling person must see the work item | KVS case, comment | Opinion guards (`src/opinion.js`) | One retry for style | `opinion` | An opinion never decides | - |
| Comment `claim: <type>` (trigger) | The comment author (Jira) | Verdict property, audit, comment | Claim type from a fixed list | One claim per comment id; limits per work item, author and site per hour | `verdict`, `done_evidence` | - | The queue retries; each step is recorded, so no verdict is posted twice |
| Comment `decision: PR<n> because <reason>` (trigger) | The comment author (Jira). Never the claimant of the latest claim. Not a PR author of the case when `GITHUB_ACCOUNTS` links the decider; with no link the decision is recorded as "PR author not compared" | KVS case, audit, comment | An open case; the PR is a side of the case; a reason of at least 5 characters | One decision per comment id (a second delivery does nothing) | `decision` | It is the human decision | On an error the comment id is released, so a later delivery may record it |
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
- **Who may decide on a case** (owner decision, 19 Nov; split changed after review the same
  day). The reply to a refused decision says why; the case does not change and no audit event
  is written.
  - The decider must be named by Jira; otherwise nothing is recorded.
  - **Claimant check, always.** Both sides are Jira account ids. The claimant of the latest claim
    on the work item may not decide. A claim whose claimant is not known also stops the decision.
  - **PR-author check, optional.** A Jira account and a GitHub login are different identities.
    The Forge variable `GITHUB_ACCOUNTS` (`accountId=login` pairs, comma separated), set by a
    site admin, links them. When it links the decider, the author of a PR in the case may not
    decide, and a PR author that is not known stops the decision. When the variable is missing
    or does not list the decider, the decision is recorded with `authorCheck: "not checked"` in
    the stored decision and its audit event; the reply, `get-verdicts` and the monitor say "PR
    author not compared: no account link is configured". So a fresh site can record decisions
    with no setup, and it is never silent about the missing check.
  - Limits: the list is only as true as the admin who writes it; a GitHub login can be renamed
    (the PR author id is stored but not yet compared); only the latest claim counts, so the
    claimant of an earlier claim may decide; with a link, a case opened before this change has no
    PR authors and must be opened again.
- **Approvals written at the same moment.** `recordApproval` reads, changes and writes one KVS
  key per work item. Two approvals at the same moment can lose one. Each approval keeps its
  audit event, but the verifier counts only the entries in the store. Not fixed yet.
- **FAIL_IF_EXISTS has not run on a live site.** The create-ticket and decision deduplication,
  claim admission and the audit chain rely on the KVS option `keyPolicy: 'FAIL_IF_EXISTS'`. It
  is tested only with a local double. If the deployed KVS ignored the option, deduplication would
  silently do nothing. This is on the checklist of the first live run: create the same draft
  twice, and post the same decision comment event twice.
- **The keys never expire.** The `decision-seen:` and `ticket-create:` keys are never deleted
  (a done `ticket-create:` key older than 24 hours is overwritten by a new create). They grow
  by one per decision comment and per created draft.
- **The browse check.** It asks Jira as the user, so it depends on the Rovo action running with
  the user's identity (as `create-ticket` already does).
