# Arm D on independent set 2 (16 Nov 2026)

Protocol: `ARM-D-PROTOCOL.md`, committed in c27b3a4 before the first run. Nothing was changed
after the runs. Model `qwen3-coder:30b` (digest 06c1097efce0), temperature 0, seeds 1, 2 and 3,
reviewer prompt `code-review/1`, reviewer code `feat/code-reviewer-agent` 20f8e30. Raw output and
the model turns of each run: `run/results/arm-d-2/`. `RESULTS-2.md` is unchanged.

## Result

D ran on the 11 cases where C is `supported`. The three runs gave the same outcome on every case.

| Case | Kind | C | D run 1 | D run 2 | D run 3 | D (worst run) | Right? |
|---|---|---|---|---|---|---|---|
| S01 | control | supported | cannot_verify | cannot_verify | cannot_verify | **cannot_verify** | no: new false cannot_verify |
| S02 | control | supported | cannot_verify | cannot_verify | cannot_verify | **cannot_verify** | no: new false cannot_verify |
| S04 | control | supported | supported (review refused: ungrounded id) | same | same | supported | yes |
| S05 | control | supported | supported (review refused: unknown AC) | same | same | supported | yes |
| S06 | control | supported | cannot_verify | cannot_verify | cannot_verify | **cannot_verify** | no: new false cannot_verify |
| S07 | control | supported | cannot_verify | cannot_verify | cannot_verify | **cannot_verify** | no: new false cannot_verify |
| S08 | control | supported | cannot_verify | cannot_verify | cannot_verify | **cannot_verify** | no: new false cannot_verify |
| S09 | invalid | supported | cannot_verify | cannot_verify | cannot_verify | cannot_verify | yes: caught in all runs |
| S13 | invalid | supported | cannot_verify | cannot_verify | cannot_verify | cannot_verify | yes: caught in all runs |
| S16 | high stake | supported | cannot_verify | cannot_verify | cannot_verify | cannot_verify | yes |
| S18 | incomplete | supported | cannot_verify | cannot_verify | cannot_verify | cannot_verify | yes |

The other 9 cases keep the C result (S03 cannot_verify; S10, S11, S12, S15, S17 contradicted;
S14, S19, S20 cannot_verify). S17 stays a false block. D does not change it.

| Metric | C | D |
|---|---|---|
| Unsafe supported (of 8) | 3 (S09, S13, S16) | 0 |
| Unearned supported | 1 (S18) | 0 |
| False cannot_verify on the 8 controls | 1 (S03) | 6 (S01, S02, S03, S06, S07, S08) |
| False block | 1 (S17) | 1 (S17) |
| Right (of 20) | 14 | 13 |
| Ends at a human | 4 | 13 |

## Against the pre-registered condition

`CASES.md` section 5: unit 6 gets build time again only if D catches defects that C misses
**and** raises no false result on the controls. D caught S09, S13, S16 and S18, but it held
5 of the 8 controls that C supported. **The condition fails.**

## Why (observation, not scored)

- The model used `findings` to quote changed lines, not to name defects. Every review that the
  guards accepted had findings, so under the rating rule every accepted review held the claim.
  The catches on S09 and S13 come from that rule, not from a found defect.
- The defect text was in `risks`, which the rating rule does not count: S09 "The change only
  applies to deposits, not withdrawals."; S13 "The test only checks one account's balance
  display." S13 also proposed a test for all currencies.
- S04 and S05 stayed supported only because the guards refused the review (an account number
  not in the packet; an AC id that the ticket does not have).
- Most reviews were refused once for a test name without the issue key, then accepted on the
  retry.

A rule that counts only defect statements would need a schema field for them (for example a
severity on each finding) and a new pre-registered run on a new blind set. It is not scored here.
