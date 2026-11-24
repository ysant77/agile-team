# Scorer and rule changes after the freeze (dbc4fcb, 16 Nov 2026)

The case files (`CASES.md`, `CASES-INDEPENDENT.md`, `PREDICTIONS-INDEPENDENT.md`) are
byte-identical to dbc4fcb (`git diff --stat dbc4fcb` on them is empty). The scorer did not exist
at the freeze. It was written after the freeze and first committed in the commit that adds this
file. Every change made after a case result was seen is listed below.

| # | Change | Seen results before? | Kind | How it is reported |
|---|---|---|---|---|
| 0 | First scorer version, written before any case result: A1 and A2 by the rules of section 1; C by the app's `decide()` on a simulated GitHub. | No | — | — |
| 1 | I09: the manifest lists two branches (the PR and the moved main tip B2). Version 0 read every two-branch case as competing PRs and ran arbitration. Now a case with `baseMovedTo` scores only its first branch as one PR. | Yes (I01 to I10) | Bug fix. Frozen text: I09 is one PR with a `ready` claim and a moved base (CASES-INDEPENDENT.md, I09). Version 0 did not do that. | Fixed. Version 0 output for I09 ("code winner") is shown in the results as a scorer bug. |
| 2 | A2 repro job, "any test that the PR adds or changes". Version 0 applied it to every test row of the changed test files (what `scripts/repro.py` copies). Now read per test: a test id that is new against the base report, or whose `def` line is added or removed in the diff. | Yes (I01 to I10) | Ambiguous frozen text. "A test that the PR adds or changes" can mean the test function or the test file. | Both readings are scored and shown: **A2** (per test) and **A2-file** (per file, version 0). Neither is called the primary result alone; the table shows both. |
| 3 | A2s: code owners on test-support paths only (not every file under `tests/`). | Yes | Added after the freeze. Sensitivity variant, not scored as a primary result. | Labelled "A2s, post hoc". |
| 4 | B17 and B18: the builder measured two bench runs per side (`run_medians`), not 20 runs with an IQR. The scorer uses the median of the run medians and their range as the spread. | No (made before any B result) | Adapter for the builder's data format; the frozen rule (10% margin, no IQR overlap) is unchanged. | Noted with the B17 and B18 rows. |
| 5 | Runner, B07: `run_ci.py` ran the full suite even when the PR's own `ci.yml` passes `--ignore` to pytest. It now keeps the `--ignore` and `--deselect` flags of the PR's report step. | Yes (B07: A1 blocked, local run red) | Runner bug. Frozen text (CASES.md section 6): "The bank CI commands run locally"; the CI commands of a PR are its own workflow. | Fixed. Before: A1 and A2 blocked, C cannot_verify. After: A1 merge, A2 blocked, C cannot_verify. |
| 6 | Evidence, B05: the first local run hit the flaky failure (red). The frozen case says "a re-run of the workflow turns it green". The evidence was run again until green (attempt 2) and the simulated GitHub shows run attempt 2. | Yes | Case built as described (the first run did not match the stated state). | Fixed. Before: A1 blocked, C contradicted. After: A1 merge, C supported (unsafe). |
| 7 | B17 and B18: C's arbitration. The done-gate branch (`feat/definition-of-done`) still carries the arbitration rule from before PR 3; main (merged a5e7ad8) has the recommendation-only rule. C now takes arbitration from main, the current app. | Yes (B17: done-gate branch gave "code winner B17-b, smaller diff") | Version choice: the app as merged. | Both shown in the table: main result, and the done-gate branch result in the reason column. |
| 8 | Summary: metric 9 (ends at a human) added to the table. | Yes | Reporting only (metric 9 is in CASES.md section 4). | Shown. |

The frozen A2 says code owners on `tests/`. Read as written, any PR that touches a test file
waits for a code-owner review (a `human gate`). The primary A2 keeps that.

## Set 2 (frozen at fe77128)

