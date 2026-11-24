# Production and fresh-site checklist (24 Nov 2026; owner steps, none done here)

This list is for the owner. It adds to steps 4 and 5 of `docs/OWNER-HELD-STEPS.md`: what must be
true before the production deploy, why each scope is asked for, the privacy and security answers
for the distribution form, and one check on a fresh site. Nothing in this file was run.

## Before the deploy

- [ ] Choose a commit of `main`. Development runs 5.13.0, deployed from 520811a; the source of
      `main` 665e93e is the same. The fixes of 24 Nov reach `main` through their own PRs; deploy
      only a commit of `main` with green CI.
- [ ] On that commit: `npm test`, the syntax check and gitleaks pass in CI.
- [ ] Production variables (`forge variables list -e production`, names only):
      `GITHUB_REPO` and `GITHUB_TOKEN` are set (23 Nov). `DISCOVERY_REPO` and `DISCOVERY_REF` are
      not set; without them the discovery actions answer "no investigated repository or branch is
      configured". Set them only if the judge path uses discovery.
- [ ] The token: a fine-grained token with read access to the cases repository only (contents,
      pull requests, actions, metadata). It is never printed or copied into a note.
- [ ] Run `forge deploy -e production` in a terminal (not `--non-interactive`). Stop on any scope
      change or install-upgrade prompt and compare it with the list below.

## Scopes and egress (manifest of 665e93e)

| Scope | Why the app asks for it |
|---|---|
| `read:jira-work` | Read work items, their properties (`aat.ticket`, `aat.signoff`, `aat.verdicts`), comments and permissions. |
| `write:jira-work` | Create a work item (`create-ticket`, as the user), post the verdict comment, write the verdict property, the AC spec and the sign-off. |
| `read:jira-user` | `/myself`: the account of the caller, for the claimant and sign-off rules. |
| `read:project:jira` | Project data for a new work item. |
| `read:board-scope:jira-software`, `read:board-scope.admin:jira-software` | The board's estimation field, so story points go into the field the board shows (`src/jira.js`). |
| `storage:app` | The app's own store (KVS): see "What the app stores". |
| egress `api.github.com` | Read the PR, its CI runs, artifacts and report of the configured repository. Nothing is written to GitHub. |

## Privacy and security answers (for the distribution form)

- **Data the app stores** (Forge KVS of the installation, never shared between sites): the audit
  chain (`audit:` events with Atlassian account ids of the people who act: claimants, approvers,
  sign-offs, PR links, ticket creators); claim progress and leases; verdict records; approvals and
  AC records; PR links; discovery investigations and findings (the user's symptom text, the model's
  hypothesis, cited file lines, the investigator's account id); idempotency keys for created
  tickets. Issue properties hold the ticket spec, verdicts and sign-off.
- **Retention:** no key expires today (`docs/ACTIONS.md`, "The keys never expire"). Data goes
  when the app is uninstalled.
- **Data sent out:** only GET calls to `api.github.com` for the configured repository, with the
  token. No Jira content, no account id and no symptom text is sent to GitHub. The app backend
  calls no model; the Rovo agents use the platform's model.
- **Access rules in code:** the claimant cannot sign off or record the approval that counts; a
  PR link or AC record counts only from another person; the monitor shows only work items the
  viewer can browse; a finding is read only by its investigator or through a linked work item
  (merged on 24 Nov, PR 84).
- **Known limits to state honestly:** a verdict checks named tests and mechanical rules, not the
  meaning of the criteria; a model review is advice only; the user's chat confirmation of a draft
  is not visible to the code (`docs/DESIGN-TICKET-CONFIRMATION.md`).

## One check on a fresh site (after the install link exists)

1. Install from the link on a site the app has never seen. Approve the scopes; they must be the
   list above.
2. Make one project and the U01 work item (`docs/JUDGE-PATH.md`). Account A saves the AC line and
   links PR 17; account B comments `claim: done`.
3. Expect `supported` within about 15 s. In `forge logs -e production`, the verdict line has
   `"authenticated":true` and `rateRemaining` near 5,000.
4. Stop and report on anything else: a missing panel, a scope prompt, `not_checked`, or a rate
   near 60.

Not known: whether a judge's site needs a paid plan, and whether Rovo is on it (T08 advice).
