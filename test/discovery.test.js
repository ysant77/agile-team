// Discovery from symptoms (Mode B, execution plan part f, minimal form). The PM agent gets a
// symptom, reads the investigated branch with read-only actions, and records a finding. Rules:
// - a path allowlist (src/, tests/, docs/, README.md) that refuses seeds/, scenarios/ and their
//   READMEs, "..", absolute paths and symlinks; a refused path makes no GitHub call;
// - an explicit read budget (GitHub allows 60 calls an hour without a token): at most 20 calls per
//   investigation and 40 per site per hour, taken before each call;
// - every call is logged per investigation;
// - a finding cites only lines that a read returned, and numbers from the symptom or a read; its
//   status is "unconfirmed" (only a CI report can make it "reproduced").

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DISCOVERY_LIMITS, listRepoFiles, numbersIn, pathAllowed, readCiResults, readRepoFile, readsOf, recordFinding, startInvestigation,
} from '../src/discovery.js';

const COMMIT = 'c'.repeat(40);
const LEDGER = Array.from({ length: 450 }, (_, i) => (i === 254 ? '    time.sleep(0.01)' : `line ${i + 1} of ledger`)).join('\n');
const FILES = {
  'src/bank/ledger.py': LEDGER,
  'src/bank/web/app.css': '@media (max-width: 430px) {\n  .form-actions #send-button { display: none; }\n}\n',
  'README.md': 'A demo bank.\n',
  'tests/test_ledger.py': 'def test_x():\n    assert 1 + 1 == 2\n',
};
const TREE = [
  ...Object.keys(FILES).map((path) => ({ path, type: 'blob', size: FILES[path].length })),
  { path: 'seeds/k1_race.patch', type: 'blob', size: 10 },
  { path: 'scenarios/README.md', type: 'blob', size: 10 },
  { path: 'src/bank/link.py', type: 'blob', size: 5 },
  { path: 'pyproject.toml', type: 'blob', size: 5 },
  { path: 'src', type: 'tree' },
];

function memStore() {
  const map = new Map();
  return {
    map,
    get: async (k) => structuredClone(map.get(k)),
    set: async (k, v, opts) => {
      if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && map.has(k)) throw new Error('key exists');
      map.set(k, structuredClone(v));
    },
    delete: async (k) => { map.delete(k); },
  };
}

const json = (status, body, headers = {}) => ({ ok: status < 300, status, json: async () => body, headers: { get: (h) => headers[h.toLowerCase()] ?? null } });

