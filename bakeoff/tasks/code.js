// Developer, QA and data-science roles on real bugs in scratch worktrees of the demo bank.
// Seeds come from seeds/*.patch; three small bugs are inline edits on the clean code.

import { applyEdits, applySeed, changed, makeWorktree, pytest, read, removeWorktree, sh, write } from '../repo.js';

const API_HINT = `HTTP tests: from fastapi.testclient import TestClient; from bank.api import create_app;
app = create_app(tmp_path / "t.db", seed_if_empty=False) after creating data with bank.ledger
(open_db, create_customer, open_account, deposit) and closing the connection; log in with
client.post("/api/session", json={"customer_id": id}).`;
const LEDGER_HINT = `Ledger: from bank import ledger; from bank.money import Money; conn = ledger.open_db(path);
ledger.create_customer(conn, name) -> id; ledger.open_account(conn, customer_id, "EUR") -> account
(.id); ledger.deposit(conn, account_id, Money.of("100.00", "EUR")); ledger.withdraw raises
ledger.InsufficientFunds; conftest has fixtures conn (fresh db) and at (at("2026-05-01") -> UTC datetime).`;

// Pinned to the commits the first rows of run full-2026-11-12 used, so every model in the run is
// scored on the same code (main at 20:54 SGT on 12 Nov; the fraud kit branch at that time).
const BANK_REF = '0e75e83';
const FRAUD_REF = '7849347';

export const BUGS = [
  { id: 'K1-race', scenario: 'S04', ref: BANK_REF, seed: 'k1_race', files: ['src/bank/ledger.py'],
    tests: ['tests/test_concurrency.py'], hint: `${LEDGER_HINT} Use one connection per thread.`,
    ticket: 'Support says a customer took out 150 from an account with 100 in it. When 20 threads each withdraw 80.00 at once from an account holding 100.00, at most one withdrawal succeeds and the balance never goes below 0.00.' },
  { id: 'K1-button', scenario: 'S01', ref: BANK_REF, seed: 'k1_hidden_button', files: ['src/bank/web/app.css'],
    tests: ['tests/test_web.py::test_send_button_not_hidden_at_or_below_430px'],
    hint: 'The stylesheet is src/bank/web/app.css (read it as text with pathlib). The button is "#send-button" inside ".form-actions".',
    ticket: "The send money button doesn't work on phones. On a window 430 px wide or less, no CSS rule hides the transfer form's Send button (#send-button)." },
  { id: 'S09-last-day', scenario: 'S09', ref: BANK_REF, files: ['src/bank/ledger.py'],
    inline: { path: 'src/bank/ledger.py', old: 'upper = (end + timedelta(days=1)).isoformat()', new: 'upper = end.isoformat()' },
    tests: ['tests/test_ledger.py::test_statement_end_date_is_inclusive'], hint: `${LEDGER_HINT} ledger.statement(conn, account_id, start_date, end_date).lines`,
    ticket: 'The statement misses the last day. A statement from 2026-05-01 to 2026-05-31 includes a deposit posted on 2026-05-31 at 23:00 UTC.' },
  { id: 'S08-yen', scenario: 'S08', ref: BANK_REF, files: ['src/bank/money.py'],
    inline: { path: 'src/bank/money.py', old: '"JPY": 0,', new: '"JPY": 2,' },
    tests: ['tests/test_money.py::test_jpy_has_no_minor_unit'], hint: 'from bank.money import Money, exponent; Money.of("5000", "JPY").minor is the amount in minor units.',
    ticket: 'Yen amounts are 100 times too large. JPY has no minor unit: 5000 JPY is stored as 5000 minor units, and "5000.5" JPY is refused.' },
  { id: 'S13-authz', scenario: 'S13', ref: BANK_REF, files: ['src/bank/api.py'],
    inline: { path: 'src/bank/api.py', old: 'if account is None or account.customer_id != customer_id:', new: 'if account is None:' },
    tests: ['tests/test_api.py::test_every_account_route_checks_the_owner'], hint: API_HINT,
    ticket: "A tester saw another customer's statement by changing the number in the URL. A logged-in customer who requests GET /api/accounts/{id}/statement for an account of another customer gets 404." },
];

export const DS_TASKS = [
  { id: 'K7-leak', scenario: 'S40', ref: FRAUD_REF, extras: ['fraud'], seed: 'k7_feature_leak',
    files: ['src/fraud/data.py', 'src/fraud/features.py'], rootFile: 'src/fraud/data.py',
    tests: ['tests/test_fraud_features.py'], check: (m) => m.auc < 0.95 && m.pr_auc >= 0.25,
    ticket: 'Theo added chargeback history to the fraud score. Holdout AUC jumped from 0.89 to 0.98 and PR-AUC from 0.39 to 0.63. Find out why and fix it; features may use only data from before the transaction.' },
  { id: 'K7-weak', scenario: 'S17', ref: FRAUD_REF, extras: ['fraud'], seed: 'k7_weak_model',
    files: ['src/fraud/features.py', 'src/fraud/model.py'], rootFile: 'src/fraud/features.py',
    tests: ['tests/test_fraud_model.py'], check: (m) => m.pr_auc >= 0.25,
    ticket: 'Fraud model v3 has holdout PR-AUC 0.08; v2 had 0.39. The gate needs PR-AUC at least 0.25. Find the cause and fix it without changing the gate.' },
];

