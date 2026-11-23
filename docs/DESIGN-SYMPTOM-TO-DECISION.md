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

## Plan for one full run before the 9 Dec freeze (23 Nov, plan only)

Status: plan, no code. The run is one symptom, one finding, one ticket, one fix PR, one claim
and one decision on the development site.

### The case

The statement end date of discovery set 2 (case D2-1, `benchmark/RESULTS-DISCOVERY-2.md`): the
statement query uses a half-open interval, so a line on the end date is missing. The rule is a
README line: the statement endpoint gives lines with "both dates inclusive". Thus a defect
finding can cite a rule line and stays a defect. In the bake-off the local model found the right
cause and file in 2 of 3 runs. The deployed Rovo model was not measured on it.

The fallback is D-1 of set 1 (the race in `src/bank/ledger.py`). It is on the branch that exists
today (`investigate/symptoms` of the cases repository, 45a211d), and the README states the rule
("concurrent withdrawals cannot overdraw an account"). The local model found it in 0 of 3 runs,
so it is the second choice.

### What exists on 23 Nov

- Steps 2 to 4 and 6: the discovery actions, the rule-citation rule (merged, PR 74) and
  `create-ticket` with `findingId`.
- Step 5: the panel section "Discovery finding" (merged, PR 80; deployed to development in
  5.12.0 on 23 Nov).
- Steps 7 and 12: the AC editor and "Link PR" (merged, deployed since 5.10.0).
- The repository of the environment: development reads `ysant77/yms-bank-demo-cases` since 23
  Nov (owner's approval; `docs/FIRST-JUDGE-CLAIM.md`).
- Steps 9, 13, 14 and 16: CI with the report, the verifier, the sign-off and the decision rules.
- The judge-branch way of the cases repository: a push to `judge/**` writes the report of the
  merge commit (cases PR 16).

### What is missing

1. **The discovery variables (done for development).** The owner set `DISCOVERY_REPO` and
   `DISCOVERY_REF` on development on 23 Nov (`investigate/symptoms`); development runs 5.13.0
   with them. For the D2-1 run, `DISCOVERY_REF` must name the branch of item 2.
2. **A branch with only this bug.** `investigate/symptoms-2` is not on GitHub, and its tree is
   older than the judge workflow. The run needs one branch, for example `judge/D2-1`, that is
   the current cases `main` plus the D2-1 seed change only. It is both the investigated branch
   (`DISCOVERY_REF`) and the base of the fix PR. Its push run writes its report. It must hold no
   answer key; the bank's `tests/test_discovery_branch.py` checks this. The push of this branch
   to the cases repository is **not approved** (23 Nov); nothing is pushed until the owner
   approves it.
3. **The fix PR.** Prepared by the owner (step 8 stays scripted): the fix and one test that fails
   on base, for example `test_statement_includes_the_end_day`. The model chooses its own
   reproducer name, so the person who records the ACs (step 7) names the prepared test in the AC
   line. That is a person's step, and it is shown as one.
4. **A second candidate PR (optional).** Steps 15 and 16 run only with two PRs for one work item.
   Without a second PR, the run ends at the verdict (step 13) and the merge.

### The order of work

| # | Work | Who | Depends on |
|---|---|---|---|
| 1 | Done on 23 Nov: PR 80 merged; `GITHUB_REPO` switched; discovery variables set; development deployed (5.13.0) | lead, owner | none |
| 2 | Set `DISCOVERY_REF` on development to the branch of item 3; one deploy | owner | 3 |
| 3 | Push `judge/D2-1` (cases `main` plus the D2-1 seed only); check the push run and its report; run the answer-key check. **Not approved on 23 Nov** | session, only after the owner's approval of this cases-repository change | none |
| 4 | Prepare the fix patch and its test on a local branch; no PR yet | session | 3 |
| 5 | Rehearsal: symptom (the D2-1 text, word for word) in Rovo chat, investigation, finding, the panel view, ticket, ACs (account A), fix PR into `judge/D2-1`, CI, review advice, merge, link (account A), `claim: done` (account B), verdict | owner in Jira, session on GitHub | 2, 4 |
| 6 | Record the run: each audit sequence, the finding, the verdict, the token log line; one results page | session | 5 |

A wrong cause or a by-design result from the model is a result, not a failure of the run. It is
recorded as it is, and the person decides at step 5 not to make a ticket. One more attempt is
allowed, with the same symptom and no change to the prompt or the rules. Nothing is tuned to get
a pass.