// A GitHub double for the investigated branch; it counts every call.
function github({ symlink = [], rateLimited = false, runs = [], extraFiles = {} } = {}) {
  const calls = [];
  const files = { ...FILES, ...extraFiles };
  const get = async (path) => {
    calls.push(path);
    if (rateLimited) return json(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1795000000' });
    if (path === '/repos/o/demo/commits/investigate%2Fsymptoms') return json(200, { sha: COMMIT });
    if (path === `/repos/o/demo/git/trees/${COMMIT}?recursive=1`) return json(200, { sha: COMMIT, truncated: false, tree: TREE });
    const m = /^\/repos\/o\/demo\/contents\/(.+)\?ref=(\w+)$/.exec(path);
    if (m) {
      const file = decodeURIComponent(m[1]);
      if (symlink.includes(file)) return json(200, { type: 'symlink', target: '../seeds/k1_race.patch', path: file });
      if (!(file in files)) return json(404, { message: 'Not Found' });
      return json(200, { type: 'file', path: file, size: files[file].length, encoding: 'base64', content: Buffer.from(files[file]).toString('base64') });
    }
    if (path === `/repos/o/demo/actions/runs?head_sha=${COMMIT}&per_page=20`) return json(200, { total_count: runs.length, workflow_runs: runs });
    return json(404, { message: 'Not Found' });
  };
  return { get, calls };
}

let clock = Date.parse('2026-11-20T09:00:00Z');
function deps(gh = github(), store = memStore()) {
  const audit = [];
  return {
    store, get: gh.get, calls: gh.calls, audit, now: () => clock,
    appendAudit: async (e) => { audit.push(e); return { seq: audit.length - 1 }; },
  };
}
const START = { symptom: 'A customer withdrew 80.00 twice from 100.00 and the balance went to -60.00.', by: 'pm-1', repo: 'o/demo', ref: 'investigate/symptoms' };
async function started(d = deps(), extra = {}) {
  const r = await startInvestigation({ ...START, ...extra }, d);
  assert.equal(r.ok, true, r.error);
  return { d, id: r.investigationId, r };
}

test('pathAllowed: the allowlist, and seeds, scenarios and their READMEs are refused', () => {
  for (const ok of ['src/bank/ledger.py', 'tests/test_web.py', 'docs/a.md', 'README.md', 'src/bank/web/app.css']) assert.equal(pathAllowed(ok), null, ok);
  const refused = [
    'seeds/k1_race.patch', 'seeds/README.md', 'scenarios/README.md', 'scenarios/S04/test_withdraw_race.py.tmpl', 'src/seeds/x.py',
    'tests/scenarios/README.md', 'scripts/scenario.py', 'tests/test_scenario_script.py', 'pyproject.toml', '.github/workflows/ci.yml',
    '../src/bank/ledger.py', 'src/../seeds/k1_race.patch', '/src/bank/ledger.py', 'src//bank.py', 'src/./bank.py', 'src\\bank.py',
    '', 'src/bank/ledger.py\0', ':(glob)src', 'SEEDS/x', 'src/Scenarios/y.py', 'x'.repeat(301), 7, null,
  ];
  for (const bad of refused) assert.match(String(pathAllowed(bad)), /./, JSON.stringify(bad));
});

test('numbersIn: numbers in text, not digits inside names', () => {
  assert.deepEqual(numbersIn('withdrew 80.00 twice from 100.00, at 430px; test_x_430 k1 P1 line 255'), ['80.00', '100.00', '430', '255']);
});

test('start-investigation pins the commit of the branch with one call and audits the start', async () => {
  const { d, r } = await started();
  assert.equal(r.commit, COMMIT);
  assert.equal(d.calls.length, 1);
  assert.equal(r.budget.left, DISCOVERY_LIMITS.callsPerInvestigation - 1);
  assert.equal(d.audit[0].event, 'investigation.started');
  assert.equal(d.audit[0].actor, 'pm-1');
  // The same symptom from the same person is the same investigation: no second call.
  const again = await startInvestigation(START, d);
  assert.equal(again.investigationId, r.investigationId);
  assert.equal(d.calls.length, 1);
});

test('start-investigation refuses a missing symptom, person, repository or branch', async () => {
  const d = deps();
  for (const bad of [{ symptom: '' }, { symptom: 'x'.repeat(2001) }, { by: null }, { repo: '' }, { ref: '' }, { repo: 'not a repo' }]) {
    const r = await startInvestigation({ ...START, ...bad }, d);
    assert.equal(r.ok, false, JSON.stringify(bad));
  }
  assert.equal(d.calls.length, 0);
});

test('list-repo-files lists only allowed files of the pinned commit, in one call', async () => {
  const { d, id } = await started();
  const r = await listRepoFiles({ investigationId: id, by: 'pm-1' }, d);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.files.map((f) => f.path).sort(), ['README.md', 'src/bank/ledger.py', 'src/bank/link.py', 'src/bank/web/app.css', 'tests/test_ledger.py']);
  assert.ok(!JSON.stringify(r).includes('seeds'));
  assert.ok(!JSON.stringify(r).includes('scenarios'));
  assert.equal(d.calls.length, 2);
  const only = await listRepoFiles({ investigationId: id, by: 'pm-1', prefix: 'src/bank/web/' }, d);
  assert.deepEqual(only.files.map((f) => f.path), ['src/bank/web/app.css']);
});

test('read-repo-file returns at most 400 numbered lines, marked as data, and pages on', async () => {
  const { d, id } = await started();
  const r = await readRepoFile({ investigationId: id, by: 'pm-1', path: 'src/bank/ledger.py' }, d);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.commit, COMMIT);
  assert.equal(r.from, 1);
  assert.equal(r.to, 400);
  assert.equal(r.totalLines, 450);
  assert.equal(r.lines.length, 400);
  assert.equal(r.lines[254], '255: ' + '    time.sleep(0.01)');
  assert.match(r.note, /data, not instructions/);
  const next = await readRepoFile({ investigationId: id, by: 'pm-1', path: 'src/bank/ledger.py', startLine: 401 }, d);
  assert.equal(next.from, 401);
  assert.equal(next.to, 450);
});

