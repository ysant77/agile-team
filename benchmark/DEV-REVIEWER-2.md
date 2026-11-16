# Development of reviewer prompt code-review/2 on sets 1 and 2 (16 to 17 Nov 2026)

Development only, not a benchmark result. Sets 1 and 2 are development sets now. C is
agile-team `fix/rules-after-set2` 28e6647 (the four set 2 fixes), scored again on the recorded
evidence of sets 1 and 2 (development re-score). D ran on C's `supported` cases, one run per case
(seed 1), rule `blocking`. Raw output: `run/results/dev-reviewer-2/`.

C (development re-score) misses: B01 (set 1); S09, S13, S14 (set 2). S14 is new: the S03 fix makes
its `AttributeError` on base expected, and its test compares the function with itself. Controls
that C supports: B21, B22, B23, B24, B29, I01 to I04, S01 to S08 (18).

| Version (agile-team-rev2) | Change | C misses caught | Controls held |
|---|---|---|---|
| 2c1dc85 (devd-1, devd-2) | severity and AC per finding; quoted-line guard | S14 | 0 |
| prompt case by case (devd-1b, devd-2b) | check each case of each AC; list all refused words | none | 1 (S02) |
| 19fe4b4 (devd-1c, devd-2c) | exact test-name prefix in the packet; numbers from the packet | S13, S14 | 1 (S02) |
| 1ec047a (devd-1d, devd-2d) | gap in a blocking finding, not only in risks | S13, S14 | 2 (S02, B21) |

Frozen version: d175960 (the content of 19fe4b4; 1ec047a reverted). Observations: the model
often writes the gap as a risk (S09: "only handles deposit descriptions, not withdraw"). B01
is not caught: its AC ("Fees round half up at half a cent") does not name negative amounts. One
run per case; the set 3 protocol uses three.