| # | Change | Seen set 2 results before? | Kind |
|---|---|---|---|
| 9 | Runner and scorer support for the set 2 facts: a report made on an older commit with the branch tip as the PR head (S17), a cancelled CI run on the head (S17, S20), a report from another workflow with no repro or coverage block (S20), a coverage file removed from `coverage.json` before the coverage script (S18), and the base tip from a branch. A1 and A2 read a cancelled run on the head as a failed required check. | No (made before any set 2 build finished) | Support for case facts the frozen set 2 text states. Set 1 outcomes are unchanged by it (checked). |
| 10 | `summarize.py` takes the truth file as an optional second argument. Set 2 uses `truth-2.json`, copied from the frozen rows of `CASES-2-INDEPENDENT.md`. With no argument the set 1 output is byte-identical (checked). | No | Reporting only. |

Run facts for set 2 (not changes): the evidence used `scripts/repro.py` from the bank branch
`fix/repro-base-test-names` (679c055). For S17, the runner also wrote evidence for the second
manifest branch `case/S17-main-b2`; the scorer does not read it (a `baseMovedTo` case scores its
first branch only, change 1). No case was re-run.

## Set 3 (protocol ARM-CD-PROTOCOL-3.md)

| # | Change | Seen set 3 results before? | Kind |
|---|---|---|---|
| 11 | A arms: a result field `cancelledAsPending` when a cancelled run on the head is the only reason for `blocked`; `summarize.py --cancelled-as-pending` scores that reading. | No (before set 3 is read) | Second reading, ordered by the lead. Set 1 and set 2 outcomes are unchanged. |
| 12 | `summarize.py`: strict count (outcome right and the truth `reason` pattern matches the reason). | No | Reporting. For sets 1 and 2 the strict row equals the outcome row (no reason patterns). |
| 13 | `run_ci.py --coverage-script` and `run_all.py --coverage-script`: copy the bank's fixed coverage script into the case tree. | No | Runner support for the frozen bank fix ba90b0f. |
| 14 | `arm_d.mjs --rule blocking` and several `--manifest` options. The default rule stays `any-finding` (the set 2 protocol). | No | D harness for code-review/2. |
| 15 | Regression reading 2 (17 Nov 2026): copies of the recorded evidence get `"unmeasured_files": []` in each coverage block that has no such field. The recorded evidence and every result file stay unchanged. | Yes (development sets only) | The evidence was built before the bank wrote the field; reading 1 shows the rule as it acts on that old evidence. |
| 16 | `run_ci.py --overlay <file>:<path>` (and `run_all.py --overlay`): put a newer bank CI file into the head tree and, through `BENCH_OVERLAY` and a hook added to the copied `repro.py`, into each base checkout. Used to rebuild the evidence of sets 1 to 3 with bank PR heads (repro.py de6436e, ci_report.py de6436e, changed_coverage.py 2be2de7), as on main after the bank PRs merge. | Yes (development sets only) | Regression re-score, 17 Nov 2026. The case branches and the recorded evidence of the scored results are unchanged. |
| 17 | Simulated Jira and GitHub give what the live collectors always give, with the values the case text implies. (1) The ticket gets `subtasks: []` and `links: []` unless the case names its own: the live `collectJira` always sets both (agile-team 88c468d, `src/jira-evidence.js` lines 46 and 50, from `issue.fields.subtasks ?? []` and `issuelinks ?? []`). (2) Attempts are served per run id, and the attempt endpoint gives the attempt's conclusion: the live reader asks for each earlier attempt and its jobs (`src/github-evidence.js` lines 129 to 145) and, for a cancelled run, its own jobs and job conclusions (lines 149 to 156). A re-run case keeps its failed earlier attempt as the case states; a cancelled run gets one cancelled job with no failed step; no case gets an earlier failed attempt it does not state. | Yes: made after the results on rebuilt evidence were seen (17 Nov 2026) | Harness gap: the verifier now gives cannot_verify on a missing list, and the simulation did not give the lists the live collector gives. No rule change. Development sets only. |
| 18 | `arm_d.mjs` (18 Nov 2026): each model tool call is checked before it reaches a tool (`run/dispatch.mjs`): the name must be on the runner's tool list and in `src/tool-specs.js` of the reviewer checkout, and the arguments must be an object with no unknown key, every required key and the spec type. A refused call gets an error result and a `refusedCall` trace row. Each model server call has a time limit (`--timeout-s`, default 600 s). | Yes (development sets only) | Harness safety. Checked on the 243 tool calls of the 48165f5 regression run (sets 1 to 3): every call passes, so no recorded result would change. |