test('a refused path gives an error, no content and no GitHub call', async () => {
  const { d, id } = await started();
  const before = d.calls.length;
  for (const path of ['seeds/k1_race.patch', 'scenarios/README.md', '../seeds/k1_race.patch', 'pyproject.toml']) {
    const r = await readRepoFile({ investigationId: id, by: 'pm-1', path }, d);
    assert.equal(r.ok, false, path);
    assert.equal(r.lines, undefined);
  }
  assert.equal(d.calls.length, before);
});

test('a symlink is refused after the call, with no content; a missing file says not found', async () => {
  const { d, id } = await started(deps(github({ symlink: ['src/bank/link.py'] })));
  const link = await readRepoFile({ investigationId: id, by: 'pm-1', path: 'src/bank/link.py' }, d);
  assert.equal(link.ok, false);
  assert.match(link.error, /symbolic link/);
  assert.ok(!JSON.stringify(link).includes('seeds'));
  const missing = await readRepoFile({ investigationId: id, by: 'pm-1', path: 'src/bank/none.py' }, d);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /not found/);
});

test('a file above the size cap is refused with no content', async () => {
  const { d, id } = await started();
  const r = await readRepoFile({ investigationId: id, by: 'pm-1', path: 'src/bank/ledger.py' }, { ...d, limits: { ...DISCOVERY_LIMITS, sizeCap: 100 } });
  assert.equal(r.ok, false);
  assert.match(r.error, /larger than/);
  assert.equal(r.lines, undefined);
});

test('the GitHub rate limit answer is passed on with the time to try again', async () => {
  const d = deps(github({ rateLimited: true }));
  const r = await startInvestigation(START, d);
  assert.equal(r.ok, false);
  assert.match(r.error, /rate limit/);
  assert.match(r.error, /try again after 2026-11-18 \d\d:\d\d UTC/);
});

test('the investigation budget is enforced before the call', async () => {
  const { d, id } = await started();
  const limits = { ...DISCOVERY_LIMITS, callsPerInvestigation: 3 };
  const dd = { ...d, limits };
  assert.equal((await readRepoFile({ investigationId: id, by: 'pm-1', path: 'README.md' }, dd)).ok, true);
  assert.equal((await readRepoFile({ investigationId: id, by: 'pm-1', path: 'README.md' }, dd)).ok, true);
  const before = d.calls.length;
  const over = await readRepoFile({ investigationId: id, by: 'pm-1', path: 'README.md' }, dd);
  assert.equal(over.ok, false);
  assert.match(over.error, /read budget of this investigation \(3 calls\) is used/);
  assert.equal(d.calls.length, before);
});

test('the site budget per hour is enforced across investigations', async () => {
  const store = memStore();
  const gh = github();
  const limits = { ...DISCOVERY_LIMITS, callsPerSiteHour: 2 };
  const d = { ...deps(gh, store), limits };
  assert.equal((await startInvestigation(START, d)).ok, true);
  // Three people: one person has one open investigation at a time; the site budget is shared.
  assert.equal((await startInvestigation({ ...START, by: 'pm-2', symptom: 'The Send button is gone on my phone.' }, d)).ok, true);
  const third = await startInvestigation({ ...START, by: 'pm-3', symptom: 'A third symptom.' }, d);
  assert.equal(third.ok, false);
  assert.match(third.error, /site read budget \(2 GitHub calls an hour\) is used/);
  assert.equal(gh.calls.length, 2);
  // The refused start gave back its investigation slot: nothing half-made stays.
  assert.ok(![...store.map.keys()].some((k) => k.startsWith('investigation:') && store.map.get(k).symptom === 'A third symptom.' && store.map.get(k).commit));
});

test('another person cannot use the investigation, and an unknown id is refused', async () => {
  const { d, id } = await started();
  assert.match((await readRepoFile({ investigationId: id, by: 'pm-2', path: 'README.md' }, d)).error, /another person/);
  assert.match((await readRepoFile({ investigationId: 'INV-none', by: 'pm-1', path: 'README.md' }, d)).error, /no investigation/);
});

