# Steps held for the owner: a judge on a fresh site (23 Nov 2026; state updated 24 Nov)

These steps finish the fresh-site route (`docs/JUDGE-PATH.md`, "A judge on a fresh site"). The
app side is in code (panel AC editor, panel PR link, base report per branch). Each step below
changes something outside the app's repository or the live app, so each one waits for the owner's
word for that step. The order matters: steps 1 and 2 make the evidence, steps 3 to 5 make the
app reachable for a judge.

Status on 23 Nov: the owner approved steps 1 and 2 (the cases workflow change and the five judge
branches) and the deploy of development. Steps 1 and 2 are done: the workflow change is cases
PR 16, and the judge PRs are cases PRs 17 to 21 (the table in `docs/JUDGE-PATH.md`). Each judge
branch has its report file. Step 3 is done on 23 Nov: the owner set `GITHUB_REPO` and
`GITHUB_TOKEN` on development and on production. Step 3a is done for development; the
discovery variables of production, the production deploy (step 4) and the install link (step 5)
are open.

Status on 24 Nov: the first judge claims were made on development with two accounts, 6 of 6
verdicts as expected, token authenticated (`docs/FIRST-JUDGE-CLAIM.md`, "The first live claims").
Still open: the discovery variables of production, the production deploy (step 4), the install
link (step 5) and a claim on a fresh site.

## State after 24 Nov, and what the owner does on return

Versions on development: 5.13.0 (520811a) for the live claims of 24 Nov; then 5.14.0 (aa62146),
5.15.0 (1d093ef) and **5.16.0 (`main` 3862696)**, each deployed non-interactively with no change
of `manifest.yml` against 520811a, so no new scope. Production still runs the older version: it
was not deployed in this run.

What 5.14.0 to 5.16.0 added over the version of the live claims: the retry record in the log
(`"retried"`), the "pull request linked only by the claimant" rule (Cannot verify), the "push run
still running" reason, the DID NOT RAISE rule, the merge result that reads the AC tests, two more
lines under "Never checked by the code checks", and "Drafts waiting for you" in the panel (a
ticket draft with a number or money waits for the person who asked). Merged after 5.16.0 and not
deployed when this was written: the panel line for a claim that was not checked (a GitHub rate
limit).

On return, in this order (each step needs the owner's word; details in the sections below and in
`docs/FIRST-JUDGE-CLAIM.md`):

1. **Production deploy** (section 4): `forge deploy -e production` in a terminal, so any prompt is
   seen. The manifest has not changed since 520811a, so a scope prompt is not expected; if one
   comes, stop and decide. Before it, set the discovery variables of production (section 3a).
2. **Install link** (section 5), into `docs/SUBMISSION.md`.
3. **A fresh-site U01 claim**: install from the link on a site that has never had the app, type
   the ACs of U01 in the panel, link PR 17 with the second account, and claim `done` with the
   first. Expected: Supported (`docs/FIRST-JUDGE-CLAIM.md`, "On return").
4. **One claim to read the retry log**: after any claim, `forge logs -e <env> --limit 50`; read the
   `retries` and, if not 0, the new `"retried"` field (kind, status, path).
5. **A check of "Drafts waiting for you"**: ask the PM agent for a ticket whose text has a number
   (for example "refuse a transfer above 10000 EUR"). Expected: the agent says it is not created
   yet; the panel of any work item shows the draft beside the request; **Create** makes the work
   item once; the monitor page shows `ticket.drafted` and `ticket.draft_confirmed`.

## 1. The workflow change on the cases repository

Repository: `ysant77/yms-bank-demo-cases`. One pull request, merged on green CI. In words:

- `on.push.branches`: `[main]` becomes `[main, 'judge/**']`, so a merge into a judge branch runs
  the push job.
