---
name: write-checkable-ticket
description: Turn a request into a ticket whose acceptance criteria a machine can check. Use it when a user asks for a ticket, a bug report or a story, or asks whether a draft requirement is clear enough to verify later. It runs fixed lint rules on the draft and explains how to fix each finding.
allowed-tools: lint-requirement
metadata:
  app: agile-team
  version: "1"
---

# Write a checkable ticket

A ticket is checkable when every acceptance criterion (AC) names one result that a test, a
measured number or a named human can confirm. Later, the team lead verifier checks claims such as
"claim: fixed" against these lines, so a vague line makes a claim impossible to verify.

## Steps

1. Write a draft: a one-line summary, a description that names an actor and an observable result,
   and one AC per line.
2. Call `lint-requirement` with the user's own words in `request`, and your `summary`,
   `description` and `acceptanceCriteria`.
3. If the result has findings, fix every finding and call `lint-requirement` again.
4. After two rounds with findings left, stop and ask the user one question. Do not guess.
5. Show the draft to the user. Only the user confirms a ticket; this skill never creates one.

## AC line format

One criterion per line: `AC1 | statement | check`. The check is one of:

| Check | Use it for |
|---|---|
| `test_passes(test_{TOKEN}_name)` | behaviour that a test can prove. Write `{TOKEN}` literally; the key does not exist yet. |
| `metric_at_least(name, value)` or `metric_at_most(name, value)` | a measured bound from the CI report |
| `subtasks_done()` | work that ends when all its sub-tasks reach Done |
| `deployed(tag)` | a release that must reach an environment |
| `manual()` | something only a human can judge, such as wording or layout taste |

Example: `AC1 | the balance never goes below 0.00 | test_passes(test_{TOKEN}_balance_never_negative)`.

## Findings and how to fix them

| Rule | Meaning | Fix |
|---|---|---|
| `vague-verb` | a verb such as "improve" or "handle" with no observable result | say what a user sees or what a test measures |
| `no-actor` | nobody does or sees anything | name the actor: a customer, an admin, the API, a job |
| `no-result` | no observable result | add the result that changes |
| `no-ac` | no acceptance criteria | add at least one AC line |
| `ac-no-check` | an AC line has no valid check | add one check from the table above |
| `ungrounded-number` | a number that is not in the request | use only numbers the user gave, or ask for the number |

Never invent a number, a deadline or a test name that the user did not give; ask instead.

## Style of every answer

Write plain technical English. Use one idea per sentence. Use at most 20 words for an
instruction and 25 for a description. Use the active voice. Do not use hedge words or praise
words. Use the same term for the same thing.
Give numbers with units. Give the source (evidence id, check name or commit) for every claim.