test('every call is logged per investigation', async () => {
  const { d, id } = await started();
  await listRepoFiles({ investigationId: id, by: 'pm-1' }, d);
  await readRepoFile({ investigationId: id, by: 'pm-1', path: 'src/bank/ledger.py', startLine: 250 }, d);
  await readRepoFile({ investigationId: id, by: 'pm-1', path: 'src/bank/none.py' }, d);
  await readCiResults({ investigationId: id, by: 'pm-1' }, d);
  const log = await readsOf(id, d);
  assert.deepEqual(log.map((e) => [e.action, e.status]), [
    ['start-investigation', 'ok'], ['list-repo-files', 'ok'], ['read-repo-file', 'ok'], ['read-repo-file', 'not_found'], ['read-ci-results', 'ok'],
  ]);
  assert.deepEqual([log[2].path, log[2].from, log[2].to], ['src/bank/ledger.py', 250, 450]);
});

test('read-ci-results gives conclusions only, never commit messages', async () => {
  const runs = [{ id: 9, name: 'CI', path: '.github/workflows/ci.yml', event: 'push', status: 'completed', conclusion: 'failure', created_at: '2026-11-20T08:00:00Z', head_sha: COMMIT, head_commit: { message: 'style(web): adjust the layout' }, display_title: 'style(web): adjust the layout' }];
  const { d, id } = await started(deps(github({ runs })));
  const r = await readCiResults({ investigationId: id, by: 'pm-1' }, d);
  assert.equal(r.ok, true);
  assert.deepEqual(r.runs, [{ id: 9, name: 'CI', path: '.github/workflows/ci.yml', event: 'push', status: 'completed', conclusion: 'failure', createdAt: '2026-11-20T08:00:00Z' }]);
  assert.ok(!JSON.stringify(r).includes('adjust'));
  const s = await started();
  const none = await readCiResults({ investigationId: s.id, by: 'pm-1' }, s.d);
  assert.equal(none.ok, true);
  assert.deepEqual(none.runs, []);
  assert.match(none.note, /no CI run/);
});

// f2: the finding record.
const FINDING = {
  kind: 'defect',
  hypothesis: 'withdraw checks the balance before the write transaction, so two withdrawals of 80.00 from 100.00 can both pass.',
  citations: [{ file: 'src/bank/ledger.py', line: 255 }],
  reproducer: { testName: 'test_two_processes_withdraw_at_once', file: 'tests/test_ledger.py', asserts: 'only one of two withdrawals of 80.00 from 100.00 succeeds' },
  severity: { level: 'high', reason: 'the balance can go below zero' },
  priority: { level: 'P1', reason: 'money is lost' },
  openQuestions: ['Did the customer use two devices?'],
};
async function withRead() {
  const s = await started();
  await readRepoFile({ investigationId: s.id, by: 'pm-1', path: 'src/bank/ledger.py', startLine: 200 }, s.d);
  // A defect finding needs the CI read (19 Nov).
  await readCiResults({ investigationId: s.id, by: 'pm-1' }, s.d);
  return s;
}

test('record-finding saves a grounded finding once, as unconfirmed, with an audit event', async () => {
  const { d, id } = await withRead();
  const r = await recordFinding({ investigationId: id, by: 'pm-1', finding: JSON.stringify(FINDING) }, d);
  assert.equal(r.ok, true, r.error);
  assert.match(r.findingId, /^F-/);
  assert.equal(r.status, 'unconfirmed');
  const stored = await d.store.get(`finding:${r.findingId}`);
  assert.equal(stored.status, 'unconfirmed');
  assert.equal(stored.symptom, START.symptom);
  assert.deepEqual(stored.filesRead, ['src/bank/ledger.py']);
  assert.equal(d.audit.at(-1).event, 'finding.recorded');
  const again = await recordFinding({ investigationId: id, by: 'pm-1', finding: JSON.stringify(FINDING) }, d);
  assert.equal(again.findingId, r.findingId);
  assert.equal(again.duplicate, true);
  assert.equal(d.audit.filter((e) => e.event === 'finding.recorded').length, 1);
});

