# Design note: a judge on a fresh site (23 Nov 2026)

Status: design only. No code is written for this note. Two options; the smaller one is first.

## The problem

A judge installs the app on their own Jira site. Today three things on that path need the owner:

1. **The ACs.** The verifier reads the ACs from the issue property `aat.ticket`. Only two paths
   write it: the `create-ticket` Rovo action (a new work item, through the PM agent) and
   `scripts/judge-seed.mjs` with a REST call that needs the owner's sign-in. The panel can
   record ACs (`recordAcs`, audited), but it cannot enter them.
2. **The pull request link.** A claim links the PR whose title or branch names the work item key.
   The demo PRs name `BANK-5` to `BANK-9`. A judge's project has its own key (for example
   `KAN-1`), so no demo PR names it, and the judge cannot open PRs on the owner's repository.
3. **The repository.** `GITHUB_REPO` and `GITHUB_TOKEN` are Forge variables of one environment.
   Every installation of that environment uses the same values: all sites read the same
   repository with the same token.

Point 3 is not a problem for the demo: a judge's site reads the public demo repository with the
owner's read-only token. It is a problem only when a judge wants to verify their own repository.

## Option 1 (smallest): enter ACs and link a PR from the panel

What changes:

- **AC editor in the issue panel.** A text area for AC lines in the existing form
  `AC1 | statement | check`, and a **Save and record** button. A new resolver `saveAcs`:
  1. checks that the person can edit the work item (the same check as `recordAcs`);
  2. parses the lines with `parseAcLines`, refuses malformed lines (`malformedAcLines`) and an
     empty `test_passes()` (`testPassesArgErrors`, on branch `fix/verifier-corrections`), with the
     same messages as `create-ticket`;
  3. writes `aat.ticket` as the user (`api.asUser()`, as `adoptCheck` does today);
  4. records the ACs: the audit event `acs.recorded` and the AC record in the app's store
     (`recordAcsAction`), so `acs_recorded` passes for a claim by another person.
  The test names are kept as the judge types them; the `{TOKEN}` rename of `create-ticket` is not
  applied, so a demo test name such as `test_zero_decimals_are_accepted` works as it is.
- **PR link from the panel.** A field for a PR number and a **Link PR** button. A new resolver
  writes an audited link (`pr.linked` event: work item key, repository, PR number, by, reason)
  and stores it in the app's store, never in an issue property. `collectGithub` already reads one
  PR by number (`prNumber`). The rule changes: a PR that does not name the key counts as linked
  only when an audited link names it and the person who linked it is not the claimant. Without
  that second rule, a claimant could link any green PR.
- **Judge path.** A judge creates five work items, types the ACs from `docs/JUDGE-PATH.md` (one
  line each), links demo PRs 1, 2, 3, 6 and 4, and a second person claims `done`. The demo PRs are
  already merged and reverted; a judge would need them merged at claim time, so the owner keeps
  one prepared set of the five merges on a second branch or repository for judges.

Scopes: none new. `write:jira-work` (issue properties as the user) and `storage:app` are already
in the manifest. Egress stays `api.github.com`.

What the owner must do:

1. Decide the environment for judges (open owner decision 1) and set `GITHUB_REPO` and the
   read-only `GITHUB_TOKEN` there (`forge variables set --encrypt` for the token).
2. Deploy, and create the install link in the developer console (distribution / sharing).
3. Keep the five demo PRs in a merged state for judges (see the judge path above).
4. Not checked: whether a judge can install from a share link with no paid step on their site.

Risks: the audited PR link is a new way to choose evidence, so it needs its own tests, the
claimant rule above and a regression run on sets 1 to 5.

## Option 2: a repository per Jira project

What changes:

- A project settings page (`jira:projectSettingsPage`) where a project admin sets the repository
  (`owner/name`) for that project. Stored in the app's store, keyed by the Jira project id,
  with an audit event. `verifyClaim`, `getPrDiff` and `openCase` read it, and fall back to
  `GITHUB_REPO` when no project setting exists.
- A token per site, only for a private repository: entered on the same page and kept with the
  platform's secret storage (`kvs.setSecret`), never shown again. A public repository needs no
  token, but then shares the 60 calls an hour without a token (`docs/claims.md`, "Claim intake").
- The repository must run the CI report workflow (`docs/ci-report.md`); the pinned and provenance
  checks of an unlisted repository are advisory (`configFor`), so the verdict says so.

Scopes: the project settings page module may need a project admin scope (for example
`manage:jira-project`); this is not checked against the platform documentation. A new module or
scope makes a new major version, and every site admin must approve the upgrade interactively.

What the owner must do: all of option 1, plus approve the new module and scope, and say whether
judges may verify their own repositories at all (a judge's private code would then be read by the
app, which needs a privacy statement).

## Recommendation

Option 1 first. It needs no new scope and lets a judge follow the judge path on a fresh site with
the public demo repository. Option 2 only if the entry should claim "works on your own
repository"; the submission text does not claim that today.
