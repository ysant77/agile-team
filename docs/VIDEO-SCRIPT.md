# Demo video script (draft, 22 Nov 2026)

Length: 3 minutes maximum. The judges need not watch past 3 minutes. Every shot is a screen
recording of the demo site and the demo pull requests, except the diagram and the figures card.
The five cases and their expected states are in `docs/JUDGE-PATH.md`.

Voice: short sentences. Say what the screen shows. Do not say "proves the work is correct".

## Script and shot list

| Time | Shot (what is on the screen) | Voice |
|---|---|---|
| 0:00-0:15 | A Jira work item with the comment `claim: done`, and the linked pull request with green CI | "An agent says the work is done. CI is green and the pull request is merged. Is it done?" |
| 0:15-0:30 | `docs/ARCHITECTURE.md` diagram | "This Forge app checks the claim. Code reads the pull request, the CI report and the work item, and gives one of three answers. The Rovo agents only advise." |
| 0:30-0:50 | **U01.** The work item, the PR merge, the comment `claim: done`, then the panel: **Supported** | "A server error on a very large account id. The test fails before the fix and passes after it. Supported, and the panel still lists what was not checked." |
| 0:50-1:10 | **U04.** Panel: **Contradicted**, "Why" line visible | "Here the new test passes on the old code too. So it does not show the fix. Contradicted." |
| 1:10-1:30 | **U20.** Panel: **Contradicted**, the pinned base test named in "Why" | "This change makes an old assertion weaker. The app runs the old copy of the test on the new code. It fails, so: Contradicted. A real change of a requirement needs a second person." |
| 1:30-2:15 | **U12.** Panel: **Cannot verify** (money rule). User B presses "Sign off the merged change": refused. User A signs off: "Signed off ... Audit seq N". User B claims again: **Supported** | "A money rule. Tests alone are not enough, so the app asks for a person. The person who claimed cannot sign off. A second person signs off the merged commit, and the claim is now Supported. Every step is in the audit log." |
| 2:15-2:40 | **T08.** Panel: **Supported**, then scroll to "Advice from a model, not counted" | "The code checks pass this one. But the test checks only one of two cases. The reviewer agent points at the gap. Its advice is shown and not counted: a person reads it and decides." |
| 2:40-3:00 | Figures card (below), then the line "Not checked: whether the test covers every case of the criterion." | "On a blind set of 24 cases: 16 right, none unsafe in the high-stake classes, but 4 weak tests passed and 3 correct changes were blocked. The model as a gate caught none of the 4, so it only advises. Supported means the test, not the whole work." |

## Figures card (2:40)

Use these lines as they are. Source: `docs/SUBMISSION.md`, "What we measured".

- Blind set 5, 24 cases: 16 right. 0 unsafe Supported in the high-stake classes.
- Misses: 4 weak tests Supported. 3 correct changes blocked.
- Model reviewer as a gate: caught 0 of 4. Now advice only.

## Screenshots and clips we need from the owner

Take them during the live run (`OWNER-TOMORROW` step 10e and the U12 sign-off).

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

A screen recording of the whole run is better than single screenshots: we cut the clips from it.
Do not record a page that shows an email address, a token or a browser profile name.
