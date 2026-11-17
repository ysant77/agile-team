# Why PM scores are low under lint version 2 (13 Nov, run rescore-2026-11-13)

No PM fail comes from the style rules: the bake-off PM scorer uses the requirement lint (actor,
observable result, vague verb, AC checks, grounded numbers), not the plain-English lint. Only one
fail involves the AC check format (devstral S02, one AC line without a valid check).

| Task | gpt-oss:20b | gemma4:26b | devstral-small-2:24b |
|---|---|---|---|
| S01 | pass | pass | invented threshold (200, 400 ms) |
| S02 | pass | pass | small count (2); AC line without a check |
| S03 | small count (1) | no observable result | no actor; invented (50, 200); small count (2) |
| S04 | pass | no actor | no actor |
| S07 | invented threshold (0.01) | pass | no actor; small counts (2, 3) |
| S11 | no result; invented (2.25, account 12345); zero (0) | no actor, no result | no result; zero (0); invented (1.0) |
| S13 | pass | domain constant (HTTP 403, 404) | no observable result |
| S21 | no actor; invented threshold (10) | no actor | vague verb; no actor; no result; invented (10); small count (1) |

Reading:
- **Hard task, real error:** invented thresholds (milliseconds, seconds, amounts). This is the
  behaviour the rule exists for: S01, S03, S07, S11, S21.
- **Strict scorer:** small structural numbers (0 in "never below 0", 1, 2 or 3 as counts) and
  domain constants (HTTP 403/404 in an authorisation ticket) count as invented. Lint v2 removed
  the old small-number exemption so that "3 s on 3G" is caught. As a side effect, a count or a
  zero bound fails too. Rows that fail only on these: gpt-oss S03, devstral S02 (with an AC
  fault), gemma4 S13.
- **Structure:** no actor or no observable result. The lint asks for a named actor (user,
  customer, API ...) and a visible result; this is a real requirement-quality rule.
- Proposal for lint v3 (not applied): allow 0 and 1 as bounds or counts, and a short list of
  domain constants (HTTP status codes) when the ticket names the protocol. Any change makes a new
  lint version, and the PM role is re-run.
