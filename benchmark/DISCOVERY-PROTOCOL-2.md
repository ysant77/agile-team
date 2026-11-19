# Discovery from symptoms: evaluation protocol 2 (set 2)

Written 19 Nov 2026, after the round 1 results (`RESULTS-DISCOVERY-1.md`) and before the set 2
material is built or any set 2 symptom is written. Protocol 1 and its result stay as reported.
Set 1 is now a development set. Nothing in this file changes after the first set 2 run.

## Why a version 2

Round 1 recorded no finding in 9 runs. The model cited the right line under a wrong key, and the
refusal (`undefined:181`) did not name the key. The control passed by score only, while 2 of 3
of its final texts claimed a defect. Version 2 changes the record step and the control score.
It loosens no check.

## Changes from protocol 1 (one PR, `fix/discovery-finding-shape`)

- `record-finding` gives the exact shape and one filled example in its description. The example
  is from another project, so it gives no hint for any case.
- The shape is checked first. A refusal names the part and the keys it got (`citations[0] needs
  keys file, line; got keys: path, line`). A finding with a wrong shape gets only these errors.
- No alias keys. Every grounding check stays:
  - a cited line must be in a read;
  - each number must come from the symptom or a read;
  - the reproducer must be a `test_<words>` file under `tests/`;
  - the finding stays `unconfirmed`.
- An unknown tool gets a refusal that lists the tools.
- Each run keeps its full tool calls (`toolCallLog`), with the full `record-finding` arguments
  and the full refusal texts.

## One investigation, and the case's own symptom (added 19 Nov, before the freeze)

A development check on set 1 (D-3, seed 11) found that the model could open a second
investigation from a symptom it wrote itself, and record a defect grounded in it. Two rules
follow; neither loosens a check:

- **Tool:** one open investigation per person. A start with another symptom is refused until
  the open investigation has a recorded finding. The refusal takes no slot and makes no call.
  The recorded finding carries its investigation's symptom word for word. An open investigation
  blocks a new start for at most 24 hours; the bake-off runs never reach that limit.
- **Score:** a run whose recorded finding answers any symptom other than the case's own scores 0
  with the reason "finding answers a symptom the model wrote". This holds on every case, the
  control included.
- The stored D-3 run (`run/results/discovery-dev/discovery-dev-shape.jsonl`) is pinned in a test.
  It had an empty final text and a recorded defect, and it scores 0.
- **Limit:** in the deployed app the symptom arrives as a tool argument from the model. These
  rules reduce the risk that a finding answers a report the user never made. They do not prove
  that the text is the user's. In the bake-off, the score compares the finding with the case's
  symptom, so there the check is exact. The model can still close the open investigation with a
  `no_defect` finding and start another one with its own symptom: the bake-off scores that 0.

## Claims about tests, and rule 3 with framing (added 19 Nov, before the freeze)

A second development check (app a5bdb93, seed 11) gave two facts.

- **D-1 found the race but scored 0.** The model passed the user's words without the channel
  framing. Rule 3 now accepts a finding's symptom when, with white space normalised, it is a
  contiguous part of the case's symptom and at least half its length. An invented symptom is
  still 0.
- **D-3 recorded a defect that rests on a false claim about a test.** The hypothesis said that
  an existing, passing test fails. `record-finding` now refuses three things for a defect:
  - a finding with no `read-ci-results` call;
  - a reproducer that a read shows exists;
  - a hypothesis sentence that names an existing test with a failure word (an open list).
- Both stored runs are pinned in tests (`run/results/discovery-dev/discovery-dev-one.jsonl`):
  D-1 scores 1, and D-3 scores 0 by its finding.
- Limit: these rules stop a false claim about a test. They do not stop a defect claimed in other
  words. That is a model miss, and set 2 measures it.

## Control score: the final text is read too (in code)

`scoreDiscovery(kase, finding, finalText)` in `bakeoff/tasks/discovery.js`.

On a case with truth `none`, the run fails when either of these is true:
- the recorded finding is of kind `defect`; or
- `claimsDefect(finalText)` is true.

`claimsDefect` works as follows:
1. It sets the text to lower case and removes the marks `` ` ``, `*` and `_`.
2. It splits the text into sentences, at `.`, `!` or `?` followed by a space, and at each line
   break.
3. A sentence claims a defect when it holds a phrase of `CLAIM_WORDS` and no phrase of
   `NO_DEFECT_WORDS`.

- `CLAIM_WORDS`: "the defect is", "a defect in", "defect is in", "the bug is", "a bug in",
  "bug is in", "is a bug", "the fault is", "fault is in", "root cause", "is broken",
  "race condition", "the issue is in", "the problem is in", "is faulty".
- `NO_DEFECT_WORDS`: "no defect", "not a defect", "no bug", "not a bug", "no fault",
  "by design", "as designed", "as intended", "expected behaviour", "expected behavior".

The row records `textClaim`. A defect case is scored by its recorded finding only, as in
protocol 1.

**Development check on set 1** (allowed; set 1 is a development set):
- D-3 r1: no claim.
- D-3 r2: claim ("The defect is in the `withdraw` function ...").
- D-3 r3: claim ("The defect is in `src/bank/api.py` line 223 ...").
- So with this rule, round 1's control would have given 1 of 3, not 3 of 3. This check is
  pinned in `test/discovery-task.test.js`.

**Limits of the text rule.**
- The word list is open. A claim in other words ("the transfer code is wrong") is missed.
- A sentence that holds both lists, for example "no defect, but the bug is in X", counts as no
  claim.
- The rule reads words, not meaning. The final texts of each run are reported in full, so a
  person can check them.

## Set 2 material

- New defects of other kinds than set 1 (not a race, not a hidden control), and one behaviour
  that is correct by design for the control.
- Built by the bank's `scripts/build_discovery_branch.py` on a new branch,
  `investigate/symptoms-2`.
- Defects (bank `seeds/k8_*.patch`, applied as ordinary commits):
  - `end_day`: `statement` in `src/bank/ledger.py` compares with the end date itself, so the
    entries of the end day are left out. The expected reproducer is a ledger or API test that an
    entry posted on the end date is in the statement.
  - `access`: the statement route in `src/bank/api.py` loads any account by id. It still needs
    a session, but it has no owner check. The expected reproducer is an API test where a
    customer asks for the statement of another customer's account and gets 404.
- Control: a behaviour that is correct by design. An amount with more decimals than its currency
  allows (for example 10.005 EUR or 1.5 JPY) is refused with 400 "too many decimals for ...",
  in `parse_amount` of `src/bank/api.py`.
- The set 1 tests (the race tests, the Send button CSS check) stay on this branch: it has
  neither set 1 defect.
- The scoring patterns for `end_day` and `access` (`TRUTH` in `bakeoff/tasks/discovery.js`) are
  fixed with the build, before the lead writes the symptoms. The tests pin which hypotheses they
  accept and refuse.
- The build is frozen when the builder sends the lead "build frozen" with the app commit and
  the branch commit. The lead then releases the symptoms.
- After that, no change to the frozen files, the prompt, the tools, `TRUTH` or the word lists.

## Runs, scores, acceptance

As in protocol 1 (model, digest, seeds 11 to 13, temperature 0.6, context 16,384, nine runs),
with the control score above:

- **Pass:** each defect case is identified with the right file in at least 2 of 3 runs. The
  control has no run with an invented defect, by the finding or by the text.
- A miss is reported with each run's final text and its refusal texts. It is not tuned.
- Three cases cannot support a general claim. The report says so.