test('record-finding refuses an ungrounded citation, an invented number, "reproduced" and bad input', async () => {
  const { d, id } = await withRead();
  const cases = [
    [{ ...FINDING, citations: [{ file: 'src/bank/ledger.py', line: 120 }] }, /src\/bank\/ledger.py:120 was not in a read/],
    [{ ...FINDING, citations: [{ file: 'src/bank/api.py', line: 3 }] }, /src\/bank\/api.py:3 was not in a read/],
    [{ ...FINDING, hypothesis: 'withdraw waits 25 ms before the write, so two withdrawals pass.' }, /25 is not in the symptom or in a read/],
    [{ ...FINDING, status: 'reproduced' }, /only a CI report/],
    [{ ...FINDING, citations: [] }, /cite at least one line/],
    [{ ...FINDING, reproducer: { testName: 'two withdrawals', file: 'tests/test_ledger.py', asserts: 'x' } }, /testName/],
    [{ ...FINDING, reproducer: { ...FINDING.reproducer, file: 'seeds/x.py' } }, /reproducer file/],
    [{ ...FINDING, kind: 'maybe' }, /kind/],
    [{ ...FINDING, severity: { level: 'huge', reason: 'x' } }, /severity/],
  ];
  for (const [finding, error] of cases) {
    const r = await recordFinding({ investigationId: id, by: 'pm-1', finding: JSON.stringify(finding) }, d);
    assert.equal(r.ok, false, JSON.stringify(finding));
    assert.match(r.error, error);
  }
  assert.match((await recordFinding({ investigationId: id, by: 'pm-1', finding: '{not json' }, d)).error, /one JSON object/);
  assert.match((await recordFinding({ investigationId: id, by: 'pm-2', finding: JSON.stringify(FINDING) }, d)).error, /another person/);
  assert.equal(d.audit.filter((e) => e.event === 'finding.recorded').length, 0);
});

test('a no-defect finding needs no citation or reproducer, and keeps its open questions', async () => {
  const { d, id } = await started();
  const r = await recordFinding({ investigationId: id, by: 'pm-1', finding: JSON.stringify({ kind: 'no_defect', hypothesis: 'The reads show no fault; the customer may have used an old link.', openQuestions: ['Which page did the customer open?'] }) }, d);
  assert.equal(r.ok, true, r.error);
  assert.equal((await d.store.get(`finding:${r.findingId}`)).kind, 'no_defect');
});

// Discovery round 1 (19 Nov): the model sent the right line with a wrong key; the refusal read
// "undefined:181 was not in a read" and piled dependent errors on it. The shape is checked first
// and the refusal names the wrong key. No check is loosened.
test('a citation with a wrong key is refused by name, with no dependent errors', async () => {
  const { d, id } = await withRead();
  const finding = { ...FINDING, citations: [{ path: 'src/bank/ledger.py', line: 255 }] };
  const r = await recordFinding({ investigationId: id, by: 'pm-1', finding: JSON.stringify(finding) }, d);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'citations[0] needs keys file, line; got keys: path, line');
  assert.doesNotMatch(r.error, /undefined|not in a read|invent a number|cite at least one/);
});

test('each part of the finding names its missing or wrong keys', async () => {
  const { d, id } = await withRead();
  const cases = [
    [{ ...FINDING, citations: 'src/bank/ledger.py:255' }, 'citations must be a list of { file, line }; got a string'],
    [{ ...FINDING, citations: [{ file: 'src/bank/ledger.py', line: 'near the top' }] }, 'citations[0].line must be a whole number; got "near the top"'],
    [{ ...FINDING, reproducer: { name: 'test_two_withdrawals', file: 'tests/test_ledger.py' } }, 'reproducer needs keys file, testName, asserts; got keys: name, file'],
    [{ ...FINDING, reproducer: 'test_two_withdrawals' }, 'reproducer must be { file, testName, asserts }; got a string'],
    [{ ...FINDING, severity: 'high' }, 'severity must be { level: critical | high | medium | low, reason }; got a string'],
    [{ ...FINDING, priority: { level: 'P1' } }, 'priority needs keys level, reason; got keys: level'],
    [{ ...FINDING, hypothesis: undefined }, 'hypothesis must be text of at most 600 characters'],
  ];
  for (const [finding, error] of cases) {
    const r = await recordFinding({ investigationId: id, by: 'pm-1', finding: JSON.stringify(finding) }, d);
    assert.equal(r.ok, false, JSON.stringify(finding));
    assert.equal(r.error, error);
  }
});

