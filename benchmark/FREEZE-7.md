# Set 7: freeze note (fixed 24 Nov 2026 17:12 SGT, before the set 7 case file is opened)

## The case file

- Writer: blind. The writer saw no source, test, fixture, run folder or result of the app or the
  bank. The lead holds the file.
- sha256 of the case file, given by the lead before the release:
  `ece33972d9c6889b2c5c3348c9e19a93055707f3a872dc5ade4a54c91a6bb5fd`
- Checked after the copy into `CASES-7-INDEPENDENT.md`: (filled in `BUILD-7.md` after the release;
  this note does not change)

## Frozen code

| Part | Repository | Commit |
|---|---|---|
| The app under test (`--app`, `--app-main`) | agile-team `main` | `cea04706e08e12a4c6fa6c9a8c9efff57a01f8d3` |
| Configuration (`VERIFY_CONFIG` of that commit) | agile-team `main` | `cea04706e08e12a4c6fa6c9a8c9efff57a01f8d3` |
| Runner, scorer, summary (`benchmark/run`) | agile-team `main` | `cea04706e08e12a4c6fa6c9a8c9efff57a01f8d3`; scorer changes up to 22 |
| Bench base, and `scripts/repro.py`, `scripts/changed_coverage.py`, `scripts/pinned.py` | yms-bank-demo `main` | `165b6893c351a098319112e0ed1eb27d5e77fbce` |
| Arm D (only if the lead names it for set 7) | agile-team `main` | not run (no reason named) |

From the frozen commit until `RESULTS-7.md` is pushed: no change to `src/verifier/`,
`src/verify-claim.js`, `src/github-evidence.js`, `src/jira-evidence.js`, `src/approvals.js`,
`src/review*.js`, `src/sign-off.js`, `src/pr-link.js` or the scorer.

## What changed since the set 6 freeze (9ec52ca)

For the lead's record only; never given to the writer. These are the merged PRs that change a
frozen file above, or `src/audit-store.js`, which the claim path calls.

| PR | Change in the code under test |
|---|---|
| 69 | A skipped or not-run test is `unknown`, not a fail (set 6 W22). The rename rule needs a link between the old test and the new one (set 6 W13). `src/verifier/checks.js`. |
| 71 | A PR linked from the panel: an audited entry in the app store (`pr-links:<key>`); a claim reads that PR by number only when a person other than the claimant made the link. `src/pr-link.js`, `src/verify-claim.js`, `src/verifier/checks.js`. |
| 72 | The base report path for each branch. `src/github-evidence.js`. |
| 73 | `samesite` is a security value argument (part of set 6 W10). `src/verifier/checks.js`. |
| 85 | One audit event per operation (`appendAuditOnce`): a retried verdict or done-evidence write does not add a second event. `src/audit-store.js`, `src/verify-claim.js`. |
| 86 | The collector keeps the first 5 retried GitHub calls in `meta.retried` (kind, status, path). No verdict change. `src/github-evidence.js`. |
| 87 | Scorer change 22: the simulated sign-off, PR link, rate limit, merge commit that CI did not run on, and push run in progress. `benchmark/run/`. |
| 92 | The claim lease has an owner token and an atomic swap; each side effect is fenced. No verdict change. `src/verify-claim.js`. |
| 94 | Item 1, decided by the owner on 24 Nov, before the case file existed: a claim whose only PR link was made by the claimant is Cannot verify (it was Contradicted); a done claim with no PR stays Contradicted. `src/pr-link.js`, `src/verify-claim.js`. |
| 95 | Item 2, decided by the owner on 24 Nov, before the case file existed: when `main.json` is not for the merge commit, the reason tells a push run still in progress (wait, then claim again) from a missing report. The check stays `unknown`, so no verdict changes. `src/verifier/checks.js`, `src/github-evidence.js`. |

Identity: at the frozen commit, the scorer results of sets 1 to 6 are byte-identical to main
before PR 94 and 95 (6f33f0a). On the development set 7, DEV7-07 changes from Contradicted to
Cannot verify, and DEV7-10 and DEV7-11 change only their reason text.

## Facts that the scorer cannot express (fixed before the case file is opened)

Scorer change 22 added the five facts that `SET7-PREPARATION.md` listed. A case that needs one
of the facts below is not buildable. It is counted apart, with its reason, and never rewritten.

- Two claims at the same time on one work item (the claim lease): the scorer runs one claim per
  case (`run/score.mjs`).
- A Jira error or a Jira answer that is not the case data: the simulated Jira gives only the
  case data (`run/sim-jira.mjs`).
- A GitHub failure other than 404 on the run list (`github.runs404`) and the rate limit
  (`github.rateLimited`), for example a 5xx answer or a timeout (`run/score.mjs`, `run/sim-set7.mjs`).
- A failure of the app store or the audit chain while a claim runs (`run/sim-jira.mjs`).
- Advice from a model reviewer: arm C does not run a model (`run/score.mjs`).
- A rate-limit reason holds a clock time ("try again after ..."): the app adds the simulated
  `retry-after` header (`run/sim-set7.mjs`) to the time of the run (`src/github-evidence.js`), so
  two runs of one case can differ in that text only. Results are compared by outcome and checks,
  not by this time.
- Known limits that stay (stated, not fixed): the verifier does not read AC text (set 6 W18), it
  has no check for a side effect that no test asserts, and the CORS part of W10 is not in the
  security check.

## Arms

- C: the app's `decide()` on stored evidence (`run/score.mjs`), every buildable case.
- D: not run. The lead named no reason for arm D.

## After the freeze

From the frozen commit until `RESULTS-7.md` is pushed: no change to the verifier files named
above. A scorer change is allowed only as a row in `run/SCORER-CHANGES.md` that states "seen set 7
results: yes" or "no", with the results before and after the change.

## Local only

No push, PR or merge on a demo repository, no deploy, and no Forge variable change for set 7.
The bench clone `bench-bank-7` has no remote.
