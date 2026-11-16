# Evidence benchmark: frozen case set (pre-registered 16 Nov 2026)

This file fixes the cases, the correct outcome of each case and its reason **before any
scoring**. After this commit, no case, truth label or correct outcome changes. A case found to be
broken is marked `void` with a dated reason in a later commit, and it stays in the count of cases
made. The predictions in the last column are our guesses, written now so that a miss is visible.
They are not targets.

## 1. Workflows compared

| Id | Workflow | How it is run |
|---|---|---|
| A1 | Standard GitHub: required checks (tests, lint, CodeQL), branch protection, one approval, branch up to date | Rule evaluation: the same CI results as C, read against the declared protection rules. No repository setting is changed. |
| A2 | Hardened GitHub: A1, plus code owners on `.github/`, `tests/`, `conftest.py`, `pyproject.toml`, `uv.lock`, `scripts/`; the base-fails/head-passes job (`scripts/repro.py`) and the changed-line coverage job as required checks that fail the build | Rule evaluation, as A1. The repro job counts as failed when any ticket test does not fail on base by an assertion. |
| B | A1 plus Atlassian Code Reviewer | Documentation-based capability notes only. No score unless the owner's account can run it without payment. |
| C | This app: the verifier (`ready`, `done`), arbitration, audit record | The app code run on each case's evidence. |

For A1 and A2, "human review" is not simulated. A case that only a human reviewer could catch is
scored "depends on the reviewer", and it counts as not caught by the rules.

## 2. Outcome terms

- C gives `supported`, `contradicted` or `cannot_verify` (for arbitration: a code winner, or a
  human decision with or without a recommendation).
- A1 and A2 give `merge allowed`, `blocked` (a required check fails) or `human gate` (a required
  review from a code owner is pending).
- For scoring, `merge allowed` = supported, `blocked` = contradicted, `human gate` = cannot_verify.

## 3. Truth labels and correct outcomes

Each case has a **truth**: `valid` (the claim is true: the work is done and correct) or `invalid`.
Each case has an **evidence state**: `trusted` (complete, and not changed by the PR), `incomplete`
or `untrusted`.

| Truth | Evidence | Correct outcome | Also acceptable | Unsafe |
|---|---|---|---|---|
| invalid | any | `contradicted` | `cannot_verify` | `supported` |
| valid | trusted | `supported` | none | `contradicted` (false block) |
| valid | incomplete or untrusted | `cannot_verify` with the missing or untrusted item named | none | none |

The rows for each case below state the outcome explicitly. They decide over this table.

## 4. Metrics

1. **Unsafe supported:** an `invalid` claim given `supported` or `merge allowed`. Counted apart
   from everything else. This is the worst error.
2. **False block:** a `valid` claim with trusted evidence given `contradicted` or `blocked`.
3. **False cannot_verify (first-class):** a `valid` claim with **trusted and complete** evidence
   given `cannot_verify` or `human gate`. Reported as a count and a rate over the clean controls.
4. **Friction cannot_verify:** a `valid` claim whose evidence is untrusted only by rule (for
   example a legitimate change to `pyproject.toml`). Correct by the rule, but a cost to the team.
   Reported apart from metric 3.
5. **Appropriate cannot_verify:** `cannot_verify` where it is the correct outcome.
6. **Missing evidence named:** the reason names the missing or untrusted item (path, test,
   page limit, commit). Yes or no per case.
7. **Manipulation detected:** for cases with changed CI, test machinery or report scripts.
8. **Steps and time:** user actions and wall time to reach the outcome. Measured only on the live
   subset (section 7); otherwise "not measured".
9. **Human review workload:** the number of cases that end at a human, per workflow.
10. **Reproducibility and audit:** the same input gives the same outcome on a second run; the
    audit record holds the inputs and the reason.
11. **Setup:** the steps to install and configure each workflow, from its documentation.
12. **Rovo credits and other usage costs:** only when measured. The planned run uses no Rovo
    credits (section 6).

Results are paired by case (A1, A2 and C on the same case). We report counts with all case ids.
We do not claim statistical significance; 30 cases is an engineering sample.

## 5. Cases

Ticket keys are `BENCH-<n>`. "Repro" = the ticket test fails on base by an assertion and passes
on head. "Controls" are marked **control**. The bank code is `ysant77/yms-bank-demo` at the commit
named in the run record.

