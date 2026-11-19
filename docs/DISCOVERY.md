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
- **Read budget, enforced, no token.** Without a token GitHub allows 60 calls an hour per
  address. Each GitHub call first takes one slot of its investigation (at most 20) and one slot
  of the site for the hour (at most 40, so the verifier keeps about 20). A slot is a KVS key
  written with `FAIL_IF_EXISTS`. A refused call takes no slot. A GitHub rate-limit answer is
  passed on with the reset time. `GITHUB_TOKEN` is never used by these actions.
- **Read log.** The investigation's slots are its log: action, path, line range, status and the
  numbers in the returned lines.
- **Grounding.** A finding of kind `defect` cites at least one `file:line` that a read returned,
  names a reproducer test (`test_<words>` in a Python file under `tests/`), and gives severity
  and priority with reasons. Every number in its text must be in the symptom, in a read, or a
  cited line number. `status: reproduced` is refused. Kinds `no_defect` and `unclear` need no
  citation.

## Owner steps (not done)

- Set the Forge variables `DISCOVERY_REPO` (the demo repository) and `DISCOVERY_REF` (the
  investigated branch, built by the bank's `scripts/build_discovery_branch.py`).
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
