# Discovery from symptoms (Mode B, minimal form, 19 Nov 2026)

The PM agent gets a symptom in the user's words, not the answer. It reads the investigated branch
with read-only actions and records a finding. The finding stays `unconfirmed` until a CI report
shows that the proposed reproducer fails on base (the existing `reproduced` check). Code:
`src/discovery.js` (rules) and `src/discovery-actions.js` (Forge binding). Tests:
`test/discovery.test.js`, `test/create-ticket-finding.test.js`.

## Actions

| Action | What it does | GitHub calls |
|---|---|---|
| `start-investigation` | Pins the head commit of `DISCOVERY_REF` in `DISCOVERY_REPO`; returns the id and the budget | 1 |
| `list-repo-files` | Lists the allowed files at the pinned commit (at most 500) | 1 |
| `read-repo-file` | Returns at most 400 numbered lines of one allowed file; the text is marked as data | 1 per page |
| `read-ci-results` | CI runs on the pinned commit: workflow, event, status, conclusion. No run title and no commit message | 1 |
| `record-finding` | Checks and stores the finding in KVS; audit event `finding.recorded` | 0 |
| `create-ticket` with `findingId` | The finding must exist and be a defect; the ticket names it and gets the label `unconfirmed` | 0 |

## Rules

- **Path allowlist.** Only `src/`, `tests/`, `docs/` and `README.md`. Refused, with no GitHub
  call: any path part named `seed`, `seeds`, `scenario` or `scenarios` (in any letter case),
  any file name with `scenario`, `..`, `.`, empty parts, an absolute path, a backslash, a NUL,
  pathspec magic, and paths longer than 300 characters. A symbolic link or a file above 300,000
  bytes gives an error and no content.
- **Read budget, enforced.** Without a token GitHub allows 60 calls an hour per
  address; the budget is set for that case. Each GitHub call first takes one slot of its investigation (at most 20) and one slot
  of the site for the hour (at most 40, so the verifier keeps about 20). A slot is a KVS key
  written with `FAIL_IF_EXISTS`. A refused call takes no slot. A GitHub rate-limit answer is
  passed on with the time to try again. When `GITHUB_TOKEN` is set, these actions send it too
  (23 Nov); the budget stays the same.
- **Read log.** The investigation's slots are its log: action, path, line range, status and the
  numbers in the returned lines.
- **Grounding.** A finding of kind `defect` cites at least one `file:line` that a read returned,
  names a reproducer test (`test_<words>` in a Python file under `tests/`), and gives severity
  and priority with reasons. Every number in its text must be in the symptom, in a read, or a
  cited line number. `status: reproduced` is refused. Kinds `no_defect` and `unclear` need no
  citation.
- **A defect cites the rule it breaks (23 Nov, review finding 11).** At least one cited line
  must come from a file that states rules: a file under `docs/`, a README, or a test file, and
  that line must be in a read of the investigation. A defect that cites only code is recorded as
  `unclear`, not refused: its reproducer, severity and priority are dropped, `proposedKind:
  defect` keeps what the model said, and the open question "Which rule does this break? Cite a
  line of docs, a README or a test that states it." is added. An `unclear` finding cannot become a
  bug ticket. Limits: the code checks only that a rule file is cited, not that the cited line
  states the rule that the code breaks; and the rule does not check that a finding relates to the
  symptom (review finding 11, D2-2), which a person still judges.
- **Shape first.** `record-finding` checks the keys and types before any grounding check. A
  refusal names the part and the keys it got, for example
  `citations[0] needs keys file, line; got keys: path, line`. A finding with a wrong shape gets
  only these errors, so no check that depends on a missing key adds its own error. No key has an
  alias, and no grounding check is loosened (discovery round 1, 19 Nov: the model cited the
  right line under a wrong key, and the refusal read `undefined:181`).

- **One open investigation per person.** While a person's investigation has no recorded finding,
  a start with another symptom is refused (`an investigation is open: <id>; record a finding for
  it first`), before any GitHub call, so it takes no slot. The same symptom returns the same
  investigation. A start that GitHub refuses leaves nothing open. A recorded finding closes the
  investigation. An open investigation blocks a new start for at most 24 hours from its start
  (`DISCOVERY_LIMITS.openMaxMs`); after that a new start replaces it, so a model that stopped,
  used the budget or crashed never locks a person out (dev check, 19 Nov: the model opened a second investigation from a symptom it
  wrote itself and grounded a finding in it).
- **Claims about tests.** A defect finding's reproducer may not be a test function that a
  read shows exists (`def test_...`). A hypothesis sentence that names such a test together with
  "fail", "fails", "failing", "failed", "error", "errors" or "broken" is refused as ungrounded.
  When `read-ci-results` was called and a run on the commit concluded success, the refusal says
  so. Test outcomes are not readable without a token (`read-ci-results` gives workflow runs
  only), so the tools cannot confirm or refute a failing-test claim; they refuse it. Limits: the
  word list is open, so a claim in other words is not found; and a test name that the model
  never read is not caught (dev check, 19 Nov: the model claimed that an existing, passing test
  fails).
- **The finding names its report.** A recorded finding carries the symptom of its investigation
  word for word, and a ticket made from it shows `Answers the report: "..."`.

## The finding in the panel (23 Nov)

The issue panel has a section "Discovery finding". A person types a finding id (from the chat, or
from the description of a ticket made from the finding) and presses **Show finding**. The section
shows the kind and the status as stored, the symptom, the hypothesis, the cited rule lines (docs,
a README or a test) apart from the cited code lines, the reproducer, the severity and the
priority. For an `unclear` finding that the model proposed as a defect, it says that no rule was
cited and shows the rule question. The view only reads the store (`src/finding-view.js`,
`src/frontend/finding-section.js`, `test/panel-finding.test.js`). A finding is not tied to a work
item, so any person who can open the panel and has the id can see it.

## Owner steps (not done)

- Set the Forge variables `DISCOVERY_REPO` and `DISCOVERY_REF` (the commands are in
  `docs/OWNER-HELD-STEPS.md`, step 3a). The investigated branch is built by the bank's
  `scripts/build_discovery_branch.py`.
- Live runs with Rovo (part f6) wait for the owner.

## Limits

- The site budget is a count in this app. GitHub's limit is per address, and Forge shares
  addresses between apps, so GitHub can refuse earlier than the budget says.
- The allowlist is by name. A branch that still holds an answer key under an allowed path (for
  example a note in `docs/`) would leak it. The bank's `tests/test_discovery_branch.py` checks
  the built branch for this.
- The reproducer is proposed, not written. Writing it is a person's step or a local model's,
  labelled as such (owner decision, 19 Nov). Removing the label `unconfirmed` after a reproduced
  verdict is a person's step.
- Line numbers in a finding are grounded; the meaning of the hypothesis is not. A person reads
  the finding.
- **The symptom is a tool argument from the model.** In the deployed app the code cannot read
  the user's chat, so it cannot prove that the symptom is the user's text. One open
  investigation per person and the symptom on the finding and the ticket reduce the risk; they
  do not remove it. The person who reads the finding checks that it answers their report.
  The model can still close the open investigation with a `no_defect` finding and then start
  another one with a symptom of its own. The bake-off scores such a run 0, and in the app the
  ticket shows the symptom that the finding answers.