| Id | Cat. | Case | Truth | Evidence | Correct outcome and reason | Prediction (A1 / A2 / C) |
|---|---|---|---|---|---|---|
| B01 | 1 | Bug: fee rounding at half a cent. The fix and the AC test cover positive amounts only; negative amounts still round the wrong way. | invalid | trusted | `contradicted` or `cannot_verify`: the defect is not fixed. | merge / merge / **supported** (C sees only the AC test; expected miss) |
| B02 | 1 | Bug: interest for a leap year. The fix returns the expected value only for the input that the AC test uses (special case). | invalid | trusted | `contradicted` or `cannot_verify`: the code is fitted to the test. | merge / merge / **supported** (expected miss) |
| B03 | 2 | Bug: transfer to a closed account succeeds. The new test checks a behaviour that already holds on main; the code change does not touch the transfer path. | invalid | trusted | `contradicted`: the test passes on base, so it does not show the fix. | merge / blocked / contradicted |
| B04 | 2 | Bug: statement total off by one entry. The fix is real, but the new test is weak and passes on base too. | valid | incomplete (no reproduction) | `cannot_verify` or `contradicted`: no evidence ties the test to the problem. Not `supported`. | merge / blocked / contradicted |
| B05 | 3 | Bug: double withdrawal under 20 threads. The AC test fails on head about 1 run in 3; a re-run of the workflow turns it green. | invalid | untrusted (failed run on the head) | `contradicted` or `cannot_verify`. | merge after re-run / merge after re-run / cannot_verify or contradicted (re-run handling not confirmed) |
| B06 | 3 | Story: `is_zero` helper. The AC test asserts only that the function exists (`hasattr`), so it fails on base by an assertion and passes on head; the function returns the wrong value for negative zero minor units. | invalid | trusted | `contradicted` or `cannot_verify`: the test proves existence, not behaviour. | merge / merge / **supported** (stated limit) |
| B07 | 4 | Bug fix PR that also edits `.github/workflows/ci.yml` to skip the failing test file. | invalid | untrusted | `cannot_verify`, with the workflow path named. | merge / human gate / cannot_verify |
| B08 | 4 | Bug fix PR that adds `tests/conftest.py` with a hook that marks the AC test as passed. | invalid | untrusted | `cannot_verify`, with `tests/conftest.py` named. | merge / human gate / cannot_verify |
| B09 | 4 | Bug fix PR that edits `scripts/repro.py` so the base run always reports `AssertionError`. | invalid | untrusted | `cannot_verify`, with `scripts/repro.py` named. | merge / human gate / cannot_verify |
| B10 | 4 | Bug fix PR that is correct and also raises a version pin in `pyproject.toml` and `uv.lock`. | valid | untrusted by rule | `cannot_verify` with the files named (friction, metric 4). | merge / human gate / cannot_verify |
| B11 | 5 | Story: the author pushes a new commit after CI passed and claims `ready` before CI runs on the new head. | invalid (new commit breaks an AC test) | untrusted (stale) | `cannot_verify`: the report is for an older commit. | blocked (pending) / blocked (pending) / cannot_verify |
| B12 | 5 | Bug: the CI report comment is edited by a person to show a pass. | invalid | untrusted (forged) | `cannot_verify`: report not from the CI bot, or edited outside the run window. | blocked (real check failed) / blocked / cannot_verify |
| B13 | 6 | Story with no acceptance criteria; the author claims `done`. | invalid (nothing to check) | incomplete | `cannot_verify`: no AC maps to evidence. | merge / merge / cannot_verify |
| B14 | 6 | Story whose only AC is "the statement page is fast enough", `manual()`. | valid (per the PM, after the fact) | incomplete | `cannot_verify`, with "a human checks AC1" named. | merge / merge / cannot_verify |
| B15 | 7 | Story PR with more changed files than the app reads (page limit). | valid | incomplete | `cannot_verify`, with the page limit named. | merge / merge / cannot_verify |
| B16 | 7 | Bug fix where the GitHub token cannot read the workflow runs (HTTP 404). | valid | incomplete | `cannot_verify`, with the unreadable runs named. Never "no run" or "no change". | merge / merge / cannot_verify |
| B17 | 8 | Two fixes for the double spend (lock against a conditional update). Both pass the gates; the registered metric `transfers_per_s` medians are inside the noise. | n/a (choice) | trusted | No code winner. A human decides; "smaller diff" may show as a recommendation only. | human / human / human with recommendation |
| B18 | 8 | Two fixes for the double spend; one fails the 20-thread AC test. | n/a (choice) | trusted | Code winner: the side that passes the gates. **control** | blocked for the failing PR / same / code winner |
| B19 | 9 | Fraud model PR raises recall by fitting on the test split; it edits the evaluation code. | invalid | untrusted | `cannot_verify`: a guarded evaluation path changed. | merge / human gate / cannot_verify |
| B20 | 9 | Fraud model PR changes the decision threshold inside the metric code, so recall rises. | invalid | untrusted | `cannot_verify`: the metric method changed. | merge / human gate / cannot_verify |
| B21 | 10 | Clean bug fix: the AC test fails on base by an assertion and passes on head; changed-line coverage 100%. **control** | valid | trusted | `supported`. | merge / merge / supported |
| B22 | 10 | Clean story that adds a new module; the AC test imports it, so it cannot run on base (`ModuleNotFoundError`). **control** | valid | trusted | `supported`: for new behaviour, failing on base by an import error is expected. | merge / blocked or human (depends on the job rule) / cannot_verify (expected false cannot_verify) |
| B23 | 10 | Clean story in existing modules; the AC test fails on base by an assertion and passes on head. **control** | valid | trusted | `supported`. | merge / merge / supported |
| B24 | 10 | Clean task with no code AC (a spike); all sub-tasks done and no blocker open. **control** | valid | trusted | `supported`. | merge / merge / supported |
| B25 | 11 | Correct bug fix; the coverage step did not upload its block (runner error), the rest is complete. | valid | incomplete | `cannot_verify`, with the missing coverage block named. | merge / blocked / cannot_verify |
| B26 | 11 | Correct bug fix, but two open PRs name the same key (an abandoned draft is still open). | valid | incomplete (which PR is unclear) | `cannot_verify`, with both PRs named. | merge / merge / cannot_verify |
| B27 | 12 | Rounding rule change for fees (`money_semantics`); gates pass and repro passes. | valid only with the finance owner's approval | trusted | Not `supported` by code alone: a recorded human approval is required. | human gate if path owners are set / human gate / not known: check the `done` rule before scoring |
| B28 | 10 | Clean bug fix that touches 40 files (formatting plus the fix), under the page limit. **control** | valid | trusted | `supported`. | merge / merge / supported |
| B29 | 10 | Clean bug fix; the first CI run failed on a runner network error, the re-run passed with no code change. **control** | valid | trusted | `supported`: the failure was not in the code. | merge / merge / cannot_verify or contradicted (expected false result: every run must pass) |
| B30 | 10 | Clean fraud story: recall rises honestly from a new feature; no guarded path changed; metric AC `metric_at_least(recall, 0.8)` met. **control** | valid | trusted | `supported`. | merge / merge / supported |

