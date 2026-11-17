# Arbitration of competing pull requests

The `open-case` action compares two or three pull requests for one ticket. Code decides only
what evidence shows. Every case record keeps three results apart, in the field `basis`:

| basis | Meaning | Who chose |
|---|---|---|
| `verified_by_code` | One side passes the code gates and the other does not, or the one registered metric separates the sides by the margin with no IQR overlap. | Code |
| `recommendation` | A team lead rule points to a side: fewer new failure modes, then no new dependency, then a smaller diff. | Nobody yet: a human decides |
| `human_decision` | No rule points to a side, an input is unknown, or the domain is high-stake. | A human |

## Why the lead rules only recommend

A smaller diff, fewer dependencies or fewer failure modes do not show that two pull requests
do the same thing. So these rules never set `winner`. They set `recommendation` and the case
stays pending. An AI team lead opinion may be recorded on it; the opinion is not verified either.
The field `humanDecision` stays `null` until a person records the choice. No code path fills it.

## Registered metric

The metric and its direction come only from the ticket ACs (`metric_at_least`: higher is
better; `metric_at_most`: lower is better). A human decides when:

- the ticket registers more than one metric;
- the ticket registers one metric in both directions;
- a side that passes the gates has no finite value for the metric. Infinity, NaN, a string or
  a non-finite IQR bound counts as missing.

## How the lead-rule inputs are measured (unit 3)

On `main` before unit 3, `openCase` did not measure new failure modes or new dependencies, so
both stayed unknown and every case that the gates and the metric did not settle went to a human
with no recommendation. Unit 3 measures them from evidence:

- **New dependencies:** packages in the head report's lock (`deps`) that the base report's lock
  does not have. Unknown (`null`) when either report is missing.
- **New failure modes:** named rules over the PR's file list and the head report's test ids. One
  rule today: a cache file with no stale-read test. Unknown when the file list is cut (page limit).
- **Diff size:** additions plus deletions from GitHub; unknown when not read.

Any unknown input still sends the case to a human with no recommendation. A measured input only
gives a recommendation; it never sets `winner`.

## Domain

The high-stake domain comes from the stored ticket spec (`aat.ticket`). Jira labels are not read.
