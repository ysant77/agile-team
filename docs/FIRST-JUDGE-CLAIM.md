# The first claim on a judge branch (owner steps, 23 Nov 2026)

These are the steps the owner does in Jira for the first claim through the fresh-site path
(`docs/JUDGE-PATH.md`, "A judge on a fresh site"). The app work for this path is on `main`, and
development runs version 5.10.0. The five judge branches and their reports exist on the cases
repository (cases PRs 17 to 21).

## Before you start: the repository of the environment

Each judge PR is on `ysant77/yms-bank-demo-cases`. The app reads one repository only: the
`GITHUB_REPO` variable of its environment. On 23 Nov the development environment has
`GITHUB_REPO` = `ysant77/yms-bank-demo`, a different repository.

With that value, "Link PR" for the number 17 finds PR 17 of `yms-bank-demo`, which is not the
judge PR. A link given as a URL of the cases repository is refused ("that PR is in another
repository"). Thus, before the first claim on development, the owner sets the variable (in a
terminal, in the app's folder):

```bash
forge variables set -e development GITHUB_REPO ysant77/yms-bank-demo-cases
```

Then deploy development one time, so that the new value is used:

```bash
forge deploy -e development
```

Both repositories are public, so the token does not need a new grant. This change is held for the
owner; no session sets it. The old BANK-5 to BANK-9 claims on development then read the cases
repository too.

## What you need

- A Jira site with the app installed (development, 5.10.0 or later).
- Two accounts on that site. Account A records the ACs and links the PR. Account B makes the
  claim. The app counts an AC record and a PR link only when they come from a person other than
  the claimant.
- A terminal in the app's folder for the log check (last section).

## Steps for one case

Do U01 first: it is the control case, and its expected verdict is Supported.

1. **Work item.** Make a work item of the type in the table below. Use any project key. For U12,
   add the label `money_semantics`.
2. **ACs (account A).** Open the work item. In the panel **Agile team verifier**, under "Edit the
   acceptance criteria", paste the AC line of the case from `docs/JUDGE-PATH.md` (one line, as it
   is). Press **Save and record**. The panel shows the AC and the audit sequence of the record.
3. **PR link (account A).** Under "Linked pull request", type the judge PR number from the table
   below (for example `17`). Type a reason of 5 characters or more, for example
   `judge case U01`. Press **Link PR**. The panel shows "PR #17, linked by ..." with an audit
   sequence.
4. **Claim (account B).** Add the comment `claim: done` on the work item.
5. **Verdict.** In about 15 s, the app adds a verdict comment, and the panel shows the verdict.
   Compare it with the table below.
6. **U12 only (account A).** The first U12 verdict is Cannot verify. In the panel, under
   "Sign-off of the merged change", type a reason and press **Sign off the merged change**. Then
   account B adds `claim: done` again.

## The five expected verdicts

| Case | Work item type | Judge branch | Judge PR | Expected verdict |
|---|---|---|---|---|
| U01 | Bug | `judge/U01` | 17 | Supported |
| U04 | Bug | `judge/U04` | 18 | Contradicted: the AC test passes on base, so it does not reproduce the problem |
| U20 | Bug | `judge/U20` | 19 | Contradicted: a pinned base test fails on the head code |
| U12 | Bug | `judge/U12` | 20 | Cannot verify (a sign-off of the money rule is required); after the sign-off by account A, Supported |
| T08 | Story | `judge/T08` | 21 | Supported. Advice from the reviewer shows under "Advice from a model, not counted" only if the reviewer was run on the PR; it does not change the verdict |

If a verdict is different, do not do the next case. Keep the verdict comment and the log line,
and send both to the lead.

## The log line that proves the GitHub token

After the first claim, in a terminal in the app's folder:

```bash
forge logs -e development --limit 50
```

Find the line that starts with `verdict` and has the work item key. It has this form:

```text
verdict <KEY> done supported {"calls":<n>,"retries":0,"rateRemaining":"<r>","authenticated":true}
```

The token works if both of these are true:

- `"authenticated":true`. The app sent the token.
- `rateRemaining` is near 5,000 (for example 4,9xx). A request with a token has a limit of 5,000
  for each hour. A request with no token, or with a token that GitHub does not accept, has a
  limit of 60 or gets a 401 error.

Write the value of `rateRemaining` and the time in the run notes. Do not copy the token or any
value from `forge variables list` into a note, a chat or a commit.

If the line has `rateRemaining` near 60, or the verdict comment says "not checked" with a GitHub
error, stop and tell the lead.