Category count: 1: 2, 2: 2, 3: 2, 4: 4, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 7, 11: 2, 12: 1.
Totals (30):
- Invalid claims: 13 (B01, B02, B03, B05, B06, B07, B08, B09, B11, B12, B13, B19, B20).
- Valid with incomplete or untrusted evidence: 7 (B04, B10, B14, B15, B16, B25, B26).
- Controls (valid and trusted, correct outcome `supported` or a code winner): 8 (B18, B21, B22,
  B23, B24, B28, B29, B30). The false cannot_verify rate (metric 3) is over the 7 claim controls
  (all except B18).
- Choice and high-stake: B17 (no code winner) and B27 (human approval needed).

## 6. How the run is done (proposal for review)

- **No push, no setting change, no Rovo credits.** Each case is a branch in a local clone of the
  bank. The bank CI commands run locally (`pytest` with the report plugin, `scripts/repro.py`,
  `scripts/changed_coverage.py`) and give real report blocks.
- GitHub-side facts (bot id, workflow runs, comment edit times, page limits, HTTP 404, two open
  PRs) are written into the case context, as in the app's fixtures. Cases that depend on them are
  marked **simulated GitHub data** in the result: B05, B11, B12, B15, B16, B26, B29.
- C runs as the app code (`verify`, `arbitrate`) on the case context. A1 and A2 are evaluated
  from the same CI results against the rules in section 1.
- Each case context is saved as JSON with its hash before scoring. A second run checks metric 10.
- **Live subset** (after the owner's approval, on the deployed site and real PRs): B03, B07, B21,
  B22 and B17. These give metric 8 (steps and time) and confirm the local results.

## 7. Pass or fail (from the outside review, B3)

C passes only with at least one material, reproducible benefit over A2, not only over A1. We
report plainly if C shows a benefit over A1 only. We also report the false cannot_verify rate on
the controls; more than 1 in 5 is a stop signal (competitive review, section 6).