test('with the shape right, every grounding check still applies', async () => {
  const { d, id } = await withRead();
  const ungrounded = { ...FINDING, citations: [{ file: 'src/bank/ledger.py', line: 120 }], hypothesis: 'withdraw waits 25 ms.' };
  const r = await recordFinding({ investigationId: id, by: 'pm-1', finding: JSON.stringify(ungrounded) }, d);
  assert.match(r.error, /src\/bank\/ledger.py:120 was not in a read/);
  assert.match(r.error, /25 is not in the symptom or in a read/);
  const ok = await recordFinding({ investigationId: id, by: 'pm-1', finding: JSON.stringify(FINDING) }, d);
  assert.equal(ok.ok, true, ok.error);
  assert.equal((await d.store.get(`finding:${ok.findingId}`)).status, 'unconfirmed');
});

// Dev check 19 Nov: on the control, the model opened a second investigation with a symptom it
// wrote itself and grounded a finding in it. One open investigation per person; the finding
// carries the symptom it answers.
test('a second start with another symptom is refused while an investigation is open, with no call and no slot', async () => {
  const { d, id } = await started();
  const before = d.calls.length;
  const r = await startInvestigation({ ...START, symptom: 'The test test_statement_running_balance fails with a runtime error.' }, d);
  assert.equal(r.ok, false);
  assert.equal(r.error, `an investigation is open: ${id}; record a finding for it first`);
  assert.equal(d.calls.length, before);
  assert.equal([...d.store.map.keys()].filter((k) => k.startsWith('investigation:')).length, 1);
  const same = await startInvestigation(START, d);
  assert.equal(same.ok, true);
  assert.equal(same.investigationId, id);
  assert.equal(same.duplicate, true);
  // Another person has an investigation of their own.
  const other = await startInvestigation({ ...START, by: 'pm-2', symptom: 'Another report.' }, d);
  assert.equal(other.ok, true, other.error);
});

test('after a recorded finding the person can start the next investigation', async () => {
  const { d, id } = await withRead();
  const f = await recordFinding({ investigationId: id, by: 'pm-1', finding: JSON.stringify(FINDING) }, d);
  assert.equal(f.ok, true, f.error);
  const next = await startInvestigation({ ...START, symptom: 'A second, different report.' }, d);
  assert.equal(next.ok, true, next.error);
  assert.notEqual(next.investigationId, id);
});

test('a start that GitHub refuses leaves no open investigation', async () => {
  const d = deps(github({ rateLimited: true }));
  const r = await startInvestigation(START, d);
  assert.equal(r.ok, false);
  const d2 = { ...d, get: github().get };
  const next = await startInvestigation({ ...START, symptom: 'Another report.' }, d2);
  assert.equal(next.ok, true, next.error);
});

test('the recorded finding carries the symptom of its investigation, word for word', async () => {
  const { d, id } = await withRead();
  const f = await recordFinding({ investigationId: id, by: 'pm-1', finding: JSON.stringify(FINDING) }, d);
  assert.equal((await d.store.get(`finding:${f.findingId}`)).symptom, START.symptom);
});

// Review of PR 44: an open investigation with no finding must not lock a person for ever. The
// open pointer has an age limit (DISCOVERY_LIMITS.openMaxMs, 24 h from its start, read with
// d.now()); after it, a new start replaces the pointer.
test('an open investigation older than the age limit no longer blocks a new start', async () => {
  assert.equal(DISCOVERY_LIMITS.openMaxMs, 24 * 60 * 60 * 1000);
  const saved = clock;
  try {
    const { d, id } = await started();
    const other = { ...START, symptom: 'A later, different report.' };
    clock = saved + DISCOVERY_LIMITS.openMaxMs - 1;
    const early = await startInvestigation(other, d);
    assert.equal(early.error, `an investigation is open: ${id}; record a finding for it first`);
    clock = saved + DISCOVERY_LIMITS.openMaxMs;
    const late = await startInvestigation(other, d);
    assert.equal(late.ok, true, late.error);
    assert.notEqual(late.investigationId, id);
    // The new investigation is now the open one.
    const third = await startInvestigation({ ...START, symptom: 'A third report.' }, d);
    assert.equal(third.error, `an investigation is open: ${late.investigationId}; record a finding for it first`);
  } finally {
    clock = saved;
  }
});

