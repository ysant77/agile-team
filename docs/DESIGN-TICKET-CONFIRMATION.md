# Design note: a person confirms the exact ticket draft (24 Nov 2026; not built)

Review of 24 Nov, finding "the human-approved specification and the model-provided request can
diverge" (P1). This note records what the platform guarantees, what the app guarantees today, and
a design that binds a person's approval to the exact draft. Nothing here is built.

## What the platform states (public Forge docs, read on 24 Nov 2026)

Pages: the `rovo:action` module reference (updated 3 Aug 2026) and the `rovo:agent` module
reference (updated 2 Oct 2026).

- `actionVerb` is one of `GET`, `CREATE`, `UPDATE`, `DELETE`, `TRIGGER`. The only behaviour the
  pages state: an agent started by an automation rule does not invoke an action whose verb is not
  `GET`.
- Neither page says that Rovo asks the user to confirm a `CREATE` action, or that a confirmation
  is enforced. Neither says that the function gets a confirmation flag, the confirmed inputs or the
  person who confirmed.
- The action page says the model extracts the inputs, which "leaves it subject to hallucination",
  and that an app must not use inputs for checks such as authorization. The function's `context`
  holds the user's `accountId`.

So, for the app: a confirmation in the chat, if Rovo shows one, is not visible to the code and is
not a control the code can rely on.

## What the app guarantees today (`src/index.js`, `createTicket`)

- Jira checks the create permission: the call is made as the user (`asUser`).
- Every input is checked before any Jira call; every number in the draft must be in `request`
  (`ticketGrounding`). `request` comes from the model, so a model that adds a number to `request`
  passes (documented limit).
- One work item per draft and person within 24 hours (idempotency key), and an audit event
  `ticket.created`.
- Not guaranteed: that a person saw and accepted this exact draft.

## Design: the person confirms the stored draft in the app, not in the chat

1. The `create-ticket` action no longer creates. It stores the checked draft as
   `ticket-draft:<id>` with the caller from `context.accountId`, the draft's hash (canonical JSON),
   a time limit (for example 30 minutes) and the state `pending`. It returns the draft id and the
   text of the draft. Audit event `ticket.drafted` with the hash.
2. The panel (or a global page) lists the caller's pending drafts. A person presses **Create** on
   one. The resolver checks: the draft exists and is `pending`, it is not expired, the person is
   the one who drafted it (`context.accountId`, never an input), and the stored hash matches the
   stored draft. Then it creates the work item as that person, with exactly the stored fields, and
   writes `ticket.created` with the draft hash (one event per draft: `appendAuditOnce`).
3. A changed draft is a new draft with a new hash; a confirmed draft cannot be changed.
4. **Reject** marks the draft `rejected` with an audit event. Expired drafts are never created.

What it gives: the work item is exactly what a person saw in the app and chose, and the audit
names that person and the hash. What it does not give: that the draft matches what the user said
in the chat. The grounding check stays, and the draft page shows `request` beside the draft so the
person can compare them.

## Cost and choice

- One more click and one more screen for every ticket; this adds setup friction for a judge.
- A middle way: keep direct creation for drafts with no number, threshold or money label, and
  require the app confirmation only for those (the cases the grounding rule exists for).
- No new scope: the panel already writes issue properties as the user; `kvs` holds the drafts.
- Owner decision needed: build it, build the middle way, or keep the documented limit.

## Test plan (when built)

- An action call stores a draft and creates nothing; no Jira POST.
- Create by another account, after expiry, twice, or for a draft whose stored body was changed:
  refused, no Jira POST; the second Create returns the first work item.
- The created issue's fields equal the stored draft; `ticket.created` carries the draft hash.
