// Deterministic checks. Each returns { name, status: 'pass' | 'fail' | 'unknown', reason }.
// No model is involved. Unknown means "cannot verify": a human or more evidence is needed.

import { namesKey, sameFiles, testName, testsByName } from './report.js';

const BOT = 'github-actions[bot]';
const result = (name, status, reason) => ({ name, status, reason });

function issueToken(key) {
  return String(key).replace('-', ''); // BANK-4 -> BANK4, used in test names
}

export const DEFAULT_WORKFLOW_PATHS = ['.github/workflows/ci.yml'];
const runPath = (r) => String(r.path ?? '').split('@')[0];

// Paths that decide how CI runs or how it writes the report. A PR that changes one of them can
// make its own CI say anything, so its CI is not evidence (DESIGN 6, review of 16 Nov).
// Entry forms: "dir/" (everything under it), "**/name" (a file with that name in any folder),
// or an exact path. Composite actions and pytest's conftest.py run inside CI, so they count.
export const DEFAULT_TRUST_PATHS = ['.github/workflows/', '.github/actions/', '.github/codeql/', '**/conftest.py'];
const matchesPath = (file, paths) => paths.some((g) => {
  if (g.endsWith('/')) return file.startsWith(g);
  if (g.startsWith('**/')) return file === g.slice(3) || file.endsWith(`/${g.slice(3)}`);
  return file === g;
});

export function pipelineChange(ctx) {
  if (!Array.isArray(ctx.prFiles)) return 'pull request file list not available';
  const paths = ctx.config?.reportTrustPaths ?? DEFAULT_TRUST_PATHS;
  const touched = ctx.prFiles.filter((f) => matchesPath(f, paths));
  return touched.length ? `PR changes ${touched.join(', ')}, which can change how CI runs or reports` : null;
}

// HEURISTIC, not a boundary (review B4c, 16 Nov). The bank CI edits its own report comment on
// every push, so an edit alone proves nothing. The comment is trusted only when its last edit
// lies inside a pinned workflow run on the head: from the run's start to 60 s after it ended.
// Someone with write access can still edit inside that window. Plan (b2) replaces this with a
// check run that no user can edit (DESIGN section 12).
const EDIT_SLACK_MS = 60 * 1000;
const HEURISTIC = 'report comment time-window heuristic';
function commentEditedLater(ctx) {
  const c = ctx.reportComment;
  if (!c?.updatedAt) return `${HEURISTIC}: comment times not available`;
  const paths = ctx.config?.requiredWorkflowPaths ?? DEFAULT_WORKFLOW_PATHS;
  const runs = (ctx.workflowRuns ?? []).filter((r) => paths.includes(runPath(r)) && r.headSha === ctx.pr?.headSha);
  if (runs.length === 0) return `${HEURISTIC}: no pinned CI run on the head, so the comment has no source`;
  const edited = Date.parse(c.updatedAt);
  const inside = runs.some((r) => {
    const start = Date.parse(r.runStartedAt ?? r.createdAt);
    const end = Date.parse(r.updatedAt ?? r.createdAt) + EDIT_SLACK_MS;
    return edited >= start && edited <= end;
  });
  return inside ? null : `${HEURISTIC}: the comment was last edited outside the pinned CI run`;
}

// Guard: a report counts only if the bot wrote it, for the PR head, with unchanged workflows.
export function reportTrusted(ctx, report = ctx.report, headSha = ctx.pr?.headSha) {
  if (!report) return result('report_trusted', 'unknown', 'no CI report');
  // The author comes from the comment that carried the report; a field in the report body is
  // written by the code under test and proves nothing.
  if (ctx.reportAuthor !== BOT) {
    return result('report_trusted', 'unknown', `report not posted by ${BOT}`);
  }
  if (headSha && report.head_sha !== headSha) {
    return result('report_trusted', 'unknown', 'report is for an older commit, not the head');
  }
  // Without the base fingerprint (ci-reports/main.json) a changed workflow cannot be seen.
  if (!ctx.baseWorkflowFiles) return result('report_trusted', 'unknown', 'no base workflow fingerprint (ci-reports/main.json)');
  if (!sameFiles(ctx.baseWorkflowFiles, report.workflow_files)) {
    return result('report_trusted', 'unknown', 'workflow changed in this PR');
  }
  if (report === ctx.report) {
    // The latest bot report can be on a comment page that was not read.
    if (ctx.truncated?.comments) return result('report_trusted', 'unknown', 'PR comment list is not complete (page limit), so the latest report is not known');
    // The fingerprint is written by the workflow under test, so the verifier also reads the PR's
    // own file list.
    const change = pipelineChange(ctx);
    if (change) return result('report_trusted', 'unknown', change);
    const edited = commentEditedLater(ctx);
    if (edited) return result('report_trusted', 'unknown', edited);
  }
  return result('report_trusted', 'pass', 'bot report for the head commit');
}

const forkReason = (ctx) => `PR ${ctx.forkPrs.map((n) => `#${n}`).join(', ')} names ${ctx.ticket.key} but comes from a fork: CI does not post its report for forks, so a person checks, or the work moves to a branch of this repository`;