test('an open pointer with no start time is treated as expired', async () => {
  const { d } = await started();
  for (const [k, v] of d.store.map) if (k.startsWith('inv-open:')) d.store.map.set(k, { id: v.id });
  const next = await startInvestigation({ ...START, symptom: 'Another report.' }, d);
  assert.equal(next.ok, true, next.error);
});

// Dev check 19 Nov (D-3): the model claimed that an existing test fails and proposed that test
// as its reproducer. Nothing the tools return can show a test failing (read-ci-results gives
// workflow runs only), so such a claim is ungrounded. A defect finding also needs the CI read.
const READ_TESTS = 'def test_statement_running_balance():\n    assert True\n\n\ndef test_two_withdrawals_pass():\n    assert True\n';
async function withReads() {
  const s = await started(deps(github({ extraFiles: { 'tests/test_api.py': READ_TESTS } })));
  await readRepoFile({ investigationId: s.id, by: 'pm-1', path: 'src/bank/ledger.py', startLine: 200 }, s.d);
  await readRepoFile({ investigationId: s.id, by: 'pm-1', path: 'tests/test_api.py' }, s.d);
  return s;
}
const record = (s, finding) => recordFinding({ investigationId: s.id, by: 'pm-1', finding: JSON.stringify(finding) }, s.d);

// B1 was dropped (lead, 19 Nov): a forced call that returns nothing adds no evidence.
test('a defect finding does not need a read of the CI results', async () => {
  const s = await withReads();
  const r = await record(s, FINDING);
  assert.equal(r.ok, true, r.error);
});

test('the failing-test refusal says so when the CI run on the commit concluded success', async () => {
  const run = { id: 9, name: 'CI', path: '.github/workflows/ci.yml', event: 'push', status: 'completed', conclusion: 'success', created_at: '2026-11-20T08:00:00Z' };
  const s = await started(deps(github({ extraFiles: { 'tests/test_api.py': READ_TESTS }, runs: [run] })));
  await readRepoFile({ investigationId: s.id, by: 'pm-1', path: 'src/bank/ledger.py', startLine: 200 }, s.d);
  await readRepoFile({ investigationId: s.id, by: 'pm-1', path: 'tests/test_api.py' }, s.d);
  const claim = { ...FINDING, hypothesis: "The test 'test_statement_running_balance' fails because of the window function." };
  assert.equal((await record(s, claim)).error, 'test_statement_running_balance is an existing test, and no read shows it fails; cite the code instead');
  await readCiResults({ investigationId: s.id, by: 'pm-1' }, s.d);
  assert.equal((await record(s, claim)).error, 'test_statement_running_balance is an existing test, and no read shows it fails; cite the code instead; the CI run on this commit concluded success');
});

test('a reproducer may not be a test that a read shows exists', async () => {
  const s = await withReads();
  await readCiResults({ investigationId: s.id, by: 'pm-1' }, s.d);
  const r = await record(s, { ...FINDING, reproducer: { ...FINDING.reproducer, testName: 'test_statement_running_balance' } });
  assert.equal(r.error, 'test_statement_running_balance already exists in tests/test_api.py; a reproducer is a new test that fails on the current code');
});

test('a hypothesis that an existing test fails is refused; naming a test without a failure word is not', async () => {
  const s = await withReads();
  await readCiResults({ investigationId: s.id, by: 'pm-1' }, s.d);
  for (const h of [
    "The test 'test_statement_running_balance' fails because the statement query uses a window function.",
    'test_two_withdrawals_pass is broken. withdraw checks the balance before the write transaction.',
  ]) {
    const r = await record(s, { ...FINDING, hypothesis: h });
    assert.match(r.error, /is an existing test, and no read shows it fails; cite the code instead/, h);
  }
  const ok = await record(s, { ...FINDING, hypothesis: `${FINDING.hypothesis} test_two_withdrawals_pass covers one withdrawal only.` });
  assert.equal(ok.ok, true, ok.error);
});

test('a no-defect finding with a wording proposal is recorded with no CI read', async () => {
  const s = await withReads();
  const r = await record(s, {
    kind: 'no_defect',
    hypothesis: 'There is no defect: the refusal of a transfer between two currencies is by design. The message could say that the currencies differ.',
    openQuestions: ['Should the message name the currency of each account?'],
  });
  assert.equal(r.ok, true, r.error);
});
