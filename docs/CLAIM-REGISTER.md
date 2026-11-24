# Claim register (24 Nov 2026)

Each sentence that the submission, the video or a talk may say about the app, with its status and
its evidence. A sentence that is not here is not said. When a status changes, this file changes in
the same PR.

Status words:

- **built**: in the code on `main`, with tests. Not a measurement.
- **measured (blind)**: a result on a case set that a separate writer made, scored by the frozen
  protocol. Local runs, a simulated GitHub and Jira.
- **measured (development)**: a result on cases that we have seen. Never called held-out.
- **live, n = 1**: seen once on the development site with real users. Not a rate.
- **not met**: the result was below the bar we set; we say so.
- **not built**: a design only.

| # | Allowed wording | Status | Evidence |
|---|---|---|---|
| 1 | "Code decides the verdict. The Rovo agents only advise; their advice is shown and never counted." | built | `docs/ARCHITECTURE.md`; `src/verify-claim.js`; `test/judge-path.test.js` (T08) |
| 2 | "Each claim gets one of three answers: Supported, Contradicted or Cannot verify." | built | `src/verifier/verdict.js`; `docs/claims.md` |
| 3 | "Supported means the named test passes for the reasons the panel lists. It is not a claim that the work is correct." | built | panel "What was not checked" and "Never checked by the code checks" (`src/verdict-view.js`) |
| 4 | "On blind set 6, 13 of 16 buildable cases were right; 2 wrong changes were Supported; no correct change was blocked." | measured (blind) | `benchmark/RESULTS-6.md` (app 9ec52ca) |
| 5 | "On blind set 7, 16 of 19 undisputed cases were right; 2 wrong changes were Supported; 1 correct change was blocked." | measured (blind) | `benchmark/RESULTS-7.md`, ruling of 24 Nov (app cea0470); the 23-case figures (19 right, 3 unsafe, 1 false block) are given beside it |
| 6 | "In sets 5, 6 and 7 no change in a high-stake class (old test, AC change, report trust, money rule) was Supported unsafely. In set 8 one was: the claimant removed the money label before the claim, so no sign-off was asked (Y08)." | measured (blind) | `RESULTS-5.md` to `RESULTS-8.md`; the fix of Y08 (PR 117) is development evidence until a new blind set |
| 7 | "Weak tests still pass: a test that checks only part of the criterion, computes its expected value with the code it tests, transforms both sides before it compares, or expects a wrong value. The app does not read the text of the criteria." | measured (blind), limit | set 5 V02, V09, V12, V18; set 6 W18; set 7 X07 (and X19, a build dispute); set 8 Y02, Y09; `docs/claims.md`, "Measured limits" |
| 8 | "A harmful change that no test exercises can pass, for example request text in SQL, an insecure cookie or CORS setting, or a route with no ownership check." | measured (blind), limit | set 6 W10; set 7 X15; set 8 Y13 |
| 9 | "A model reviewer as a gate caught 0 of 4 unsafe cases, so it is advice only." | not met | `benchmark/RESULTS-5-ARM-D.md` |
| 10 | "A model that looks for a defect from a symptom gives an unconfirmed lead that a person classifies; it is not a defect finder." | not met (as a finder) | `benchmark/RESULTS-DISCOVERY-1.md`, `RESULTS-DISCOVERY-2.md` |
| 11 | "A money rule needs a sign-off of the merged commit by a person who is not the claimant; the claimant is refused." | built; live, n = 1 | `src/sign-off.js`; set 7 X05, X06, X14, X21 (measured, blind); U12 on the live site (`docs/claims.md`, "Live run on a Jira site") |
| 12 | "A pull request that does not name the work item counts only when a person other than the claimant links it." | built; measured (blind) | `src/pr-link.js`; set 7 X03, X13, X18 |
| 13 | "When GitHub refuses the reads (a rate limit), the app gives no verdict and says when to try again." | built; measured (blind) | `src/github-evidence.js`; set 7 X04, X22 |
| 14 | "Done means good on main: while the push run on the merge commit is still running, the claim is Cannot verify." | built; measured (blind) | PR 95; set 7 X10, X23 |
| 15 | "Every verdict, approval, link and sign-off is an event in a hash chain that the monitor page checks." | built | `src/audit.js`, `src/audit-store.js`, monitor page |
| 16 | "The five demo cases gave the expected verdict on a real Jira site with two users." | live, n = 1 | `docs/claims.md`, "Live run on a Jira site" (22 Nov) |
| 17 | "A ticket draft that states a number or money is created only when the person who asked confirms it in the panel." | built; deployed to development (5.15.0 and later) and to production (the owner's deploy of 24 Nov); not yet tried live | `src/ticket-draft.js`; `docs/DESIGN-TICKET-CONFIRMATION.md` |
| 18 | "Two faults that set 7 showed are fixed: a `pytest.raises` test that ends with DID NOT RAISE counts as a failure by an assertion, and the merge result reads the AC tests." | measured (blind) on set 8 | PR 100: Y01 and Y05 `supported` (the app before it gave false blocks); PR 101: Y06 and Y14 `contradicted` with the failed AC test on the merge result named; `RESULTS-8.md` |
| 19 | "The app is deployed to production and can be installed from its install link; on a fresh site one claim gave the expected Supported." | live, n = 1 (production, the owner's deploy of 24 Nov 12:45 UTC) | `docs/FIRST-JUDGE-CLAIM.md`, "Production, fresh site" (24 Nov); the install link is in the submission form, not in the repository; production is taken to be `main` e1bcb72 (inferred from the deploy time; the owner can confirm), which holds PR 106 and not PRs 117 and 118 (`docs/OWNER-HELD-STEPS.md`) |
| 20 | "On blind set 8, 18 of 22 scored cases were right, all 18 with the reason; 4 wrong changes were Supported; no correct change was blocked." | measured (blind) | `RESULTS-8.md` (app 6c4ec0c; 24 made, Y12 and Y22 not buildable, 0 disputed) |
| 21 | "On set 8 a claimant avoided the sign-off of a money rule by removing its label before the claim; the label is now kept with the audited AC record, so a removal no longer lowers the bar." | measured (blind) for the limit; the fix is measured (development) and deployed to development only (5.17.0); not on production (`docs/OWNER-HELD-STEPS.md`) | set 8 Y08; PR 117; `docs/claims.md`, "Measured limits (set 8)"; a new blind set measures the fix |

## Sentences we do not say

- "Proves the work is correct", "verified correct", "guarantees".
- Any rate for the fixes after set 7 as if it were blind (rows 18): a new blind set is needed.
- "Held-out" for any case that we have read (sets 1 to 7, the repair development cases).
- Any claim about code repair: the repair harness is development work (0 of 6 repaired, 0 of 3
  defects invented on the control, `bakeoff/repair/RESULTS-DEV-1.md`). It is not in the product.
- A figure without its denominator (24 made; buildable or undisputed; scored).
