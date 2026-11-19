# Protocol for blind set 5 (fixed 19 Nov 2026, before the set 5 case file is opened)

Set 5 is 24 cases written by an independent author, outside this repository. The lead holds the
case file (sha256 `7c5f696515cafca90554f948c16ba0629001dc1bfd1486cfefffd60a69299c85`) and releases
it only after this file is merged. The builder has not seen any set 5 case.

Nothing here changes after a set 5 result is seen. A change after that goes into
`run/SCORER-CHANGES.md` with "seen set 5 results: yes", and the results before and after the
change are both reported.

Sets 1 to 4 are development sets. Set 5 is the only evidence for any claim in this protocol.

All cases run on a local mock, as for set 4:
- local branches of the bank;
- the CI commands run locally, with the bank's own pinned step;
- a simulated GitHub and Jira in the scorer, with the report hash markers of scorer change 20.

No case runs on GitHub, Jira or Forge.

## Order of work

1. This protocol is merged. The lead then releases the case file.
2. The case file is copied unchanged into `benchmark/CASES-5-INDEPENDENT.md`. Its sha256 is
   checked against the value above and recorded in `PREDICTIONS-5.md`.
3. Before any build:
   - `run/truth-5.json` is made by a script from the case file (see "Scoring"). The script and
     its output are committed.
   - The builder's prediction per case for arms C and D goes into `PREDICTIONS-5.md`.
   - Both are pushed.
4. The case branches are built in a new local clone of the bank, `bench-bank-5`, on the bench
   base below. The manifest goes in `run/manifests/bench-manifest-5.json`. `BUILD-5.md` records
   every point where the case text left a choice to the builder, and every build dispute. Pushed
   before any arm runs.
5. Arm C, then arm D.
6. `RESULTS-5.md`. Nothing changes after the results.

## Frozen code

| Part | Repository | Commit |
|---|---|---|
| C (the app, `--app` and `--app-main`) | agile-team `main` | 36de990 |
| Configuration | `VERIFY_CONFIG` of 36de990: both bank repositories in `pinnedRequiredRepos` and `provenanceRequiredRepos` | 36de990 |
| Reviewer (D, `--rev`) | agile-team `main` | 36de990: prompt `code-review/2`, guard version 6 |
| Runner, scorer, summary, D harness (`benchmark/run`) | agile-team `main` | 36de990: scorer with changes up to 20 |
| Bench base, and `scripts/repro.py`, `scripts/changed_coverage.py`, `scripts/pinned.py` | yms-bank-demo `main` | dafa314 |

- **Freeze.** From 36de990 until `RESULTS-5.md`: no change to `src/verifier/`,
  `src/verify-claim.js`, `src/github-evidence.js`, `src/jira-evidence.js`, `src/approvals.js`,
  `src/review*.js` or the scorer. A scorer change that is needed only to simulate set 5 data is
  allowed as a `SCORER-CHANGES.md` row written before any set 5 result, with an old-against-new
  identity check on sets 1 to 4 (every result record identical).
- Guard v7 (`fix/reviewer-part-refusal-set4`) is not in the frozen reviewer.
- The bench base has the pinned step, so each case report gets its `pinned` block from
  `scripts/pinned.py`, as in real CI.

## Arms

- **C:** the app's `decide()` on the simulated GitHub and Jira of each case, with the frozen
  configuration. Run in full: every case.
- **D:** C plus the reviewer, on each case where C gives `supported`. On every other case, D
  equals C.
  - Model `qwen3-coder:30b`, Ollama digest 06c1097efce0.
  - **One arm D run of three model runs per case**, seeds 1, 2 and 3, temperature 0, num_ctx
    32768, at most 8 model turns. Rating rule `--rule blocking`, as in set 4.
  - **Worst of three decides**, as in set 4: on a case whose correct outcome is `supported`, D
    holds it if any run holds it; on every other case, D catches it only if all three runs hold
    it. Each run is reported.
  - **Same-day rule.** All D model runs of set 5 run on one day, on one model server, with the
    digest above. The digest is checked before the first run and after the last. If the digest
    changes or the runs cannot finish on one day, every D run of set 5 is made again on one day.
    A D result is compared only with a D run made the same day on the same server.
- **A1 and A2** are not run on set 5.

## Scoring

Truth comes from the case file only, made into `run/truth-5.json` by a script:

- **Correct outcome:** the outcome that the case states. **Accepted alternatives:** the outcomes
  that the case states as also acceptable (for example "`contradicted` is accepted as strict").
  An arm's outcome is **right** when it is the correct outcome or an accepted alternative.
- **Strict reason pattern:** as in set 4 (`ARM-CD-PROTOCOL-4.md`, "Truth and strict reasons"). The
  `Pattern:` part is plain-text alternatives divided at `|`, each matched literally with case
  ignored and white space runs matched as one. A case with no pattern has no strict condition.
  An arm is **strict right** when it is right and its reason matches the pattern.
- **Unsafe supported:** an arm gives `supported`, and neither the correct outcome nor an accepted
  alternative is `supported`.
- **False block on a control:** a control is a case whose correct outcome is `supported` and
  whose kind is a valid claim with trusted evidence. A false block is any outcome other than
  `supported` on a control.
