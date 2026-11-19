# Prediction for the listing regression (19 Nov 2026, written before the run)

**Run to be made.** Scorer with change 20 (`benchmark/run/SCORER-CHANGES.md`), evidence
`benchmark/run/evidence/pinned-2026-11-18`, sets 1 to 4. Compare:
- app `main` 31542d4 (nothing listed);
- the same app with `ysant77/yms-bank-demo` (the scorer's repository) listed in both
  `pinnedRequiredRepos` and `provenanceRequiredRepos`. This is a local configuration change,
  not pushed.

**Prediction, from the case flags (not from a run with the lists):**

| Case | Flag | Now | Predicted |
|---|---|---|---|
| B11, T07 | report for an older commit (`staleHead`) | cannot_verify | cannot_verify; the reason also says no pinned run on the PR head has a matching marker |
| B12 | report edited by a user after the run | cannot_verify | cannot_verify; the reason also says the comment does not match the marker |
| B16 | the runs list returns 404 | cannot_verify | cannot_verify; the reason also says no pinned run was read |
| S20 | report from the Nightly workflow; the `ci.yml` run was cancelled | cannot_verify | cannot_verify; the reason also says no marker |
| Every other case, every control | - | as now | no outcome change and no reason change |

- The pinned listing changes nothing: every report in this evidence has a `pinned` block (the
  18 Nov regression).
- **Stop rule:** if any control changes, stop and report. Do not tune.
- **Acceptance:** no outcome change and no control change. Every reason change is listed, and
  each one is either in the table above or reported as a miss of this prediction.