export function prLinked(ctx) {
  const pr = ctx.pr;
  if (!pr && ctx.truncated?.pulls) {
    return result('pr_linked', 'unknown', `no pull request in the latest ones names ${ctx.ticket.key}; older ones were not read (page limit)`);
  }
  if (!pr && ctx.forkPrs?.length) return result('pr_linked', 'unknown', forkReason(ctx));
  if (!pr) return result('pr_linked', 'fail', `no pull request names ${ctx.ticket.key}`);
  // Two open or merged PRs that name the key: code cannot tell which one the claim means.
  if ((ctx.prCandidates ?? []).length > 1) {
    return result('pr_linked', 'unknown', `PRs ${ctx.prCandidates.map((n) => `#${n}`).join(', ')} all name ${ctx.ticket.key}; link one PR`);
  }
  const named = namesKey(pr.title, ctx.ticket.key) || namesKey(pr.branch, ctx.ticket.key);
  if (!named) return result('pr_linked', 'fail', `PR #${pr.number} does not name ${ctx.ticket.key}`);
  if (pr.state === 'closed' && !pr.merged) {
    return result('pr_linked', 'fail', `PR #${pr.number} is closed without merge`);
  }
  // "fixed" and "ready" mean the change is done on its branch; "merged" is its own claim type.
  const open = pr.state === 'open' ? ' (open, not merged)' : '';
  return result('pr_linked', 'pass', `PR #${pr.number} names ${ctx.ticket.key}${open}`);
}

// The pinned workflow files whose runs decide ci_green. A run is matched by its workflow file,
// never by its display name: a PR can add another workflow that is also named "CI".

export function ciGreen(ctx) {
  const required = ctx.config?.requiredWorkflowPaths ?? DEFAULT_WORKFLOW_PATHS;
  const head = ctx.pr?.headSha;
  if (!head) return result('ci_green', 'unknown', 'no head commit');
  const change = pipelineChange(ctx);
  if (change) return result('ci_green', 'unknown', change);
  // A failed run can be on a page that was not read.
  if (ctx.truncated?.runs) return result('ci_green', 'unknown', `workflow run list for ${head.slice(0, 7)} is not complete (page limit)`);
  const reasons = [];
  let unknown = false;
  for (const path of required) {
    // Every run of the pinned workflow on the head must succeed; a later success does not
    // hide an earlier failure.
    const runs = (ctx.workflowRuns ?? []).filter((r) => runPath(r) === path && r.headSha === head);
    const failed = runs.find((r) => r.status === 'completed' && r.conclusion !== 'success');
    if (failed) return result('ci_green', 'fail', `${path} concluded ${failed.conclusion} on ${head.slice(0, 7)}`);
    if (runs.length === 0 || runs.some((r) => r.status !== 'completed')) {
      unknown = true;
      reasons.push(`${path}: no completed run for ${head.slice(0, 7)}`);
    } else {
      reasons.push(`${path}: success`);
    }
  }
  return result('ci_green', unknown ? 'unknown' : 'pass', reasons.join('; '));
}

export function testPasses(ctx, name, report = ctx.report) {
  const trust = reportTrusted(ctx, report, report === ctx.report ? ctx.pr?.headSha : undefined);
  const label = `test_passes(${name})`;
  if (trust.status !== 'pass') return result(label, 'unknown', trust.reason);
  const tests = testsByName(report, name);
  if (tests.length === 0) return result(label, 'fail', `${name} is missing from the report`);
  const bad = tests.filter((t) => t.outcome !== 'passed');
  if (bad.length) return result(label, 'fail', `${name}: ${bad[0].outcome}`);
  return result(label, 'pass', `${name} passed`);
}

export function bugTestExists(ctx) {
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result('bug_test_exists', 'unknown', trust.reason);
  // The key token at a boundary: test_BANK1_x names BANK-1, test_ABANK1_x does not.
  const token = new RegExp(`(^|[^A-Za-z0-9])${issueToken(ctx.ticket.key)}_`);
  const tests = (ctx.report.tests ?? []).filter((t) => token.test(testName(t.id)));
  if (tests.length === 0) {
    return result('bug_test_exists', 'fail', `no test named for ${ctx.ticket.key}: the change may be right, but nothing proves it`);
  }
  const failed = tests.find((t) => t.outcome !== 'passed');
  if (failed) return result('bug_test_exists', 'fail', `${testName(failed.id)}: ${failed.outcome}`);
  return result('bug_test_exists', 'pass', `${tests.length} test(s) for ${ctx.ticket.key} passed`);
}

// Words in an added test line that can change a recorded metric without naming it.
const TAMPER = /perf_counter|monotonic|time\.time|\bstash\b|pytest_sessionfinish|pytest_runtest|record_metric|record_samples|ci_report|COLLECTOR|\.metrics\b|xfail|deselect/;

export function metricIntegrity(ctx, name) {
  const failed = (ctx.report.tests ?? []).filter((t) => t.outcome === 'failed' || t.outcome === 'error');
  if (failed.length) return `${failed.length} test(s) failed in the report run, so its metrics are not trusted`;
  if (Array.isArray(ctx.workflowRuns) && ctx.workflowRuns.length && ciGreen(ctx).status !== 'pass') {
    return 'the CI run for the head is not green';
  }
  const files = ctx.prFiles ?? [];
  const conftest = files.filter((f) => f.split('/').pop() === 'conftest.py');
  if (conftest.length) return `PR changes ${conftest.join(', ')}, which can change any test or metric`;
  const benchFile = (ctx.config?.benchmarks?.[name]?.test ?? '').split('::')[0];
  const quoted = new RegExp(`["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
  for (const file of files.filter((f) => f.startsWith('tests/') && f.endsWith('.py') && f !== benchFile)) {
    const patch = ctx.prPatches?.[file];
    if (patch === undefined || patch === null) return `the diff of ${file} is not available`;
    const added = patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    const hit = added.find((l) => quoted.test(l) || TAMPER.test(l));
    if (hit) return `${file} adds a line that names ${name} or touches how metrics are measured: ${hit.slice(1).trim().slice(0, 80)}`;
  }
  return null;
}

// Guarded paths ignore case. A folder entry ("src/bank/testing/") covers everything under it; a
// file entry ("src/fraud/evaluate.py") also covers a file of that name in any sub-folder of its
// folder (unit 2 review, item 11).
function guardedMatch(file, entry) {
  const f = String(file).toLowerCase();
  const g = String(entry).toLowerCase();
  if (g.endsWith('/')) return f.startsWith(g);
  if (f === g) return true;
  const cut = g.lastIndexOf('/');
  return f.startsWith(g.slice(0, cut + 1)) && f.endsWith(`/${g.slice(cut + 1)}`);
}

// A too-good limit for "auc" also covers pr_auc, roc_auc and AUC: the key matches the whole name
// or its last underscore part, without case (unit 2 review, item 11).
function tooGoodLimit(limits, name) {
  const n = String(name).toLowerCase();
  for (const [key, limit] of Object.entries(limits ?? {})) {
    const k = key.toLowerCase();
    if (n === k || n.endsWith(`_${k}`)) return limit;
  }
  return undefined;
}

export function metricCompare(ctx, name, bound, direction) {
  const label = `metric_${direction === 'min' ? 'at_least' : 'at_most'}(${name}, ${bound})`;
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result(label, 'unknown', trust.reason);
  // A metric is written by the code under test, so the plugin's write-once rule is no trust
  // boundary (the stash, a sessionfinish hook, an xfail or a patched clock can all change it).
  // The gate needs a green run with no failed test, no conftest.py in the diff, and no added
  // test line that names the metric or touches how it is measured; otherwise a human reviews.
  const integrity = metricIntegrity(ctx, name);
  if (integrity) return result(label, 'unknown', `${integrity}: human review`);
  // A repeated benchmark reports {median, iqr_low, iqr_high, runs}; the gate uses the median.
  const raw = ctx.report.metrics?.[name];
  const value = typeof raw === 'number' ? raw : typeof raw?.median === 'number' ? raw.median : undefined;
  if (typeof value !== 'number') return result(label, 'fail', `${name} not reported`);
  const shown = typeof raw === 'number' ? `${value}` : `median ${value} (IQR ${raw.iqr_low ?? '?'} to ${raw.iqr_high ?? '?'}${raw.runs ? `, ${raw.runs} runs` : ''})`;
  // Metrics are written by the code under test. A PR that changes how they are measured
  // cannot pass a metric gate by itself (DESIGN.md section 12, risk 12).
  const guardedPaths = ctx.config?.guardedPaths ?? [];
  if (guardedPaths.length) {
    if (!Array.isArray(ctx.prFiles)) return result(label, 'unknown', 'pull request file list not available');
    const touched = ctx.prFiles.filter((f) => guardedPaths.some((g) => guardedMatch(f, g)));
    if (touched.length) {
      return result(label, 'unknown', `PR changes ${touched.join(', ')}, which can change how ${name} is measured: human review`);
    }
  }
  const bench = ctx.config?.benchmarks?.[name];
  if (bench) {
    if (typeof raw !== 'object' || raw === null) {
      return result(label, 'unknown', `${name} is a registered benchmark but was reported as one number, not as repeated runs: human review`);
    }
    if (raw.runs !== bench.runs) {
      return result(label, 'unknown', `${name} has ${raw.runs ?? 'no'} runs; ${bench.runs} are registered: human review`);
    }
    const touched = (ctx.prFiles ?? []).filter((f) => (ctx.config.benchmarkGuardedPaths ?? []).some((g) => (g.endsWith('/') ? f.startsWith(g) : f === g)));
    if (touched.length) {
      return result(label, 'unknown', `PR changes ${touched.join(', ')}, which can change how ${name} is measured: human review`);
    }
    const run = (ctx.report.tests ?? []).find((t) => t.id === bench.test);
    if (!run || run.outcome !== 'passed') {
      return result(label, 'unknown', `benchmark test ${bench.test} is ${run ? run.outcome : 'missing'} in the report: human review`);
    }
  }
  // Drift metrics compare two datasets; equal data hashes make the number meaningless.
  const hashes = ctx.report.data_hashes;
  if (/^psi/i.test(name) && hashes?.train && hashes.train === hashes.live) {
    return result(label, 'unknown', 'data hashes for training and live data are equal: the drift number compares a dataset with itself');
  }
  const guard = tooGoodLimit(ctx.config?.tooGood, name);
  if (guard !== undefined && value > guard) {
    return result(label, 'unknown', `${name} = ${shown} is above ${guard}: too good, human review`);
  }
  const ok = direction === 'min' ? value >= bound : value <= bound;
  return result(label, ok ? 'pass' : 'fail', `${name} = ${shown}`);
}

function compareVersions(a, b) {
  const pa = String(a).split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b).split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

export function versionAtLeast(ctx, pkg, version) {
  const label = `version_at_least(${pkg}, ${version})`;
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result(label, 'unknown', trust.reason);
  const found = ctx.report.deps?.[pkg];
  if (!found) return result(label, 'fail', `${pkg} not in the lock file`);
  return result(label, compareVersions(found, version) >= 0 ? 'pass' : 'fail', `${pkg} ${found}`);
}

export function pathAbsent(ctx, path) {
  const label = `path_absent(${path})`;
  if (!Array.isArray(ctx.headPaths)) return result(label, 'unknown', 'head tree not read');
  return ctx.headPaths.includes(path)
    ? result(label, 'fail', `${path} is still on the head commit`)
    : result(label, 'pass', `${path} is not on the head commit`);
}

export function subtasksDone(ctx) {
  const subtasks = ctx.ticket.subtasks ?? [];
  if (subtasks.length === 0) return result('subtasks_done', 'pass', 'no sub-tasks');
  const open = subtasks.filter((s) => s.statusCategory !== 'done');
  return open.length
    ? result('subtasks_done', 'fail', `not done: ${open.map((s) => s.key).join(', ')}`)
    : result('subtasks_done', 'pass', `${subtasks.length} sub-task(s) done`);
}

export function blockedByDone(ctx) {
  const blockers = (ctx.ticket.links ?? []).filter((l) => l.type === 'is blocked by');
  const open = blockers.filter((l) => l.statusCategory !== 'done');
  return open.length
    ? result('blocked_by_done', 'fail', `blocked by open ${open.map((l) => l.key).join(', ')}`)
    : result('blocked_by_done', 'pass', `${blockers.length} blocker(s) done`);
}

export function deployed(ctx, tag) {
  const label = `deployed(${tag ?? 'any'})`;
  const runs = (ctx.deployRuns ?? [])
    .filter((r) => !tag || r.tag === tag)
    .filter((r) => !ctx.fixAt || String(r.createdAt) >= String(ctx.fixAt))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const latest = runs[0];
  if (!latest) return result(label, 'unknown', 'no deploy run yet');
  if (latest.conclusion !== 'success') {
    return result(label, 'fail', `latest deploy ${latest.tag ?? ''} concluded ${latest.conclusion}`);
  }
  return result(label, 'pass', `deploy ${latest.tag ?? ''} succeeded at ${latest.createdAt}`);
}

export function testsNotRemoved(ctx, report = ctx.report) {
  if (!ctx.baseReport || !report) return result('tests_not_removed', 'unknown', 'base or head report missing');
  const head = new Set((report.tests ?? []).map((t) => testName(t.id)));
  const approved = new Set(ctx.ticket.approvedTestRemovals ?? []);
  // The base side: the main report, and the base test ids of every test module the PR changes,
  // renames or removes (repro block). After a merge the main report is the merge commit's, so the
  // repro ids are what still show a dropped test (benchmark I10).
  const baseIds = [...(ctx.baseReport.tests ?? []).map((t) => t.id), ...(report.repro?.base_test_ids ?? [])];
  const removed = [...new Set(baseIds.map((id) => testName(id)))].filter(
    (n) => !head.has(n) && !approved.has(n),
  );
  return removed.length
    ? result('tests_not_removed', 'fail', `removed without approval: ${removed.join(', ')}`)
    : result('tests_not_removed', 'pass', 'no test removed');
}

export function migrationAdditive(ctx, number) {
  const label = `migration_additive(${number})`;
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result(label, 'unknown', trust.reason);
  const migration = (ctx.report.migrations ?? []).find((m) => m.number === number);
  if (!migration) return result(label, 'fail', `migration ${number} not found`);
  const bad = (migration.operations ?? []).filter((op) => /^(DROP|RENAME)/i.test(op));
  return bad.length
    ? result(label, 'fail', `${number} contains ${bad.join(', ')}`)
    : result(label, 'pass', `${number} only adds (${migration.operations.join(', ')})`);
}

export function uniqueMigrations(report) {
  const numbers = (report?.migrations ?? []).map((m) => m.number);
  const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  return dupes.length
    ? result('unique_migrations', 'fail', `duplicate migration numbers: ${[...new Set(dupes)].join(', ')}`)
    : result('unique_migrations', 'pass', `${numbers.length} migration(s), numbers unique`);
}

export function mergedClean(ctx) {
  const report = ctx.mergeReport;
  const trust = reportTrusted(ctx, report, ctx.mergeSha);
  if (trust.status !== 'pass') return result('merged_clean', 'unknown', `merge result: ${trust.reason}`);
  const parts = [
    ...(ctx.mergeRequiredTests ?? []).map((n) => testPasses(ctx, n, report)),
    testsNotRemoved(ctx, report),
    uniqueMigrations(report),
  ];
  const failed = parts.filter((p) => p.status === 'fail');
  if (failed.length) return result('merged_clean', 'fail', failed.map((p) => p.reason).join('; '));
  const unknown = parts.filter((p) => p.status === 'unknown');
  if (unknown.length) return result('merged_clean', 'unknown', unknown.map((p) => p.reason).join('; '));
  return result('merged_clean', 'pass', `merge ${String(ctx.mergeSha).slice(0, 7)} clean`);
}

export function repairBalanced(ctx) {
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result('repair_balanced', 'unknown', trust.reason);
  const r = ctx.report.repair;
  if (!r) return result('repair_balanced', 'fail', 'no repair block in the report');
  if (r.debits_minor !== r.credits_minor) {
    return result('repair_balanced', 'fail', `debits ${r.debits_minor} != credits ${r.credits_minor}`);
  }
  if (r.rows_deleted || r.rows_updated) {
    return result('repair_balanced', 'fail', `ledger rows changed: ${r.rows_deleted} deleted, ${r.rows_updated} updated`);
  }
  return result('repair_balanced', 'pass', `reversing entries only; ${r.debits_minor} minor units each side`);
}

export function reconProof(ctx) {
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result('recon_proof', 'unknown', trust.reason);
  const r = ctx.report.recon;
  if (!r) return result('recon_proof', 'fail', 'no recon block in the report');
  if (r.accounts_matching !== r.accounts || r.diff_minor !== 0) {
    return result('recon_proof', 'fail', `${r.accounts_matching}/${r.accounts} accounts match; diff ${r.diff_minor}`);
  }
  return result('recon_proof', 'pass', `${r.accounts} accounts rebuilt and matching; diff 0`);
}

export function evidenceLinked(ctx) {
  const timeline = ctx.timeline ?? [];
  if (timeline.length === 0) return result('evidence_linked', 'fail', 'empty timeline');
  const missing = timeline.filter((e) => !e.link);
  return missing.length
    ? result('evidence_linked', 'fail', `${missing.length} timeline entr(ies) without evidence`)
    : result('evidence_linked', 'pass', `${timeline.length} entries linked`);
}

export function manual(statement) {
  return result(`manual(${statement})`, 'unknown', `needs a human: ${statement}`);
}

// ---- Definition of done (DESIGN 15a-15c) ----

// Exception types that mean "the test cannot run on base": it proves nothing about the old code.
export const CANNOT_RUN_ON_BASE = ['ImportError', 'ModuleNotFoundError', 'AttributeError', 'NameError'];
export const DEFAULT_COVERAGE = { changedFloor: 0.8, maxDropPoints: 0.5 };
const COVERAGE_FILES = ['.coveragerc', 'setup.cfg', 'pyproject.toml', 'tox.ini'];

const resolveName = (ctx, name) => {
  const key = ctx.ticket?.key ?? '';
  return String(name).replaceAll('{TOKEN}', key.replace('-', '')).replaceAll('{KEY}', key);
};

// AC types whose evidence comes from CI or the PR head. An AC of one of these types is code
// work: "done" needs the PR merged (PR 8 review, item 7).
export const CODE_AC_TYPES = ['test_passes', 'metric_at_least', 'metric_at_most', 'version_at_least', 'migration_additive',
  'repair_balanced', 'recon_proof', 'ci_green', 'path_absent'];

// A ticket has code work when an AC needs CI evidence, or it is a Bug. A spike or a parent ticket
// with only sub-task, link or manual checks has no code gate.
export function hasCodeWork(ctx) {
  const acs = ctx.ticket?.acceptanceCriteria ?? [];
  return ctx.ticket?.type === 'Bug' || acs.some((a) => CODE_AC_TYPES.includes(a.check?.type));
}

// D-repro applies to a Bug and to a ticket with an AC test. A Task has no defect to reproduce,
// and a ticket gated only by metrics, CI or paths has no test to run on base.
export function needsRepro(ctx) {
  if (ctx.ticket?.type === 'Task') return false;
  return ctx.ticket?.type === 'Bug' || (ctx.ticket?.acceptanceCriteria ?? []).some((a) => a.check?.type === 'test_passes');
}

// The tests that must reproduce the problem: every AC test, and for a Bug every test named for
// the key.
export function ticketTests(ctx) {
  const names = (ctx.ticket?.acceptanceCriteria ?? [])
    .filter((a) => a.check?.type === 'test_passes')
    .map((a) => resolveName(ctx, a.check.args?.[0]));
  if (ctx.ticket?.type === 'Bug') {
    const token = new RegExp(`(^|[^A-Za-z0-9])${issueToken(ctx.ticket.key)}_`);
    for (const t of ctx.report?.tests ?? []) if (token.test(testName(t.id))) names.push(testName(t.id));
  }
  return [...new Set(names)];
}

// "done" means on main: the PR is merged.
export function onMain(ctx) {
  const pr = ctx.pr;
  if (!pr && ctx.forkPrs?.length) return result('on_main', 'unknown', forkReason(ctx));
  if (!pr) return result('on_main', 'fail', `no pull request for ${ctx.ticket.key}, so nothing is on main`);
  // Two open or merged PRs name the key: the same rule as pr_linked (benchmark B26).
  if ((ctx.prCandidates ?? []).length > 1) {
    return result('on_main', 'unknown', `PRs ${ctx.prCandidates.map((n) => `#${n}`).join(', ')} all name ${ctx.ticket.key}; link one PR`);
  }
  if (!pr.merged) return result('on_main', 'fail', `PR #${pr.number} is not merged, so the work is not on main`);
  return result('on_main', 'pass', `PR #${pr.number} merged${ctx.mergeSha ? ` as ${String(ctx.mergeSha).slice(0, 7)}` : ''}`);
}

// The repro block is evidence only when it is complete and about this head (bank PR 14 review).
// Changed pytest support or config means the base run mixed base support files with head
// tests, so its result proves nothing either way.
function reproBlockGap(repro, headSha) {
  if (!repro.head_sha) return 'the repro block names no head commit';
  if (repro.head_sha !== headSha) return `the repro block is for ${String(repro.head_sha).slice(0, 7)}, not the report head`;
  if (!Array.isArray(repro.changed_support)) return 'the repro block has no list of changed support files';
  if (repro.changed_support.length) return `pytest support or config changed: ${repro.changed_support.join(', ')}; the base run cannot show the problem`;
  const run = repro.base_run;
  if (repro.tests.length || run) {
    if (!run) return 'the repro block has no base run record';
    if (run.report !== true) return `the base run wrote no report (pytest exit code ${run.rc ?? 'unknown'})`;
    // pytest exit codes: 0 all passed, 1 some failed. Anything else is an interrupted or bad run.
    if (run.rc !== 0 && run.rc !== 1) return `the base run ended with pytest exit code ${run.rc}`;
  }
  return null;
}

// An AC test that replaces (monkeypatch.setattr, mock.patch, patch.object) a function the PR
// defines in non-test code does not run the new code (benchmark I05). Read from the added lines
// of the test file's patch; per file, not per test function. Returns null when nothing is found.
const REPLACE = /(?:monkeypatch\.setattr|patch\.object|patch)\(\s*(?:[\w.]+\s*,\s*)?["']([\w.]+)["']/g;
export function acTestsRunNewCode(ctx) {
  const patches = ctx.prPatches ?? {};
  const added = (p) => String(p ?? '').split('\n').filter((l) => l.startsWith('+')).join('\n');
  const defined = new Set();
  for (const [file, patch] of Object.entries(patches)) {
    if (/(^|\/)tests?\//.test(file) || /(^|\/)test_[^/]*\.py$/.test(file)) continue;
    for (const m of added(patch).matchAll(/^\+\s*(?:async\s+)?def\s+(\w+)\s*\(/gm)) defined.add(m[1]);
  }
  if (!defined.size) return null;
  const files = new Set();
  for (const name of ticketTests(ctx)) {
    const row = (ctx.report?.tests ?? []).find((t) => testName(t.id) === name);
    if (row) files.add(row.id.split('::')[0]);
  }
  const replaced = [];
  for (const file of files) {
    for (const m of added(patches[file]).matchAll(REPLACE)) {
      const name = m[1].split('.').pop();
      if (defined.has(name)) replaced.push(`${file} replaces ${name}`);
    }
  }
  return replaced.length
    ? result('ac_tests_run_new_code', 'unknown', `${[...new Set(replaced)].join('; ')}, which this PR adds: the AC test does not run the new code, so a person checks`)
    : null;
}

// Earlier attempts of a re-run on the head (benchmark B05, B29). A failure in a step that runs the
// tests means the result changed with no code change: a flaky test, so a person checks. A failure
// in a setup step (checkout, install) is a runner problem and does not count. Returns null when no
// pinned run was re-run.
const TEST_STEP = /pytest|\btests?\b/i;
export function ciAttempts(ctx) {
  const paths = ctx.config?.requiredWorkflowPaths ?? [];
  const runs = (ctx.workflowRuns ?? []).filter((r) => paths.includes(runPath(r)) && r.headSha === ctx.pr?.headSha && (r.attempt ?? 1) > 1);
  if (!runs.length) return null;
  if (runs.some((r) => r.earlierFailures === null)) return result('ci_attempts', 'unknown', 'an earlier attempt of the CI run could not be read');
  const flaky = runs.flatMap((r) => r.earlierFailures ?? []).filter((f) => TEST_STEP.test(f.step));
  return flaky.length
    ? result('ci_attempts', 'unknown', flaky.map((f) => `attempt ${f.attempt} failed in step "${f.step}" and a re-run passed with no code change: a person checks for a flaky test`).join('; '))
    : result('ci_attempts', 'pass', 'earlier attempts failed only in setup steps, or not at all');
}

// The report must be for the current base tip (benchmark I09). GitHub's "branch up to date" rule
// does the same; here the reason names both commits. Returns null when the tip or the report's
// base is not known, or the PR is merged.
export function baseCurrent(ctx) {
  const tip = ctx.baseTip;
  const ran = ctx.report?.base_sha;
  if (!tip || !ran || ctx.pr?.merged) return null;
  return tip === ran
    ? result('base_current', 'pass', `CI ran on the current base ${String(tip).slice(0, 7)}`)
    : result('base_current', 'unknown', `the base moved: CI ran on ${String(ran).slice(0, 7)}, the base is now ${String(tip).slice(0, 7)}; CI must run again on the updated branch`);
}

// Measurement code (config guardedPaths, DESIGN 12 risk 12). A PR that changes it cannot support
// any claim by itself: a test that asserts a metric is a measurement too, not only a metric AC
// (benchmark B19, B20). Returns null when no guarded path changed.
export function measurementUnchanged(ctx) {
  const guarded = ctx.config?.guardedPaths ?? [];
  if (!guarded.length || !ctx.pr) return null;
  if (!Array.isArray(ctx.prFiles)) return null; // the trust checks already report a missing file list
  const touched = ctx.prFiles.filter((f) => guarded.some((g) => guardedMatch(f, g)));
  return touched.length
    ? result('measurement_unchanged', 'unknown', `PR changes ${touched.join(', ')}, which can change how results are measured: a person reviews`)
    : null;
}

// High-stake domains (DESIGN 6a): money rules, security exceptions, data repair, model risk,
// fairness, product behaviour. "done" needs a person's sign-off of the merged commit; code alone
// never supports it (benchmark B27). Returns null when the ticket has no such domain.
const SIGNOFF_DOMAINS = ['money_semantics', 'security_exception', 'data_repair', 'model_risk', 'fairness', 'product_behaviour'];
export function checkHumanSignoff(ctx) {
  const domain = ctx.ticket?.domain;
  if (!domain || !SIGNOFF_DOMAINS.includes(domain)) return null;
  const s = ctx.ticket.signoff;
  const sha = ctx.pr?.mergeSha ?? ctx.pr?.headSha ?? null;
  if (!s?.by) return result('human_signoff', 'unknown', `${domain}: a person's sign-off of the merged change is required, and none is recorded`);
  if (!sha || s.sha !== sha) return result('human_signoff', 'unknown', `${domain}: the sign-off is for ${String(s.sha ?? 'no commit').slice(0, 7)}, not the merged commit ${String(sha ?? 'unknown').slice(0, 7)}`);
  return result('human_signoff', 'pass', `${domain}: signed off by ${s.by} at ${s.at}`);
}

// A Story's AC test that cannot import on base because the PR adds the module (benchmark B22):
// the module file is added in the diff, the test file imports it (added lines), and the test
// passes on head. That is new behaviour, not a failed reproduction. A Bug keeps the old rule.
const IMPORT_ERRORS = ['ModuleNotFoundError', 'ImportError'];
function newModuleStory(ctx, row) {
  if (ctx.ticket?.type !== 'Story' || row.head?.outcome !== 'passed') return false;
  if (row.base?.outcome !== 'error' || (row.base.exc_type && !IMPORT_ERRORS.includes(row.base.exc_type))) return false;
  const modules = (ctx.prAddedFiles ?? [])
    .filter((f) => f.endsWith('.py') && !/(^|\/)tests?\//.test(f) && !/(^|\/)test_[^/]*\.py$/.test(f))
    .map((f) => f.replace(/^src\//, '').replace(/\.py$/, '').replace(/\/__init__$/, '').replaceAll('/', '.'));
  if (!modules.length) return false;
  const file = row.id.split('::')[0];
  const lines = String(ctx.prPatches?.[file] ?? '').split('\n').filter((l) => l.startsWith('+'));
  return modules.some((m) => lines.some((l) => new RegExp(`^\\+\\s*(from\\s+${m.replaceAll('.', '\\.')}\\s+import|import\\s+${m.replaceAll('.', '\\.')}\\b)`).test(l)));
}

// D-repro: each ticket test fails on base by an assertion and passes on head; the full head suite
// passes; no test is removed.
export function reproduced(ctx) {
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result('reproduced', 'unknown', trust.reason);
  const repro = ctx.report.repro;
  if (!repro || !Array.isArray(repro.tests)) return result('reproduced', 'unknown', 'no repro block in the CI report (base run missing)');
  const gap = reproBlockGap(repro, ctx.report.head_sha);
  if (gap) return result('reproduced', 'unknown', gap);
  const fails = [];
  const unknowns = [];
  const suite = repro.full_suite;
  if (!suite) unknowns.push('no full-suite result in the repro block');
  else if (suite.outcome !== 'passed') fails.push(`full suite on head failed (${suite.failed ?? '?'} failed)`);
  const removed = testsNotRemoved(ctx);
  if (removed.status === 'fail') fails.push(removed.reason);
  else if (removed.status === 'unknown') unknowns.push(removed.reason);
  // AC tests must each reproduce. For a Bug, the other tests named for the key are guards of
  // behaviour that must not change: they must pass on head and may pass on base (benchmark B21,
  // B25, B26, B29). With no AC test, at least one key-named test must reproduce.
  const all = ticketTests(ctx);
  const acNames = new Set((ctx.ticket?.acceptanceCriteria ?? []).filter((a) => a.check?.type === 'test_passes').map((a) => resolveName(ctx, a.check.args?.[0])));
  const guards = all.filter((n) => !acNames.has(n));
  const rowOf = (name) => repro.tests.find((t) => testName(t.id) === name);
  const reproduces = (name) => rowOf(name)?.base?.outcome === 'failed' && rowOf(name)?.base?.exc_type === 'AssertionError' && rowOf(name)?.head?.outcome === 'passed';
  let names = all;
  if (acNames.size || guards.some(reproduces)) {
    names = acNames.size ? [...acNames] : guards.filter(reproduces);
    for (const g of guards.filter((n) => !names.includes(n))) {
      const row = rowOf(g);
      if (row && row.head?.outcome !== 'passed') fails.push(`${g} fails on head (${row.head?.outcome ?? 'no result'})`);
    }
  }
  if (names.length === 0) fails.push(`no test for ${ctx.ticket.key}: nothing reproduces the problem`);
  for (const name of names) {
    const row = rowOf(name);
    if (!row) {
      unknowns.push(`${name} is not in the repro block`);
      continue;
    }
    const base = row.base ?? {};
    if (row.head?.outcome !== 'passed') fails.push(`${name} fails on head (${row.head?.outcome ?? 'no result'})`);
    if (base.outcome === 'passed') fails.push(`${name} passes on base, so it does not reproduce the problem`);
    else if (newModuleStory(ctx, row)) continue;
    else if (base.outcome === 'error' || CANNOT_RUN_ON_BASE.includes(base.exc_type)) {
      unknowns.push(`${name} cannot run on base (${base.exc_type ?? base.outcome}); a human decides`);
    } else if (base.outcome !== 'failed') unknowns.push(`${name} has no base result`);
    else if (base.exc_type !== 'AssertionError') unknowns.push(`${name} fails on base by ${base.exc_type ?? 'an unknown error'}, not by an assertion`);
  }
  if (fails.length) return result('reproduced', 'fail', fails.join('; '));
  if (unknowns.length) return result('reproduced', 'unknown', unknowns.join('; '));
  return result('reproduced', 'pass', `${names.length} test(s) fail on base by an assertion and pass on head; full suite passed`);
}

// Non-test Python files whose patch adds or removes a line that is not blank and not a comment.
const isTestFile = (f) => /(^|\/)tests?\//.test(f) || /(^|\/)test_[^/]*\.py$/.test(f) || /(^|\/)conftest\.py$/.test(f);
function changedSourceFiles(ctx) {
  return (ctx.prFiles ?? []).filter((f) => f.endsWith('.py') && !isTestFile(f)).filter((f) => {
    const patch = ctx.prPatches?.[f];
    if (typeof patch !== 'string') return true; // patch not read: assume code changed
    return patch.split('\n').some((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l) && !/^[+-]\s*(#.*)?$/.test(l));
  });
}

// D-cov: changed executable lines covered at or above the floor, and total coverage not below
// base minus the allowed drop. A PR that changes the coverage settings or adds an exclusion
// gives unknown.
export function coverageOk(ctx) {
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result('coverage', 'unknown', trust.reason);
  const cov = ctx.report.coverage;
  if (!cov) return result('coverage', 'unknown', 'no coverage block in the CI report');
  if (!Array.isArray(ctx.prFiles)) return result('coverage', 'unknown', 'pull request file list not available');
  const settings = ctx.prFiles.filter((f) => COVERAGE_FILES.includes(f.split('/').pop()));
  if (settings.length) return result('coverage', 'unknown', `PR changes coverage settings (${settings.join(', ')})`);
  if (!ctx.prPatches) return result('coverage', 'unknown', 'pull request patches not read');
  for (const [file, patch] of Object.entries(ctx.prPatches)) {
    if (typeof patch !== 'string') continue;
    if (patch.split('\n').some((l) => l.startsWith('+') && !l.startsWith('+++') && /pragma:\s*no\s*cover/i.test(l))) {
      return result('coverage', 'unknown', `${file} adds pragma: no cover`);
    }
  }
  const conf = { ...DEFAULT_COVERAGE, ...(ctx.config?.coverage ?? {}) };
  // Counts must be numbers: Number([]) is 0 and would read as "no changed lines".
  if (typeof cov.changed_executable !== 'number' || typeof cov.changed_covered !== 'number') {
    return result('coverage', 'unknown', 'changed-line counts missing');
  }
  const exec = cov.changed_executable;
  const covered = cov.changed_covered;
  if (!Number.isFinite(exec) || !Number.isFinite(covered)) return result('coverage', 'unknown', 'changed-line counts missing');
  // Zero changed executable lines while a source file gains or loses code means the coverage
  // tool did not see the change (PR 8 review, item 9).
  if (exec === 0) {
    const code = changedSourceFiles(ctx);
    if (code.length) return result('coverage', 'unknown', `no changed executable lines reported, but ${code.join(', ')} changed code`);
  }
  const floorPct = Math.round(conf.changedFloor * 100);
  if (exec > 0 && covered / exec < conf.changedFloor) {
    return result('coverage', 'fail', `${covered} of ${exec} changed lines covered (${Math.round((covered / exec) * 100)}%), floor ${floorPct}%`);
  }
  if (typeof cov.head_total !== 'number' || typeof cov.base_total !== 'number') {
    return result('coverage', 'unknown', 'head or base total coverage missing');
  }
  if (cov.head_total < cov.base_total - conf.maxDropPoints) {
    return result('coverage', 'fail', `total coverage ${cov.head_total}% is below base ${cov.base_total}% minus ${conf.maxDropPoints}`);
  }
  const changed = exec > 0 ? `${covered} of ${exec} changed lines covered` : 'no changed executable lines';
  return result('coverage', 'pass', `${changed}; total ${cov.head_total}% (base ${cov.base_total}%)`);
}

// ---- Small security check (DESIGN 14g, owner decision 16 Nov) ----
// The code-scanning result check run on the PR head must be success. It is identified by the
// GitHub app (id and slug) and the check name, never by display text alone: a workflow job named
// "CodeQL" from another app does not count. Shapes read from real check runs on 16 Nov: name
// "CodeQL", app github-advanced-security (id 57789); success has the title "No new alerts in code
// changed by this pull request"; neutral means scanning "cannot determine the alerts introduced".
const SCAN_WORKFLOW = 'dynamic/github-code-scanning/codeql';
export function codeScanning(ctx) {
  const label = 'code_scanning';
  const conf = ctx.config?.securityCheck ?? {};
  const head = ctx.pr?.headSha;
  if (!head) return result(label, 'unknown', 'no head commit');
  const change = pipelineChange(ctx);
  if (change) return result(label, 'unknown', change);
  if (!Array.isArray(ctx.securityRuns)) return result(label, 'unknown', 'check runs of the head not read');
  if (ctx.truncated?.checks) return result(label, 'unknown', `check run list for ${head.slice(0, 7)} is not complete (page limit)`);
  const runs = ctx.securityRuns.filter((r) => r.headSha === head && r.name === conf.checkName
    && r.appSlug === conf.appSlug && (conf.appId === undefined || r.appId === conf.appId));
  const scanning = (ctx.workflowRuns ?? []).some((r) => runPath(r) === SCAN_WORKFLOW && r.headSha === head && r.status !== 'completed');
  if (runs.length === 0) {
    return result(label, 'unknown', scanning ? 'code scanning is still running on the head'
      : 'no code-scanning result on the head (scanning off, or not run for this commit)');
  }
  if (runs.some((r) => r.status !== 'completed')) return result(label, 'unknown', 'code scanning is still running on the head');
  const failed = runs.find((r) => r.conclusion === 'failure');
  if (failed) return result(label, 'fail', `${conf.checkName} failed: ${failed.title ?? 'no title'}`);
  const other = runs.find((r) => r.conclusion !== 'success');
  if (other) return result(label, 'unknown', `${conf.checkName} ${other.conclusion}: ${other.title ?? 'no title'}`);
  return result(label, 'pass', `${conf.checkName}: ${runs[0].title ?? 'success'}`);
}

// The check as the claim types run it. mode "off": not run. mode "observe": run and shown, but
// advisory (not counted), until the repository is confirmed to produce the check. mode "enforce":
// counted for done, and for fixed and ready when onFixedReady is true.
export function securityCheck(ctx, claimType) {
  const conf = ctx.config?.securityCheck;
  if (!conf || !conf.mode || conf.mode === 'off') return [];
  if (claimType !== 'done' && conf.onFixedReady === false) return [];
  const r = codeScanning(ctx);
  return conf.mode === 'enforce' ? [r] : [{ ...r, advisory: true, reason: `advisory, not counted: ${r.reason}` }];
}
