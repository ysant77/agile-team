# Submission text (draft, 22 Nov 2026)

Draft for the Devpost form. The figures are copied from the files named in each line. Do not
round them up and do not drop the misses.

**Category:** Apps for Software Teams. **Bonus:** Best Agents (`rovo:agent` with reusable
`rovo:action` and `rovo:skill` modules).

## In one sentence

A Forge app for Jira that checks a "done" claim against the pull request, the CI report and the
work item, and says Supported, Contradicted or Cannot verify, with the reason. Code decides the
verdict. A model only gives advice, and the advice is not counted.

## The problem

An agent or a person writes "done" on a Jira work item. A reviewer then sees a green CI run and a
merged pull request. A green run does not show that the change fixes the problem: the test can
pass before the change too, the change can make an old test weaker, or the test can check only one
case of the acceptance criterion. When AI agents write more of the code, a team needs a check that
does not trust the agent's own words.

## What it does

1. A person or an agent writes a comment `claim: done` on a work item.
2. The app finds the linked pull request and reads the CI report that the repository's pinned
   workflow wrote.
3. Code runs the checks for that claim type and writes a verdict comment and an audit event.
   For a `done` claim with code work, the checks include:
   - the pull request is merged, and the report for the merge commit is clean;
   - the named test fails on the base commit by an assertion and passes on the head (reproduced);
   - at least 80% of the changed lines are covered;
   - base copies of the changed old tests still pass on the new code (the protected set);
   - no test is removed without an approval by a person other than the claimant;
   - the acceptance criteria match the last record that a person made;
   - the report comes from the pinned workflow run on the head commit, with a hash marker.
4. The issue panel shows the state, the reason, what was proved, what was not checked, and what a
   person must do.
5. Some work needs a person. A work item with the label `money_semantics` stays at Cannot verify
   until a person other than the claimant signs off the merged commit in the panel.

The verifier gives `unknown` when an input is missing or malformed. No check passes because an
input is absent.

## How it uses Forge and Rovo

| Part | Forge module | What it does |
|---|---|---|
| Claim intake | `trigger` on `avi:jira:commented:issue` | Admits a `claim:` comment once, with rate caps |
| Verifier | `consumer` and a queue | Runs the checks out of the comment request; reads GitHub through declared egress (`api.github.com`) |
| Verdict view and sign-off | `jira:issuePanel` (native render) | Verdict, evidence levels, AC record, test approvals, sign-off; every action is audited |
| Monitor | `jira:globalPage` | The audit chain check and the team statistics |
| Audit log | Forge storage (KVS) | Append-only, hash-chained events; each verdict comment gives its sequence number and hash prefix |
| Agents | `rovo:agent` (Agile PM, Agile Team Lead, Agile Code Reviewer) | Write checkable tickets, give an opinion on competing pull requests, review a pull request |
| Reusable parts | 13 `rovo:action`, 3 `rovo:skill` | Other agents can lint a requirement, read verdicts, read a diff, record a review |
| MCP | `rovo:mcp` | Read-only tools: lint a requirement, get verdicts, read a commit |

No model API outside Atlassian is called by the app. The agents run on Rovo.

## What we measured

All runs are local: local branches of a demo bank, CI commands run locally, and a simulated GitHub
and Jira in the scorer. The case sets were written outside the team. The figures below are from
`benchmark/RESULTS-4.md`, `benchmark/RESULTS-5.md`, `benchmark/RESULTS-5-ARM-D.md` and
`docs/claims.md`.

**Blind set 4 (24 cases).** Right outcome:

| Arm | Right of 24 | Supported on a case that is not a control | Control not supported |
|---|---|---|---|
| A1, standard GitHub rules | 9 | 15 | 0 |
| A2, hardened GitHub rules | 13 | 1 | 9 |
| C, this verifier | 13 | 9 | 1 |

**Blind set 5 (24 cases, 10 controls), verifier:**

- Right: 16 of 24 (67%). Strict right (outcome and reason): 14 of 24.
- 0 unsafe Supported in the high-stake classes (old test, AC change, report trust, high stake).
- **Miss:** 3 false blocks on correct controls (V07, V13, V17), where the rule allowed at most 1.
- **Miss:** 4 unsafe Supported (V02, V09, V12, V18). In each, the test fails before and passes
  after, but does not check every case of the criterion.

**The model reviewer as a gate (set 5): not met.** It caught 0 of the 4 unsafe cases and held 2
correct controls. So from 20 Nov the reviewer is advice only. It is shown, and it never changes a
verdict.

**Discovery (a model looks for a defect): not met** in two rounds. We present it as a grounded,
unconfirmed lead that a person classifies, not as a defect finder.

**Live run on a Jira site (22 Nov):** the five demo cases ran on a real site with two users.
Each gave the expected verdict; see `docs/claims.md`, "Live run on a Jira site". On T08 the
model's advice did not show: the guard for numbers rejected the review (1 of 1 attempts), and
the verdict was not affected. It is one run of five cases, not a measurement of accuracy.

## Limits

- "Supported" is a claim about the named test, not a claim that the work is correct. The panel
  always says "Not checked: whether the test covers every case of the criterion."
- The CI report is written by CI in the repository under test. The pinned workflow, the bot
  author, the head commit and the hash marker make an edit after the run visible. They do not
  make the run honest.
- Each set has 20 to 40 cases. On 24 cases, one case moves a rate by about 4 points. Sets 1 to 5
  are now development sets. A new claim needs a new blind set.
- The verifier reads one configured GitHub repository (`GITHUB_REPO`), and the CI report format
  of the demo bank (`docs/ci-report.md`). Another repository needs that workflow and report.

## Related work

AutoCodeRover: Agentic Program Repair for SonarQube Issues. FSE Companion '26.
doi:10.1145/3803437.3805209.

## Links

- Code: this repository (MIT).
- Demo bank: https://github.com/ysant77/yms-bank-demo
- Demo case pull requests: https://github.com/ysant77/yms-bank-demo-cases
- Install link: (owner adds it from the developer console)
- Video: (owner adds the YouTube link)
