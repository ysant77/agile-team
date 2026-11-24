# Demo video script (updated 24 Nov 2026)

Length: 3 minutes maximum. The judges need not watch past 3 minutes. The five cases and their
expected states are in `docs/JUDGE-PATH.md`. The claims the voice may make are in
`docs/CLAIM-REGISTER.md`; a sentence that is not there is not said.

Voice: short sentences. Say what the screen shows. Do not say "proves the work is correct".

## Source labels

Each shot has one label, and the video shows it as a small caption.

- **live**: a screen recording of the development site during the owner's run, with real Jira
  users and the real demo pull requests.
- **recorded**: a replay of stored evidence (`fixtures/judge-live/`, `benchmark/run/evidence/`),
  shown in the same panel code. No live call is made.
- **scripted**: a diagram, a card or text that we prepared.
- **model-generated**: text that a model wrote (the reviewer's advice). It is never counted.

## Script and shot list

| Time | Source | Shot (what is on the screen) | Voice |
|---|---|---|---|
| 0:00-0:15 | live | A Jira work item with the comment `claim: done`, and the linked pull request with green CI | "An agent says the work is done. CI is green and the pull request is merged. Is it done?" |
| 0:15-0:30 | scripted | `docs/ARCHITECTURE.md` diagram | "This Forge app checks the claim. Code reads the pull request, the CI report and the work item, and gives one of three answers. The Rovo agents only advise." |
| 0:30-0:50 | live | **U01.** The work item, the PR merge, the comment `claim: done`, then the panel: **Supported** | "A server error on a very large account id. The test fails before the fix and passes after it. Supported, and the panel still lists what was not checked." |
| 0:50-1:10 | live | **U04.** Panel: **Contradicted**, "Why" line visible | "Here the new test passes on the old code too. So it does not show the fix. Contradicted." |
| 1:10-1:30 | live | **U20.** Panel: **Contradicted**, the pinned base test named in "Why" | "This change makes an old assertion weaker. The app runs the old copy of the test on the new code. It fails, so: Contradicted. A real change of a requirement needs a second person." |
| 1:30-2:15 | live | **U12.** Panel: **Cannot verify** (money rule). User B presses "Sign off the merged change": refused. User A signs off: "Signed off ... Audit seq N". User B claims again: **Supported** | "A money rule. Tests alone are not enough, so the app asks for a person. The person who claimed cannot sign off. A second person signs off the merged commit, and the claim is now Supported. Every step is in the audit log." |
| 2:15-2:40 | live, with model-generated advice | **T08.** Panel: **Supported**, then scroll to "Advice from a model, not counted" | "The code checks pass this one. But the test checks only one of two cases. The reviewer agent points at the gap. Its advice is shown and not counted: a person reads it and decides." |
| 2:40-3:00 | scripted | Figures card (below), then the panel's "Never checked by the code checks" list | "We tested it on blind case sets that we did not write. Most answers were right, and no high-stake change passed unsafely. In each set, two wrong changes still passed: a weak test, or a harmful change that no test exercises. So Supported means the test, not the whole work." |

If a live shot cannot be recorded, use the recorded replay of the same case
(`scripts/judge-live.mjs`, PR 83) and change its caption to **recorded**. Never show a recorded
shot as live.

## Figures card (2:40)

Use these lines as they are. Sources: `benchmark/RESULTS-6.md`, `benchmark/RESULTS-7.md`,
`benchmark/RESULTS-5-ARM-D.md`, `bakeoff/repair/RESULTS-DEV-1.md`.

- Blind set 6: 16 buildable of 24. 13 right. 2 unsafe Supported. 0 false blocks.
- Blind set 7: 19 undisputed of 24. 16 right. 2 unsafe Supported. 1 false block.
- No unsafe Supported in the high-stake classes in either set.
- Model reviewer as a gate (set 5): caught 0 of 4. Now advice only.

Not on the card, and not in the voice: the fixes made after set 7 (they are measured only on
development data), and the repair harness (development only: 0 of 6 repaired, 0 of 3 defects
invented on the control).

## Optional beat, not in the 3-minute cut: "green but not enough"

Source: recorded (development data). The seeded defect D7-1 of the repair harness: the bank's own
32 idempotency and API tests pass on it, and the evaluator's hidden check fails 3 of 4. Use it only
in a longer talk, captioned "development case, not a blind measurement".

## Screenshots and clips we need from the owner

Take them during the live run (`OWNER-TOMORROW` step 10e and the U12 sign-off). The list of every
screen is in `docs/UI-LIST.md`.

| # | What | When |
|---|---|---|
| 1 | U01 panel, **Supported**, with "What was not checked" visible | after U01, step 10e |
| 2 | U04 panel, **Contradicted**, with the "Why" line | after U04, step 10e |
| 3 | U20 panel, **Contradicted**, with the pinned base test in "Why" | after U20, step 10e |
| 4 | U12 panel, **Cannot verify**, with the sign-off section | after U12, step 10e |
| 5 | U12 refusal message for user B | U12 sign-off, step 1 |
| 6 | U12 "Signed off by ... Audit seq N" line | U12 sign-off, step 2 |
| 7 | U12 panel, **Supported** after the second claim | U12 sign-off, step 3 |
| 8 | T08 panel, **Supported**, with "Advice from a model, not counted" | after T08, step 10e (step 12 run first) |
| 9 | One verdict comment on a work item (any case), with the audit sequence and hash | any case |
| 10 | The monitor page with the audit chain check | at the end |
| 11 | The "Never checked by the code checks" list (five lines) | any verdict, after the next deploy |

A screen recording of the whole run is better than single screenshots: we cut the clips from it.
Do not record a page that shows an email address, a token or a browser profile name.