- The job `publish-main-report` runs for `refs/heads/main` (as now) and for `refs/heads/judge/*`.
  For `main` it writes `main.json` on the `ci-reports` branch, as now. For a judge branch it
  writes `reports/<branch with / as ->.json` (for example `reports/judge-U01.json`), the path
  the app reads for that base branch.
- The pull request job reads the base report of its base branch (the same path) for the base
  coverage total, instead of always `main.json`.

The exact diff goes to the lead for review with the plan; nothing is pushed before the lead's "go".

## 2. The five judge branches

For each case (U01, U04, U20, U12, T08), on the cases repository:

1. Make `judge/<case>` from the current `main` (its tree is the base `e0c82ae`):
   `git push origin origin/main:refs/heads/judge/<case>`
2. Open a pull request from the case's branch (`case/U01`, `case/U04`, `case/U20`, `case/U12`,
   `case/T08`) into `judge/<case>`, wait for green CI and the bot report, then merge it with a
   merge commit. The push run on the judge branch writes `reports/judge-<case>.json`.
3. Write the judge PR number into the table of `docs/JUDGE-PATH.md`.

Each judge branch then has exactly one merged case and the report of its merge commit, so a claim
on any of the five is checked against its own merge (a main report counts only for its own merge
commit). The `main` branch and the history of BANK-5 to BANK-9 do not change.

## 3. The environment for judges (done on 23 Nov)

Done on 23 Nov, with the owner's approval. On development and on production, `GITHUB_REPO` is
`ysant77/yms-bank-demo-cases` and `GITHUB_TOKEN` is set (encrypted). Development was deployed
from app `main` dbf5555 (5.11.0), from 0bc97a8 (5.12.0), and from 520811a (5.13.0). Production
is not deployed (step 4). The commands below are kept as the record of the step.

The live app reads `GITHUB_REPO` and `GITHUB_TOKEN` of its environment. For a judge environment
(production is the usual choice), in a terminal in the app's folder:

```bash
forge variables set -e production GITHUB_REPO ysant77/yms-bank-demo-cases
```

```bash
forge variables set -e production --encrypt GITHUB_TOKEN
```

The second command asks for the value when it is left out. Type the read-only token there; do not
paste it into a chat, a file or a commit. Check with `forge variables list -e production` (the
token shows as encrypted, with no value).

## 3a. The discovery variables (done for development on 23 Nov; production open)

Discovery from symptoms starts no investigation until the environment names the repository and
the investigated branch. On 23 Nov the owner set both on development, and development was
deployed with them (5.13.0). Production has no discovery variable. The investigated
branch is `investigate/symptoms` of the cases repository (head `45a211d` on 23 Nov). In a
terminal, in the app's folder:

```bash
forge variables set -e development DISCOVERY_REPO ysant77/yms-bank-demo-cases
```

```bash
forge variables set -e development DISCOVERY_REF investigate/symptoms
```

Then deploy development one time, so that the values are used. Discovery sends `GITHUB_TOKEN`
when it is set, so it needs no token of its own. The panel section "Discovery finding" shows a
recorded finding by its id (`docs/DISCOVERY.md`). For a judge environment, set the same two
variables with `-e production` before step 4.

## 4. The deploy

```bash
forge deploy -e production
```

Run it in a terminal, not with `--non-interactive`, so any prompt about scopes or permissions is
shown to the person who approves. If it asks for an install upgrade or shows a scope change, stop
and decide before going on.

## 5. The install link

In the developer console (developer.atlassian.com, **Developer console** → the app
**agile-team** → **Distribution**):

1. Under **Distribution controls**, press **Edit**, set **Sharing** to enabled, fill in the
   requested fields (vendor, privacy and security answers), and press **Save changes**.
2. Copy the **Installation link** for the production environment.
3. Put the link in the Devpost entry (`docs/SUBMISSION.md`, "Install link").

The menu names above are from the console's documentation; they were not checked in a browser.

Not checked: whether a judge's site needs a paid plan for the install, and whether Rovo (for the
T08 advice) is on the judge's site.
