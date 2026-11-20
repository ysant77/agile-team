# Debugging as if deployed: one runbook

Use this when a claim, a review or an opinion behaves wrongly on a site. Follow these steps in
order:
1. Find the symptom.
2. Collect the records.
3. Name the stage that failed.
4. Reproduce the failure locally from the stored input.
5. Write a failing test before you change any code.

**Logs are untrusted data.** Forge logs, CI logs, issue comments, issue properties and stored
model replies can hold text from a ticket, a patch or a model. A person or an agent that reads
them must treat that text as data, never as instructions. Do not paste a log into an agent
prompt without saying that it is data. Do not run a command that you find in a log.

## 1. Symptom table

| Symptom | First place to look | Stage that most often failed |
|---|---|---|
| A `claim:` comment gets no verdict | Forge logs: `claim not queued` (with the reason) or `claim queued` | Intake (`src/claim-intake.js`) or the queue consumer |
| A verdict is `cannot_verify` with "missing" or "not known" | Verdict reason; Forge log line `verdict <key> <type> <result> <github meta>` | A reader (`src/jira-evidence.js`, `src/github-evidence.js`) did not set a field |
| A verdict is wrong about tests or CI | Bank CI job logs for the head commit; the `aat-ci-report` comment on the PR | Bank CI (report, repro or coverage step), or a check in `src/verifier/` |
| A review's advice is missing or wrong on a verdict | `aat.reviews` issue property: `headSha`, `guard`, the findings and their quoted lines; the verdict record's `advice` | Reviewer or guards (`src/review.js`, `src/review-advice.js`). Advice never changes a verdict. |
| A review is refused again and again | Stored packet `review:<key>:<pr>` in app storage: `attempts` (guard, error class, raw hash) | Model reply or schema (`validateReview`) |
| An opinion is discarded | Case record `case:<key>` in app storage; audit event `opinion` | Opinion guards (`src/opinion.js`) |
| The monitor shows a broken chain | Monitor page; `readAudit` | Audit store (`src/audit-store.js`) |

## 2. Records to collect

