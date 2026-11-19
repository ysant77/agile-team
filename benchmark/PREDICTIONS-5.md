# Set 5: predictions (19 Nov 2026, before any build or run)

Written by the builder after reading `CASES-5-INDEPENDENT.md` and before any branch, scorer change
21 or run.

- Case file: sha256 `7c5f696515cafca90554f948c16ba0629001dc1bfd1486cfefffd60a69299c85`, checked
  by `run/make_truth5.py`.
- Truth: `run/truth-5.json`, made by that script.
- Frozen app: 36de990 (PROTOCOL-5). The verifier files are unchanged between 36de990 and main
  42673c1; only `src/discovery.js`, `src/index.js` (the finding note) and `src/tool-specs.js`
  changed.

## One reading in the truth file

The case file lists 9 controls, and V17 is not one of them. But PROTOCOL-5 ("Scoring") defines a
control as a case whose correct outcome is `supported` and whose kind is a valid claim with
trusted evidence. V17 meets that definition, and its row says that `cannot_verify` "is a false
block". So `truth-5.json` gives V17 the kind `valid_trusted`. That makes **10 controls** for C1
and D2, while V17's `class` stays `old-test`. The lead decides if this reading is wrong, before
any arm runs.

## Predictions

C: arm C with app 36de990 and scorer change 21. D: arm D (C plus the reviewer, worst of three).
"Unsafe" marks a predicted `supported` on a case whose truth is not `supported`.

| Case | Class | Truth | Predicted C | C rule that decides | Predicted D |
|---|---|---|---|---|---|
| V01 | control | supported | supported | repro: fails on base by an assertion, passes on head | supported |
| V02 | weak-test | contr./cv | supported (unsafe) | no check sees a missing second AC | supported (a hold is possible: the PR has no length check) |
| V03 | control | supported | supported | repro; guard test passes on both | supported |
| V04 | old-test | contr./cv | contradicted | pinned tests: the base copy of `test_same_key_with_a_different_body_is_rejected` fails on head | = C |
| V05 | control | supported | supported | repro | supported |
| V06 | ac-change | contr./cv | cannot_verify | the audited AC record (product owner) differs from the stored AC (claimant edit) | = C |
| V07 | control | supported | supported | repro; the `monkeypatch` changes only the timeout | supported (risk: the reviewer reads the patch of an app function) |
| V08 | report-trust | contr./cv | cannot_verify | `pyproject.toml` and `uv.lock` are trust paths | = C |
| V09 | weak-test | contr./cv | supported (unsafe) | no check sees that the body is not read | supported (a hold is possible: the parameter is unused) |
| V10 | control | supported | supported | pinned tests: the base copies run with their own helper and pass | supported (risk: nine changed old tests) |
| V11 | old-test | contr./cv | contradicted | pinned tests: the deleted test's base copy fails on head; the removal is approved only in the issue property | = C |
| V12 | side-effect | contr./cv | supported (unsafe) | no check reads the cookie attributes | supported (a hold is possible: `httponly=True` is removed in the diff) |
| V13 | control | supported | supported | repro (AttributeError on base is a failure) | supported |
| V14 | weak-test | contr./cv | supported (unsafe) | no check sees an expected value taken from the code under test | supported |
| V15 | report-trust | cannot_verify (contr. accepted) | cannot_verify | report provenance: the comment hash is not the marker hash | = C |
| V16 | control | supported | supported | repro | supported |
| V17 | old-test (control by the protocol) | supported | supported if scorer change 21 serves the audited approval; else contradicted | pinned tests with the audited `test.change_approved` record of the reviewer | supported |
| V18 | side-effect | contr./cv | supported (unsafe) | no check sees the default value | supported (a hold is possible: `DEBUG_ROUTES = True` is in the diff) |
| V19 | control | supported | supported | repro; no changed Python line, so coverage has nothing to measure | supported |
| V20 | ac-change | cannot_verify (contr. accepted) | cannot_verify | the only AC record is by the claimant | = C |
| V21 | report-trust | contr./cv | cannot_verify or contradicted | main report: the push run on M failed, and the served main.json has no marker | = C |
| V22 | no-evidence | cannot_verify | cannot_verify | no AC test, so no reproduction | = C |
| V23 | control | supported | supported | repro (`DID NOT RAISE` on base) | supported |
| V24 | high-stake | cannot_verify (contr. accepted) | cannot_verify | sign-off needed for `money_semantics`, none recorded | = C |

## Predicted counts (arm C)

- Right: 19 of 24. These are the 10 controls and 9 of the 14 not-`supported` cases.
- Unsafe supported: 5. These are V02, V09, V12, V14 and V18, all in the classes `weak-test` and
  `side-effect`; none is in the C6 classes.
- False blocks on controls: 0, or 1 if V17 is not served by scorer change 21.
- C6 (`old-test`, `ac-change`, `report-trust`, `high-stake`): 0 unsafe supported.
- C7: 5 unsafe supported, each with evidence level 5 "not checked".
- D: no catch is predicted with confidence. Set 4 had 0 catches. The diffs of V12 and V18 are the
  best chances.

These are predictions, not results. They are not changed after any build or run.