const EDITS_SCHEMA = {
  type: 'object',
  required: ['edits'],
  properties: {
    rootCause: { type: 'object', properties: { file: { type: 'string' }, explanation: { type: 'string' } } },
    edits: { type: 'array', items: { type: 'object', required: ['path', 'old', 'new'],
      properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } } } },
  },
};
const TEST_SCHEMA = { type: 'object', required: ['test_file'], properties: { test_file: { type: 'string' } } };

function plant(dir, bug) {
  if (bug.seed) applySeed(dir, bug.seed);
  if (bug.inline && applyEdits(dir, [bug.inline]).length) throw new Error(`inline bug ${bug.id} does not apply`);
}

const filesBlock = (dir, files) => files.map((f) => `--- ${f}\n${read(dir, f)}`).join('\n\n');

function fraudMetrics(dir) {
  const r = sh('uv', ['run', 'python', '-m', 'fraud.model'], dir, 600_000);
  const m = {};
  for (const line of r.out.split('\n')) {
    const match = line.trim().match(/^([a-z_]+)\s+(-?\d+(?:\.\d+)?)$/);
    if (match) m[match[1]] = Number(match[2]);
  }
  return m;
}

// Edits to files outside the bug's list (conftest.py, pyproject.toml, tests) are refused before
// anything runs, so model code never changes how the tests run (unit 2 review, item 6).
export function editsOutside(bug, edits) {
  return [...new Set((edits ?? []).map((e) => e.path).filter((p) => !bug.files.includes(p)))];
}

async function fixTask(ask, bug, role) {
  const dir = makeWorktree(`${role}-${bug.id}`, bug.ref, bug.extras);
  try {
    plant(dir, bug);
    const before = pytest(dir, bug.tests);
    const prompt = `${bug.ticket}\n\nFailing test output:\n${before.tail}\n\nFiles you may change:\n${filesBlock(dir, bug.files)}\n\n` +
      'Answer with JSON only: {"rootCause": {"file", "explanation"}, "edits": [{"path", "old", "new"}]}. ' +
      '"old" must be an exact, unique snippet of the current file; keep the change minimal.';
    const reply = await ask([{ role: 'system', content: 'You are a careful senior engineer fixing one bug in a Python repository.' },
      { role: 'user', content: prompt }], EDITS_SCHEMA);
    if (!reply.ok || !reply.parsed) return { task: bug.id, failed: reply.error ?? 'invalid JSON', score: 0 };
    const refused = editsOutside(bug, reply.parsed.edits);
    if (refused.length) return { task: bug.id, failed: `edits outside the allowed files: ${refused.join(', ')}`, outside: refused, score: 0 };
    const editErrors = applyEdits(dir, reply.parsed.edits);
    if (editErrors.length) return { task: bug.id, failed: `edits: ${editErrors.join('; ')}`, score: 0 };
    const diff = changed(dir);
    const outside = diff.filter((d) => !bug.files.includes(d.path)).map((d) => d.path);
    const acPass = pytest(dir, bug.tests).passed;
    const suitePass = pytest(dir, []).passed;
    const lint = sh('uv', ['run', 'ruff', 'check', '-q', ...bug.files.filter((f) => f.endsWith('.py'))], dir).code === 0;
    const out = { task: bug.id, acPass, suitePass, lintClean: lint, outside, changedLines: diff.reduce((s, d) => s + d.lines, 0) };
    if (role === 'ds') {
      out.metrics = fraudMetrics(dir);
      out.rootCauseFound = reply.parsed.rootCause?.file === bug.rootFile;
      out.metricOk = bug.check(out.metrics);
      out.score = acPass && suitePass && out.metricOk && outside.length === 0 ? 1 : 0;
    } else {
      out.score = acPass && suitePass && outside.length === 0 ? 1 : 0;
    }
    return out;
  } finally {
    removeWorktree(dir);
  }
}

export const runDev = (ask, bug) => fixTask(ask, bug, 'dev');
export const runDs = (ask, task) => fixTask(ask, task, 'ds');

// QA: the model writes a test file from the requirement and the clean code. A seed is caught when
// the test passes on the clean code and fails on the buggy code.
export async function runQa(ask, bug) {
  const dir = makeWorktree(`qa-${bug.id}`, bug.ref, bug.extras);
  try {
    const prompt = `Requirement: ${bug.ticket}\n\n${bug.hint}\n\nCurrent code:\n${filesBlock(dir, bug.files)}\n\n` +
      'Write one pytest file that checks this requirement and would fail if it broke. Answer with JSON only: {"test_file": "<python source>"}.';
    const reply = await ask([{ role: 'system', content: 'You are a QA engineer who writes precise pytest tests.' },
      { role: 'user', content: prompt }], TEST_SCHEMA);
    if (!reply.ok || !reply.parsed?.test_file) return { task: bug.id, failed: reply.error ?? 'no test file', score: 0 };
    const rel = 'tests/test_qa_bakeoff.py';
    write(dir, rel, reply.parsed.test_file);
    const clean = pytest(dir, [rel], 240_000);
    plant(dir, bug);
    const seeded = clean.passed ? pytest(dir, [rel], 240_000) : { passed: null };
    const caught = clean.passed && seeded.passed === false;
    return { task: bug.id, passesOnClean: clean.passed, failsOnSeeded: seeded.passed === false, caught, score: caught ? 1 : 0,
      cleanTail: clean.passed ? undefined : clean.tail.slice(-600) };
  } finally {
    removeWorktree(dir);
  }
}