## Set 4 (protocol ARM-CD-PROTOCOL-4.md)

| # | Change | Seen set 4 results before? | Kind |
|---|---|---|---|
| 19 | `run/make_truth4.py` writes, beside the primary `reason` (plain-text alternatives, the protocol rule), a second field `reason_regex`: the writer's pattern read as a regular expression (`\|` read as `|`). The strict count of the second reading is reported beside the primary, never instead of it. | No (fixed after reading the case list, before any build) | Second reading. The writer used regular expression syntax in several patterns, which the plain-text rule cannot match. |

## Listing regression (19 Nov 2026; written before any run with this change)

| # | Change | Seen results before? | Kind |
|---|---|---|---|
| 20 | The simulated GitHub serves what the bank CI gives since bank PR 22 (356cb19): each run gets `event` (`pull_request` for the PR run), `head_branch` and `head_repository` (`someone/yms-bank-demo` for a fork case); `/actions/runs/{id}/artifacts` returns `ci-report` and the marker `ci-report-sha256-<h>-attempt-<n>` for the pinned PR run, where `<h>` is the report hash rule (sha256 of the text without trailing spaces, tabs, CR and LF) of the report as CI wrote it and `<n>` the run's attempt; `/actions/runs?head_sha=<sha>&event=push` returns one push run on `main` for the commit that `main.json` names, whose artifacts hold `main-report-sha256-<h>-attempt-1` of the bytes served as `main.json`. Case facts as the frozen texts state them: B12 (report edited by a user after the run) gets the marker of the report before the edit; S20 (report from the Nightly workflow) and I08 (no bot report, fork) get no `ci.yml` marker; a cancelled run gets no marker. The simulator code is in `run/sim-provenance.mjs`. | Yes (sets 1 to 4 seen). It adds facts the live collector now reads; it changes no case text. | Support for the provenance check. Identity check before any result with listed repositories: old and new scorer, both with app `main` 31542d4 (nothing listed), must give identical result records on the recorded evidence (`run/evidence/pinned-2026-11-18`); the result is written below this table. |

**Identity check of change 20 (19 Nov 2026).** Old scorer (`main` 31542d4) and new scorer (this
branch), both with app `main` 31542d4 (nothing listed), on `run/evidence/pinned-2026-11-18`,
sets 1 to 4: every result record is identical (0 differ on each set; right 35, 18, 13, 15).

## Set 5 (protocol PROTOCOL-5.md; written before any set 5 build or result)

