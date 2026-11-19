# Listing regression: pinned block and report provenance required (19 Nov 2026, no model)

**Question.** If the bank repository is listed in `pinnedRequiredRepos` and
`provenanceRequiredRepos`, does any verdict on sets 1 to 4 change? Prediction written and
committed before the run: `PREDICTIONS-LISTING.md` (68e6ede), now frozen by its hash.

**Run:**
- Scorer with change 20 (`run/SCORER-CHANGES.md`; identity check passed: old and new scorer give
  identical records with app `main` 31542d4).
- Evidence `run/evidence/pinned-2026-11-18`.
- A: app `main` 31542d4.
- B: the same app with `ysant77/yms-bank-demo` in both lists. This is a local configuration
  change, not pushed; the listing PR is step 6, after the owner's choice for the judge path.

## Result

| Set | Right (A → B) | Controls not supported | Unsafe `supported` | Outcome changes | Reason changes |
|---|---|---|---|---|---|
| 1 | 35 → 35 of 39 | B28 → B28 | 1 → 1 | 0 | B11, B12, B16 |
| 2 | 18 → 18 of 20 | none → none | 2 → 2 | 0 | S17, S20 |
| 3 | 13 → 13 of 20 | T13 → T13 | 4 → 4 | 0 | T07 |
| 4 | 15 → 15 of 24 | none → none | 8 → 8 | 0 | none |

**Controls first:** no control changed.

**Every reason change** (all cases were and stay `cannot_verify`):

| Case | Kind | Added to the reason | Predicted? |
|---|---|---|---|
| B11 | invalid | the PR report comment: no run of the pinned workflow on its commit | yes |
| B12 | invalid | the PR report comment: no run of the pinned workflow has a marker, at its current attempt, with the hash of the text read (the comment was edited after the run) | yes |
| B16 | valid, incomplete | the PR report comment and main.json: no run of the pinned workflow on its commit (the runs list returns 404) | yes |
| S20 | valid, incomplete | the PR report comment: no marker with the hash of the text read | yes |
| T07 | valid, incomplete | the PR report comment: no run of the pinned workflow on its commit | yes |
| S17 | valid, incomplete | the PR report comment: no marker with the hash of the text read | **no: a miss of the prediction.** S17's report is from an older commit, and the PR head is the branch tip. The only run on the PR head is the cancelled one, which uploads no marker. I read S17 only by its cancelled-run flag, not by its older-commit fact. The behaviour is right; the prediction was incomplete. |

**Every other case:** the record is identical. On every supported case the provenance check
passed, so the simulated markers match the comment and `main.json`.

**Acceptance (fixed in the prediction):** met. There is no outcome change and no control change,
and every reason change is listed. One reason change was not predicted (S17).

**Limits:**
- Sets 1 to 4 are development sets. This shows that listing does no harm on them. It does not
  show that the rules catch more.
- The markers are simulated. GitHub's side is covered by the real-run gates on bank `main`
  356cb19: PR run 44455535406 and push run 44456621300.
- The demo repository is not listed until its own real run passes the same gate.
