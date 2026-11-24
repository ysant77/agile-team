# The first claim on a judge branch (owner steps, 23 Nov 2026)

These are the steps the owner does in Jira for the first claim through the fresh-site path
(`docs/JUDGE-PATH.md`, "A judge on a fresh site"). The app work for this path is on `main`, and
development runs 5.13.0 (deployed on 23 Nov from `main` 520811a). The five judge branches and
their reports exist on the cases repository (cases PRs 17 to 21).

## The first live claims (done on 24 Nov)

On 24 Nov the claims were made on the development site. Account A recorded the ACs and linked
the PRs (and signed off U12); account B made every claim. Development runs 5.13.0, deployed from
`main` 520811a. The source of 520811a is the same as the source of `main` 665e93e: the commits
between them change docs only. So development runs the code of the current `main`.

| Work item | Case | PR | Verdict | Expected | Log: calls, retries, rateRemaining, authenticated |
|---|---|---|---|---|---|
| BANK-10 | U01 | 17 | supported | Supported | 12, 2, 4905, true |
| BANK-11 | U04 | 18 | contradicted (the AC test passes on base) | Contradicted | 11, 1, 4880, true |
| BANK-12 | U20 | 19 | contradicted (a pinned base test fails on the head) | Contradicted | 11, 1, 4989, true |
| BANK-13 | U12 | 20 | cannot_verify (sign-off required) | Cannot verify | 10, 0, 4979, true |
| BANK-13 | U12, after the sign-off | 20 | supported | Supported | 10, 0, 4955, true |
| BANK-14 | T08 | 21 | supported | Supported | 11, 1, 4968, true |

Result: 6 of 6 verdicts as expected, one run for each case. Every log line has
`"authenticated":true` and a rate limit of the 5,000 class, so GitHub accepted the token.

Not shown by these claims: a fresh-site install, the production deploy, the judge install link
(steps 4 and 5 of `docs/OWNER-HELD-STEPS.md`), and the advisory review of T08 (the reviewer was
not run on PR 21). The retries are explained under "Retries" below where that change is merged.

## The repository of the environment (done on 23 Nov)

Each judge PR is on `ysant77/yms-bank-demo-cases`. The app reads one repository only: the
`GITHUB_REPO` variable of its environment. Until 23 Nov development had `ysant77/yms-bank-demo`,
a different repository, so "Link PR 17" would have found PR 17 of that repository.

The owner approved the switch on 23 Nov. On development, `GITHUB_REPO` is now
`ysant77/yms-bank-demo-cases`, and development was deployed from app `main` dbf5555 at 21:32
SGT (version 5.11.0). At 21:37 SGT it was deployed again from `main` 0bc97a8 (version 5.12.0),
with the discovery finding view of PR 80, and later from 520811a (version 5.13.0), with the
discovery variables.
Both repositories are public, so the token needs no new grant. The old BANK-5 to BANK-9 claims on
development now read the cases repository too. Production is not changed.

## What you need

- A Jira site with the app installed (development, 5.13.0 or later).
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

**Retries (24 Nov).** `retries` counts the GitHub calls that were made again after a thrown
fetch, an HTTP 5xx or a secondary rate limit. It need not be 0. On the first live claims of
24 Nov it was 1 or 2 on four of six claims, and every verdict was as expected. The same calls
made locally (5 rounds, 55 calls) all answered 200 or 404 in less than 1 s, so the cause was not
found. From the next deploy, a line with a retry also has `"retried"`: for each of the first five
retries, its kind (`network`, `server` or `secondary_limit`), the HTTP status and the path with no
query. It holds no header and no body.

## Local replay of the judge route (24 Nov)

`test/judge-live.test.js` runs the five judge PRs with no network. It uses the panel's own
actions (save and record the AC line, link the PR, and for U12 the sign-off) as account A, and
`verifyClaim` with a claim by account B. The store and Jira are stand-ins. GitHub is a recording
of the real answers of the cases repository (`fixtures/judge-live/`), made with read-only GET
calls by `node scripts/judge-live.mjs --capture`. The recording keeps the status and the body.
It removes emails, node ids, GitHub App records and the API URL fields that the app does not read. A path that is
not in the recording stops the replay, so a change in what the app reads shows in the test.

The replay gives the five expected verdicts. It does not prove the live site, the token or the
Jira steps. The live claims of 24 Nov are the record for those.

| Case | PR | Head | Merge commit | CI on the head (pull_request) | CI on the merge commit (push) | Report |
|---|---|---|---|---|---|---|
| U01 | 17 | `b2d566d` | `968aad6` | 45147637897, success | 45147983818, success | `reports/judge-U01.json` on `ci-reports` |
| U04 | 18 | `232a47e` | `18f8647` | 45148436262, success | 45148761734, success | `reports/judge-U04.json` on `ci-reports` |
| U20 | 19 | `f979573` | `f75844a` | 45149335831, success | 45149644796, success | `reports/judge-U20.json` on `ci-reports` |
| U12 | 20 | `7f3d60f` | `b601a06` | 45149990134, success | 45150310359, success | `reports/judge-U12.json` on `ci-reports` |
| T08 | 21 | `db1082f` | `a615391` | 45150614527, success | 45150944987, success | `reports/judge-T08.json` on `ci-reports` |

Recorded on 24 Nov 2026 from the cases repository `main` at `bdc14be`.
