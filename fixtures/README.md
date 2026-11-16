# Scenario fixtures

One file per scenario (`Snn.json`), from `../../SCENARIOS.md`. Each holds recorded or
synthetic evidence and the expected outcome, and runs as a unit test (`npm test`). Values in
`_defaults.json` are merged under every step's `context` (deep merge; the fixture wins).

```json
{
  "scenario": "S04",
  "title": "Double spend on concurrent withdrawals",
  "steps": [
    {
      "kind": "verify",
      "claim": { "id": "c1", "type": "fixed" },
      "context": { "ticket": {}, "pr": {}, "report": {}, "workflowRuns": [] },
      "expect": { "result": "contradicted", "reasonIncludes": ["failed"] }
    }
  ]
}
```

Step kinds: `verify` (claim and context; expects `result`), `arbitrate` (`ticket`, `sides`;
expects `decidedBy`, `winner`), `lint` (`draft`, `sources`; expects `pass`, `rules`), `assign`
(`tickets`, `twins`, `seed`; expects `assignments`), `reward` (`input`; expects `r`),
`audit` (`events`, `tamper`; expects `ok`), `agent` (a behaviour of a Rovo agent that code
cannot test; expects `refuses` and is checked by hand in the demo).