| # | Change | Seen set 5 results before? | Kind |
|---|---|---|---|
| 21 | The simulated Jira, app store and GitHub give the set 5 facts that the frozen app reads and the scorer did not give. All four parts act only on manifest fields that sets 1 to 4 do not have. **(a)** A case with `jira` data gets the app's audited approvals store (`readApprovals`: removals, changes, and the AC record `{ acHash, by, at, auditSeq }`) and the audit reader (`readAudit`). Each entry has a matching audit event (`test.removal_approved`, `test.change_approved` or `acs.recorded`) by the person that the case names, in one hash chain with the app's rules (`run/sim-jira.mjs`). It is used for V06, V17 and V20 (the lead's answers to the build questions, 19 Nov). **(b)** The claim gets `by`, the claimant account of the case, so the checks can compare an approval or an AC record with the claimant. **(c)** `github.reportCommentEdit` (V15): the bot comment is served with one repro base outcome changed (`passed` in the artifact, `failed` with `AssertionError` in the comment) and a later `updated_at`; the report that CI wrote, its artifact and its marker do not change. **(d)** `github.mainPushedByPerson` (V21): the push run on the merge commit has the conclusion `failure`, and its marker is the hash of the genuine main report, in which the named test failed; the served `main.json` is the file that the person pushed (all passed), which no marker matches. | No (written before any set 5 build or run) | Support for the set 5 case facts, as PROTOCOL-5 allows. Unit tests: `test/sim-set5.test.js`, one per part. |

**Identity check of change 21 (19 Nov 2026).** The old scorer (`main` 42673c1) and the new scorer
(this branch), both with app `main` 42673c1, were run on `run/evidence/pinned-2026-11-18`, sets 1
to 4. The verifier files are the same as at 36de990. Each `results.json` is byte-identical: 0
records differ on each set, and the right counts are 35, 18, 13 and 15.

What change 21 does not serve, because the frozen app does not read it: the Jira change history
(V06, V20), the comment edit history (V15), and the commits of the `ci-reports` branch (V21). The
lead's answers keep these facts as context only; `BUILD-5.md` states them per case.

## Set 7 preparation (24 Nov 2026; written before any set 7 case file exists)

| # | Change | Seen set 7 results before? | Kind |
|---|---|---|---|
| 22 | The five facts that `SET7-PREPARATION.md` lists as not expressible. Each part acts only on a manifest field that sets 1 to 6 do not have. **(a)** `jira.signoff { by, at, sha: 'merge' \| <sha>, reason }`: the ticket gets the `aat.signoff` property and the audit chain gets its `change.signed_off` event (`run/sim-jira.mjs`), as the panel's sign-off button writes them (`src/sign-off.js`); `'merge'` is the case PR's merge commit. **(b)** `jira.prLink { by, at, prNumber: 'case' \| <n>, repo?, reason }`: the app store gets `pr-links:<key>` and the chain its `pr.linked` event (`src/pr-link.js`); the claim then reads the PR by number, so `/pulls/<n>` gives the whole PR for such a case. `github.titleWithoutKey` serves the PR title without the work item key. **(c)** `github.rateLimited { remaining, resetAt?, retryAfterS?, message?, pathPattern? }`: every GitHub call (or each one whose URL matches the pattern) gets 403 with the rate-limit headers (`run/sim-set7.mjs`). A transient answer gives no verdict, so arm C records `not_checked` with the app's reason, as the app's comment says. **(d)** `github.mergeCommit { branch? }`: the merge commit is not the head that CI ran on (a fixed id made from the head, or the head of the named evidence branch of the merge result); `main.json` is that branch's report for the merge commit, or else the earlier main report. **(e)** `github.pushRunInProgress`: the push run on the merge commit has status `in_progress` and no conclusion; `main.json` is still the earlier main report. | No (no set 7 case file exists) | Support for the set 7 facts, as PROTOCOL-5 allows. Unit tests: `test/sim-set7.test.js`, one or two per part. |

**Identity check of change 22 (24 Nov 2026).** The old scorer (`main` 665e93e) and the new
scorer (this branch) were run on the stored evidence of sets 1 to 6 (`run/evidence/pinned-2026-11-18`
s1 to s4, `run/evidence/set5-2026-11-19`, `run/evidence/set6-2026-11-23`), each with the same app
on both sides: app `main` 665e93e, the set 5 frozen app 36de990 (sets 1, 4, 5 and 6), and the set 6
frozen app 9ec52ca (sets 1 to 6). Every `results.json` is byte-identical (16 of 16 pairs); the
hashes are in `run/evidence/identity-22-2026-11-24.txt`. With 9ec52ca, set 6 gives 13 right of 16
scored, as in `RESULTS-6.md`.
