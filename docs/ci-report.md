# CI report format (`aat-ci-report/1`)

The demo repository's CI writes this JSON and posts it as a pull request comment. The comment
body starts with the line `<!-- aat-ci-report -->`, followed by one fenced `json` block. The
verifier accepts a report only from the GitHub Actions bot, only for the pull request's current
head commit, and only when no file under `.github/workflows/` differs from the base branch.

```json
{
  "schema": "aat-ci-report/1",
  "repository": "owner/name",
  "head_sha": "40-hex commit id",
  "base_sha": "40-hex commit id",
  "generated_at": "2026-11-20T10:00:00Z",
  "workflow_files": { ".github/workflows/ci.yml": "sha256 hex" },
  "tests": [
    { "id": "tests/test_transfers.py::test_BANK4_balance_never_negative", "outcome": "passed", "duration_s": 0.12 }
  ],
  "metrics": { "transfers_per_s": 412.0 },
  "deps": { "fastapi": "0.115.0" },
  "migrations": [ { "number": "0005", "file": "migrations/0005_currency.py", "operations": ["ADD COLUMN"] } ]
}
```

- `outcome` is one of `passed`, `failed`, `skipped`, `error`. The verifier treats `skipped`
  and `error` as not passed.
- A test **name** is the part after the last `::`, without a parameter suffix `[...]`. An AC
  check `test_passes(<name>)` matches every test with that name; all must pass, and at least
  one must exist.
- `metrics` holds numbers only. Benchmarks report `<name>_median` and `<name>_iqr_low`,
  `<name>_iqr_high` when a tie-break needs them.
- `migrations` lists every migration file on the head with the SQL operations it contains
  (`CREATE TABLE`, `ADD COLUMN`, `DROP`, `RENAME`, `UPDATE`, ...).
- Optional `data_hashes` (`train`, `live`): sha256 of the datasets a drift metric compares. A
  `psi*` metric is not trusted when both hashes are equal.
- Optional blocks used by the crash scenario: `repair` (`debits_minor`, `credits_minor`,
  `rows_deleted`, `rows_updated`) and `recon` (`accounts`, `accounts_matching`, `diff_minor`).

## Provenance: the report hash marker (19 Nov 2026, design P0-3)

The bank's `report` job (pull requests) and `publish-main-report` job (pushes to `main`) run no
repository code. Each one:
- hashes the downloaded `ci-report.json`;
- uploads it again as an artifact named `ci-report-sha256-<hash>-attempt-<n>` or
  `main-report-sha256-<hash>-attempt-<n>`.

Only the run can upload to itself.

**Hash rule.** sha256 of the UTF-8 text with trailing spaces, tabs, CR and LF removed. It is
`reportHash` in `src/verifier/report.js`, and the bank's hash step uses the same rule. Both test
suites check the same vector.

**Check `report_provenance`.** The PR report comment counts only when a run of the pinned
workflow:
- has event `pull_request`;
- is on the PR head;
- is in this repository;
- has exactly one marker hash at its current attempt, equal to the hash of the raw comment
  report.

`main.json` counts only when a push run of the pinned workflow on `main`, for the commit that
`main.json` names, has its own marker, under the same rule.

**Re-runs.** A re-run uploads to the same run under a new attempt number. Only the marker of the
current attempt counts. Two different hashes for one attempt give unknown. Two identical names
cannot exist in one run.

**Required per repository.** `VERIFY_CONFIG.provenanceRequiredRepos` decides it. A repository is
listed only after a real PR run on it shows that the comment text and the marker hash agree. Listed
on 19 Nov: `ysant77/yms-bank-demo` (PR run 44455535406, push run 44456621300) and
`ysant77/yms-bank-demo-cases` (demo PR runs of 19 Nov; push run 44473706448). For any other
repository the check is advisory and never counted.

**Limits:**
- The marker binds a report to a run of the pinned workflow on the right commit. It does not make
  the run honest: the PR's own code runs in the `test` job.
- An admin who deletes artifacts makes the check unknown.
- A partial re-run that does not re-run the `report` job leaves the current attempt with no
  marker, so the check is unknown.

**GitHub calls.** On the judge-path replays, 9 calls per claim before this check and 11 after.
The recordings have no push-run list, so the artifact list of the push run is not read there. Live
it is about 12. At most 3 pinned PR runs are read, so the most is about 14.
