# Development check of the set 7 facts (24 Nov 2026)

Kind: development replay. Not blind and not a benchmark set; no claim rests on it. It checks that
each field of scorer change 22 reaches the app as intended.

- Cases: `run/manifests/dev-manifest-7.json`, made by `run/make_dev_manifest7.mjs`. Each case is
  the set 6 control W03 on its stored evidence (`run/evidence/set6-2026-11-23`) with one fact
  added. The expected outcomes were committed (ee37427) before the first run.
- Run: the scorer of this branch, app `main` 665e93e, on a copy of the set 6 evidence.
  Records: `run/evidence/dev7-2026-11-24/results.json`.

| Case | Fact | Expected | Outcome | Reason (start) |
|---|---|---|---|---|
| DEV7-01 | money rule, sign-off of the merge commit by the product owner | supported | supported | all checks passed |
| DEV7-02 | money rule, no sign-off | cannot_verify | cannot_verify | a person's sign-off of the merged change is required, and none is recorded |
| DEV7-03 | money rule, sign-off by the claimant | cannot_verify | cannot_verify | the claimant signed off their own claim |
| DEV7-04 | money rule, sign-off of another commit | cannot_verify | cannot_verify | the sign-off is for bbbbbbb, not the merged commit |
| DEV7-05 | PR title without the key, PR linked by the product owner | supported | supported | all checks passed |
| DEV7-06 | PR title without the key, no link | cannot_verify | **contradicted** | no pull request for DEV-706, so nothing is on main |
| DEV7-07 | PR title without the key, link by the claimant only | cannot_verify | **contradicted** | no pull request for DEV-707, so nothing is on main |
| DEV7-08 | GitHub 403, no calls left | not_checked | not_checked | GitHub rate limit reached (HTTP 403, 0 calls left this hour) |
| DEV7-09 | GitHub 403, secondary limit, wait 60 s | not_checked | not_checked | GitHub secondary rate limit, too many calls at once |
| DEV7-10 | merge commit is not the CI commit; main.json not for it | cannot_verify | cannot_verify | merge result: report is for an older commit, not the head |
| DEV7-11 | push run on the merge commit in progress | cannot_verify | cannot_verify | merge result: report is for an older commit, not the head |

9 of 11 as expected.

**The two differences (DEV7-06, DEV7-07).** The expectation was wrong, not the scorer: for a
`done` claim the app reads "no pull request found" as "nothing is on main", which is
`contradicted` (`on_main`). A link by the claimant does not count, so DEV7-07 is the same as
having no link, as intended. Whether "no PR found" should be `contradicted` or `cannot_verify` is
a rule question for the owner, not changed here.

**Limits.** One base case (W03), so this shows the plumbing, not accuracy. The merge-result branch
form of `github.mergeCommit` (main.json is the report of a separate merge build) is not exercised:
it needs a new bank build. The DEV7-09 reason holds a retry time taken from the clock, so its text
changes between runs; its outcome does not. Cases DEV7-10 and DEV7-11 give the same reason, so the
verdict does not tell a running push run from a missing report.
