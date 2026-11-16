// Score the frozen benchmark cases for A1, A2 and C (CASES.md, sections 1 to 4).
//
//   node score.mjs --app <agile-team checkout> --out <evidence dir> --manifest a.json [--manifest b.json]
//
// C runs the app's own decide() (src/verify-claim.js) against a simulated GitHub that serves the
// evidence `run_ci.py` produced for each case branch. GitHub-side facts that cannot be produced
// locally come from the case manifest and are marked "simulated" in the result. A1 and A2 apply
// the declared protection rules to the same CI results. No network call is made.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name) => args.filter((_, i) => args[i - 1] === name);
const APP = resolve(opt('--app')[0]);
const OUT = resolve(opt('--out')[0]);
const manifests = opt('--manifest').flatMap((p) => JSON.parse(readFileSync(p, 'utf8')));
const imp = (p) => import(pathToFileURL(join(APP, p)).href);
const { decide, VERIFY_CONFIG } = await imp('src/verify-claim.js');
const { collectGithub, collectPrStats } = await imp('src/github-evidence.js');
const { arbitrate } = await imp('src/arbitration.js');

const REPO = 'ysant77/yms-bank-demo';
const API = 'https://api.github.com';
const CI_PATH = '.github/workflows/ci.yml';
const BOT = { login: 'github-actions[bot]', id: 41898282, type: 'Bot' };
const T0 = Date.parse('2026-11-16T10:00:00Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const mainReport = readJson(join(OUT, 'BASE', 'report.json'));

function evidenceOf(branch) {
  const dir = join(OUT, branch.replaceAll('/', '_'));
  return { report: readJson(join(dir, 'report.json')), meta: readJson(join(dir, 'meta.json')) };
}

// ---- A1 and A2: rule evaluation (CASES.md section 1) ----
// Frozen A2: code owners on tests/ and the paths below. A2s (post-hoc sensitivity, not scored):
// owners on test-support paths only (conftest, non-test files under tests/, CI, scripts, config).
const SUPPORT_ONLY = (f) => f.startsWith('.github/') || f.endsWith('conftest.py') || f === 'pyproject.toml' ||
  f === 'uv.lock' || f.startsWith('scripts/') || (f.startsWith('tests/') && !/\/test_[^/]*\.py$/.test(f));
const OWNED = (f) => f.startsWith('.github/') || f.startsWith('tests/') || f.endsWith('conftest.py') ||
  f === 'pyproject.toml' || f === 'uv.lock' || f.startsWith('scripts/');
const files = (meta) => (meta?.files ?? []).flatMap((f) => [f.filename, ...(f.previous_filename ? [f.previous_filename] : [])]);

// perTest: true = "a test that the PR adds or changes" read per test (new id, or its def line added
// or removed); false = every test row of the changed test files, as scripts/repro.py copies them.
function armA(c, ev, hardened, owners = OWNED, perTest = true) {
  const g = c.github ?? {};
  const s = ev.meta?.steps ?? {};
  const why = [];
  if (s.tests_rc !== 0) why.push(`tests exit ${s.tests_rc}`);
  if (s.lint_rc !== 0) why.push('lint fails');
  if (g.staleHead) why.push('required checks pending on the new head');
  if (g.baseMovedTo) why.push('branch not up to date with the base');
  if (hardened) {
    const repro = ev.report?.repro;
    if (!repro || (repro.tests.length && repro.base_run?.report !== true)) why.push('repro job: no base report');
    // "A test that the PR adds or changes": its id is new against the base report, or its
    // def line is added or removed in the PR's diff of that file.
    const baseIds = new Set((mainReport?.tests ?? []).map((t) => t.id));
    const patchOf = Object.fromEntries((ev.meta?.files ?? []).map((f) => [f.filename, f.patch ?? '']));
    const touched = (t) => {
      if (!baseIds.has(t.id)) return true;
      const [file, ...rest] = t.id.split('::');
      const fn = rest.join('::').split('[')[0].split('::').pop();
      const patch = patchOf[file] ?? '';
      return patch.split('\n').some((l) => /^[+-]/.test(l) && l.includes(`def ${fn}(`));
    };
    for (const t of (repro?.tests ?? []).filter((t) => !perTest || touched(t))) {
      if (!(t.base?.outcome === 'failed' && t.base?.exc_type === 'AssertionError')) {
        why.push(`repro job: ${t.id} on base is ${t.base?.outcome}${t.base?.exc_type ? ` (${t.base.exc_type})` : ''}`);
      }
    }
    const cov = g.noCoverageBlock ? null : ev.report?.coverage;
    if (!cov) why.push('coverage job: no coverage block');
    else {
      const ratio = cov.changed_executable ? cov.changed_covered / cov.changed_executable : 1;
      if (ratio < 0.8) why.push(`coverage job: changed lines ${(ratio * 100).toFixed(0)}%`);
      if (cov.base_total != null && cov.head_total < cov.base_total - 0.5) why.push('coverage job: total dropped');
    }
  }
  if (why.length) return { outcome: 'blocked', reason: why.join('; ') };
  if (hardened) {
    const owned = files(ev.meta).filter(owners);
    if (owned.length) return { outcome: 'human gate', reason: `code owners: ${owned.join(', ')}` };
  }
  return { outcome: 'merge', reason: 'required checks pass' };
}

// ---- C: the app on a simulated GitHub ----
function fakeGithub(c, ev, prNumber) {
  const g = c.github ?? {};
  const head = ev.meta.head;
  const prHead = g.staleHead ? `${head.slice(0, 32)}00000001` : head;
  const merged = c.claim === 'done';
  const pull = (number, extra = {}) => ({
    number, title: `${c.ticket.key} ${c.id}`, state: merged ? 'closed' : 'open', body: '',
    merged_at: merged ? at(30) : null, merge_commit_sha: merged ? head : null,
    html_url: `https://github.com/${REPO}/pull/${number}`,
    head: { ref: `case-${c.id.toLowerCase()}`, sha: prHead, repo: { full_name: g.fork ? 'someone/yms-bank-demo' : REPO } },
    ...extra,
  });
  const pulls = [pull(prNumber)];
  if (g.secondOpenPr) pulls.push(pull(prNumber + 500, { state: 'open', merged_at: null, merge_commit_sha: null, head: { ref: `draft-${c.id.toLowerCase()}`, sha: 'f'.repeat(40), repo: { full_name: REPO } } }));
  const runOk = ev.meta.steps.tests_rc === 0 && ev.meta.steps.lint_rc === 0;
  const runs = [{ name: 'CI', path: CI_PATH, head_sha: head, status: 'completed', conclusion: runOk ? 'success' : 'failure',
    created_at: at(0), updated_at: at(9), run_started_at: at(0), run_attempt: g.failedRunThenRerun || g.infraFailureThenRerun ? 2 : 1, html_url: 'x' }];
  let report = ev.report ? structuredClone(ev.report) : null;
  if (report && g.noCoverageBlock) delete report.coverage;
  if (report && g.reportEditedByUser) {
    for (const t of report.tests) if (t.outcome !== 'passed') t.outcome = 'passed';
    if (report.repro?.full_suite) report.repro.full_suite = { outcome: 'passed', passed: report.tests.length, failed: 0 };
  }
  const comments = report && !g.noBotReport
    ? [{ user: BOT, created_at: at(8), updated_at: g.reportEditedByUser ? at(120) : at(9),
        body: `<!-- aat-ci-report -->\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\`` }]
    : [];
  // After a merge the main report is the merge commit's report (fast-forward merge here).
  const main = merged && report ? { ...report, head_sha: head } : mainReport;
  const prFiles = ev.meta.files.map((f) => ({ filename: f.filename, previous_filename: f.previous_filename, patch: f.patch }));
  const page = (u) => Number(new URL(u).searchParams.get('page') ?? 1);
  const routes = [
    [/\/pulls\?/, (u) => (page(u) === 1 ? pulls : [])],
    [/\/actions\/runs\?head_sha=/, (u) => (g.runs404 ? 404 : { workflow_runs: page(u) === 1 ? runs : [] })],
    [/\/issues\/\d+\/comments/, (u) => (page(u) === 1 ? comments : [])],
    [/\/pulls\/\d+\/files/, (u) => (g.filesTruncated
      ? Array.from({ length: 100 }, (_, i) => ({ filename: `src/gen/f${page(u)}_${i}.py`, patch: '' }))
      : page(u) === 1 ? prFiles.slice(0, 100) : prFiles.slice((page(u) - 1) * 100, page(u) * 100))],
    [/\/pulls\/\d+$/, () => ({ additions: ev.meta.additions, deletions: ev.meta.deletions })],
    [/\/check-runs/, () => ({ check_runs: [{ name: 'CodeQL', app: { slug: 'github-advanced-security', id: 57789 }, head_sha: prHead, status: 'completed', conclusion: 'success', output: { title: 'No new alerts' } }] })],
    [/\/contents\/main\.json/, () => (main ? { content: Buffer.from(JSON.stringify(main)).toString('base64') } : 404)],
  ];
  return async (url) => {
    const hit = routes.find(([p]) => p.test(url));
    const body = hit ? hit[1](url) : 404;
    if (body === 404) return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
    return { ok: true, status: 200, json: async () => body, headers: { get: () => '4999' } };
  };
}

async function armC(c, ev, n) {
  const fetchFn = fakeGithub(c, ev, 1000 + n);
  const d = {
    collectJira: async () => structuredClone(c.ticket),
    env: () => ({ repo: REPO, token: 'local' }),
    collectGithub, collectPrStats, fetchFn,
  };
  const claim = { id: `bench-${c.id}`, type: c.claim, text: `${c.claim} claimed for ${c.ticket.key}` };
  const { verdict } = await decide({ issueKey: c.ticket.key, claim }, d);
  const failing = verdict.checks.filter((x) => x.status !== 'pass').map((x) => `${x.name}: ${x.reason}`);
  return { outcome: verdict.result, reason: verdict.reason, checks: failing.slice(0, 6) };
}

// Two-sided cases: the gates are the app's `ready` verdict per side, then the arbitration rule.
async function armCArbitrate(c, n) {
  const sides = [];
  for (const [i, b] of c.branches.entries()) {
    const ev = evidenceOf(b);
    const side = { ...c, claim: 'ready', id: `${c.id}${'ab'[i]}` };
    const v = await armC(side, ev, n * 10 + i);
    const m = c.metric?.sides?.[i] ?? c.metric?.[b] ?? null;
    sides.push({ id: b, gatesPassed: v.outcome === 'supported', gateReason: v.reason, metrics: m,
      newFailureModes: null, newDependencies: null, diffLines: ev.meta.additions + ev.meta.deletions });
  }
  const pre = c.metric ? { metric: c.metric.name, higherIsBetter: c.metric.higherIsBetter !== false, margin: 0.1 } : null;
  const a = arbitrate({ preRegistered: pre }, sides);
  return { outcome: a.winner ? `code winner ${a.winner}` : a.recommendation ? `human (recommends ${a.recommendation.id})` : 'human', reason: a.reason, checks: sides.map((s) => `${s.id}: ${s.gatesPassed ? 'gates pass' : s.gateReason}`) };
}

const results = [];
for (const [n, c] of manifests.entries()) {
  if (c.void) {
    results.push({ id: c.id, void: c.void });
    continue;
  }
  const simulated = Object.keys(c.github ?? {}).length > 0;
  // I09-style cases carry the moved base tip as a second branch; only the first is the PR.
  if (c.branches.length > 1 && !c.github?.baseMovedTo) {
    const evs = c.branches.map(evidenceOf);
    const a1 = evs.map((e) => armA(c, e, false).outcome).join(' | ');
    const a2 = evs.map((e) => armA(c, e, true).outcome).join(' | ');
    const C = await armCArbitrate(c, n);
    results.push({ id: c.id, simulated, A1: { outcome: a1 }, A2: { outcome: a2 }, C });
    continue;
  }
  const ev = evidenceOf(c.branches[0]);
  if (!ev.meta) {
    results.push({ id: c.id, error: 'no evidence: run_ci.py not run for this branch' });
    continue;
  }
  results.push({ id: c.id, simulated, A1: armA(c, ev, false), A2: armA(c, ev, true), A2file: armA(c, ev, true, OWNED, false), A2s: armA(c, ev, true, SUPPORT_ONLY), C: await armC(c, ev, n) });
}
writeFileSync(join(OUT, 'results.json'), `${JSON.stringify(results, null, 1)}\n`);
for (const r of results) {
  if (r.void || r.error) console.log(r.id, r.void ? `VOID ${r.void}` : r.error);
  else console.log([r.id, r.A1.outcome, r.A2.outcome, r.C.outcome, r.C.reason.slice(0, 140)].join(' | '));
}