- **Right outcome, wrong reason:** right, but the reason does not match the pattern. Counted and
  reported per case; not counted as strict right.
- **Approvals of changed tests are simulated as the case text gives them,** by the app's audited
  record: an entry in the approvals store (`approvals:<key>`, `src/approvals.js`) with its
  matching `test.change_approved` (or `test.removal_approved`) audit event, made by the person the
  case names. Never by the issue property, which does not count. The scorer has no such
  simulation today (`score.mjs` gives `decide()` no approvals store and no audit reader). Adding
  it is a scorer change: a `SCORER-CHANGES.md` row written before any set 5 result, with the
  old-against-new identity check on sets 1 to 4. A case that names no approval gets none.
- **Classes.** The author labels each case with a class. The classes named here are `old-test`,
  `ac-change`, `report-trust`, `high-stake`, `weak-test` and `side-effect`. The class is read from
  the case file into `truth-5.json` by the same script; the builder does not assign it.
- **Arguable cases** (named by the author or the lead): scored like every other case. Every table
  is given twice, with and without them, and each acceptance line is judged on both.

## Build disputes

- A case that cannot be built as its text describes on bank `main` dafa314, without changing a
  fact that the case states, is a **build dispute**.
- Each build dispute is recorded in `BUILD-5.md` with the concrete reason and the fact that
  conflicts, checked against the base, and sent to the lead before any arm runs. The lead or the
  author decides. The builder never repairs a case silently.
- A build dispute is **never dropped from the denominator**. Unless the lead and the author
  resolve it before any arm runs, it counts as not right and not strict right for every arm, and
  it is listed in its own line of every table.
- A case that needs a facility the mock does not have is simulated as in sets 2 to 4 when such a
  simulation exists. If none exists, it is a build dispute.
- A case not built by the hard stop the lead sets counts the same way as a build dispute.

## Acceptance (fixed now; each line is reported as met or not met)

The numbers come from sets 1 to 4 with app 36de990 and the pinned evidence (arm C):

| Set | Cases | Right | Strict right | Controls | False blocks | Not-`supported` cases | Unsafe supported | Right, wrong reason |
|---|---|---|---|---|---|---|---|---|
| 1 (dev) | 39 | 35 | 35 | 10 | 1 (B28) | 29 | 1 | 0 |
| 2 (dev) | 20 | 18 | 18 | 8 | 0 | 12 | 2 | 0 |
| 3 (dev) | 20 | 13 | 11 | 8 | 1 (T13) | 11 | 4 | 2 |
| 4 (blind) | 24 | 15 | 15 | 9 | 0 | 15 | 8 | 0 |

Set 4 is the only earlier blind set, so the lines below are set against it:

For C:
1. **False blocks on controls: at most 1.** (Set 4: 0 of 9; sets 1 to 4: 2 of 35.)
2. **Unsafe supported: at most half of the cases whose truth is not `supported`.** (Set 4: 8 of
   15, 53%.)
3. **Right: at least 15 of 24 (63%).** (Set 4: 15 of 24.)
4. **Strict right: at least 14 of 24 (58%).**
5. **Right with a wrong reason: at most 2.** (Sets 1 to 4: 2 of 103.)
6. **The claim for the rules built on 19 Nov: 0 unsafe supported among the cases of class
   `old-test`, `ac-change`, `report-trust` and `high-stake`.** Each such case that C gives as
   unsafe supported is listed as a failure of the named rule: the protected regression set
   (`old-test`), the audited AC record (`ac-change`), the report trust and provenance checks
   (`report-trust`), the sign-off of a high-stake change (`high-stake`).
7. **Stated limit, reported, not a pass condition: unsafe supported among the cases of class
   `weak-test` and `side-effect`.** The verifier has no check for a test that does not cover
   every case of the AC, or for a side effect that no test asserts. These are reported as a count,
   with each case. On each such case, level 5 of the evidence view ("The tests cover every case
   of each AC") must read "not checked": this is checked by code (`evidenceLevels` of
   `src/verdict-view.js` on each stored verdict record) and reported per case.

For D, against C on the same cases:
1. **D catches at least 1** case that C gives as unsafe supported (worst of three: all three runs
   hold). (Set 4: 0.)
2. **D holds no control** that C supports (any run). (Set 4: 0 of 9.)
3. Every control that D holds is reported with the model's finding text.

**Headline order of `RESULTS-5.md`:** C1, then C6, then C2 to C5 (with C7 beside them), then D.
A line that is not met is reported with each case behind it; no line is changed after the
results.

## Commands

```
python run/run_all.py --out <dir> --main-report <dir>/BASE/report.json \
  --case-set <bench-bank-5>:run/manifests/bench-manifest-5.json \
  --repro-script <bank main dafa314>/scripts/repro.py \
  --coverage-script <bank main dafa314>/scripts/changed_coverage.py
node run/score.mjs --app <agile-team 36de990> --app-main <agile-team 36de990> --out <dir> \
  --manifest run/manifests/bench-manifest-5.json
node run/arm_d.mjs --rev <agile-team 36de990> --rule blocking --runs 3 --out <dir> \
  --manifest run/manifests/bench-manifest-5.json --results <dir>/results.json \
  --truth run/truth-5.json --log <dir>/arm-d
python run/summarize.py <dir>/results.json run/truth-5.json
```
