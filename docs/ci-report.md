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
- Optional blocks used by the crash scenario: `repair` (`debits_minor`, `credits_minor`,
  `rows_deleted`, `rows_updated`) and `recon` (`accounts`, `accounts_matching`, `diff_minor`).
