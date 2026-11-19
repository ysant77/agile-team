# Rebuilt pinned evidence of sets 1 to 4 (made 18 Nov 2026, recorded 19 Nov 2026)

The case evidence that the arm C regressions of the protected regression set (`docs/PROTECTED-TESTS.md`) and of every later rule change use. Before this commit it was kept outside the repository.

- `s1` (manifests B and I), `s2` (S), `s3` (T), `s4` (set 4): for each case branch, `report.json` (the recorded CI report) and `meta.json` (the recorded run facts), and `BASE/` (the report of the bench base).
- How it was made: the recorded set evidence, with the `pinned` block added to each `report.json` by `benchmark/run/pin_evidence.py` running the bank's pinned step at bank `main` 60f141e (bank PR 20) on the local bench clones. Both sides of the two-sided cases B17 and B18 included. Not new CI runs.
- One change for publication: in `meta.json`, the field `steps.tests_tail` (a log tail the scorer does not read) had local temporary folder paths; they are replaced by `<tmp>` and a user name by `<user>`. Scored with `score.mjs` before and after the copy, every result record is identical.
- `SHA256SUMS`: the sha256 of every file as committed.

Use: copy a set folder to a scratch place (the scorer writes `results.json` into it) and run
`node benchmark/run/score.mjs --app <app> --app-main <app> --out <copy> --manifest benchmark/run/manifests/<manifest>`.

These are development sets. No claim rests on them; a claim needs blind set 5.