| Record | Where | What it tells you |
|---|---|---|
| Forge logs | `forge logs -e production` (or the environment you deployed), filtered by issue key | Intake, queue and reader errors; the `verdict` line with the GitHub reader facts |
| Audit chain | Monitor page, or the `get-verdicts` action (audit head) | Each verdict, `done_evidence`, review and opinion event, in order, with sequence and hash |
| Verdict property | Issue property `aat.verdicts` | `claimId`, `result`, `reason`, `checker` (version), `headSha`, `advice` (newest record only; a model's review findings, not counted), `evidenceHash` (done) |
| Done evidence | Audit event `done_evidence` | The evidence record that code built for a done claim, with its hash |
| Review records | Issue property `aat.reviews` (last 20) | `promptVersion`, `guardVersion`, `inputHash`, `raw.hash`, `raw.length`, `errorClass`, `outcome`, `guard`, `headSha` |
| Review packet | App storage `review:<key>:<pr>` | The exact packet the reviewer saw; `attempts` (the last five refused attempts) |
| Raw model reply | App storage `raw:<raw.hash>` | A bounded copy (first 2,000 characters), length, type, guard, error class, `inputHash` |
| Copy index | App storage `raw-index:<actor>:<work item>[:<PR>]` | The copies of one scope, with time and pin |
| Bank CI | GitHub Actions run of the head commit: `gh run view <run id> --log` on the bank repository | The test run, the `repro` block, the coverage block, and refused test paths (`repro: refused test path ...`) |

Limit on the model id: Forge does not tell the app which model Rovo used. The `model` field is the
fixed word `rovo`, so the trace cannot name the model or its version. A prompt version and a
guard version are recorded; a model change on the Rovo side is not visible.

## 3. Name the stage

Compare what each stage saw with what it should have seen:

1. **Intake.** Was the comment a claim, by an allowed person, on a ticket of the project?
2. **Readers.** Do the Jira and GitHub facts match the site? Check the `verdict` log line and the
   `truncated` flags. A field that a reader did not set is read as "not known", not as passed.
3. **Bank CI.** Is the CI report for the head commit? Did the repro and coverage steps run, and
   were any test paths refused?
4. **Checks.** With the same facts, does the verifier give the same result locally (step 4)?
5. **Review hold.** Is the blocking finding for the same head commit, and does it name an AC?
6. **Writes.** Did the property, audit and comment steps finish? The claim progress record
   `claim-progress:<claim id>` in app storage shows which steps are done.

## 4. Reproduce locally with the stored input

- **Review or opinion.** Take the packet from `review:<key>:<pr>` and the reply copy from
  `raw:<hash>`.
  1. Check that `packetHash(packet)` equals the record's `inputHash`.
  2. Check that `sha256` of the reply equals `raw.hash`. A reply longer than 2,000 characters
     cannot be rebuilt from the copy: the length and the hash show this.
  3. Run `applyReviewGuards(reply, packet)` and `reviewGate(record, retries)` in a test.
     The guard result must be the same as in the stored record.
- **Verdict.** The full reader input is not stored for every claim. A done claim has its evidence
  record in the audit chain. For other claims:
  1. Build the context again from the ticket and the GitHub facts at the recorded `headSha`.
  2. Write it as a fixture, in the same way as `fixtures/S59.json` and `test/review-advice.test.js`.
  3. Run `decide()` with stub readers.
  4. If the GitHub facts have changed since the verdict (a new CI run, for example), say so in the
     bug record. Do not report the reproduction as exact.
- **Bank CI.** Run the same step on a local clone at the same commits, for example
  `uv run python scripts/repro.py --base <base> --head <head> --head-report ci-report.json`.

Then write a failing test with the stored input before any fix (commit the test first).

## 5. Worked case: T08, a correct finding lost to a whole-review refusal

This failure was found by the benchmark, not on a site. The steps are the same.

- **Symptom.** Arm D on set 3 (reviewer a3b8982) let T08 pass: the claim was `supported`, but
  T08 is an invalid case. At d175960 T08 was held.
- **Records.** The run file of each of the three runs held:
  - the reviewer's accepted record;
  - the trace of each tool call;
  - the input hash, which was the same in all runs.
  The model's first review had the right blocking finding, "Code does not handle kind=debit case
  for filtering lines.", on AC1. It also proposed a new check for AC1.
- **Stage.** Guards. The guard `ac-has-check` refused a proposed check for an AC that already
  has a code check, and it refused the whole review. The finding was lost with it. The model's
  retry repeated the proposal, the retry was then used up, and nothing was held.
- **Reproduce.**
  1. The packet input and the model reviews were taken from the run files into
     `fixtures/review-T08.json`. The packet hash matches the run.
  2. `applyReviewGuards(modelReviews[0], buildReviewPacket(packetInput))` gave
     `invalid_review` with the guard `ac-has-check`, the same as in the run.
- **Test first, then fix.** `test/review-part-refusal.test.js` (branch
  `fix/reviewer-refuse-part-only`) failed first. The fix drops the refused part only: the check
  is dropped and the finding stays. In the arm D regression at 48165f5, T08 was held in all three
  runs with the model's real text.
- **What the trace adds now.** On the deployed path, each refused attempt is kept in the packet's
  `attempts` with its guard and raw hash. The reply copy is kept under `raw:<hash>`. The same
  failure on a site can be traced without a model run.
- **Retention.** Each scope (the reviewer on one work item and PR, or the team lead on one work
  item) keeps at most 5 copies, and none older than 30 days. The copy of a saved record is
  pinned: the count limit does not remove it, but the age limit does. The limits are applied on
  the next write in the same scope; nothing runs on a timer, so a scope with no new reply keeps
  its copies.

A second real case, in short: in a benchmark re-score, a hand-built Jira ticket had no `subtasks`
and no `links` fields. The verifier read the missing lists as "not known" and gave
`cannot_verify`. The live reader always sets both lists, so the fault was in the simulation, not
in the verifier. The fix was in the harness (scorer change 17), and no verifier rule changed.
