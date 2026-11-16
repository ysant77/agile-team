// Deterministic checks. Each returns { name, status: 'pass' | 'fail' | 'unknown', reason }.
// No model is involved. Unknown means "cannot verify": a human or more evidence is needed.

import { namesKey, sameFiles, testName, testsByName } from './report.js';

const BOT = 'github-actions[bot]';
const result = (name, status, reason) => ({ name, status, reason });

function issueToken(key) {
  return String(key).replace('-', ''); // BANK-4 -> BANK4, used in test names
}

// Guard: a report counts only if the bot wrote it, for the PR head, with unchanged workflows.
export function reportTrusted(ctx, report = ctx.report, headSha = ctx.pr?.headSha) {
  if (!report) return result('report_trusted', 'unknown', 'no CI report');
  if ((ctx.reportAuthor ?? report.author) !== BOT) {
    return result('report_trusted', 'unknown', `report not posted by ${BOT}`);
  }
  if (headSha && report.head_sha !== headSha) {
    return result('report_trusted', 'unknown', 'report is for an older commit, not the head');
  }
  if (ctx.baseWorkflowFiles && !sameFiles(ctx.baseWorkflowFiles, report.workflow_files)) {
    return result('report_trusted', 'unknown', 'workflow changed in this PR');
  }
  return result('report_trusted', 'pass', 'bot report for the head commit');
}

export function prLinked(ctx) {
  const pr = ctx.pr;
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
  return result('pr_linked', 'pass', `PR #${pr.number} names ${ctx.ticket.key}`);
}

export function ciGreen(ctx) {
  const required = ctx.config?.requiredWorkflows ?? ['CI'];
  const head = ctx.pr?.headSha;
  if (!head) return result('ci_green', 'unknown', 'no head commit');
  const reasons = [];
  let unknown = false;
  for (const name of required) {
    const runs = (ctx.workflowRuns ?? [])
      .filter((r) => r.name === name && r.headSha === head)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const latest = runs[0];
    if (!latest || latest.status !== 'completed') {
      unknown = true;
      reasons.push(`${name}: no completed run for ${head.slice(0, 7)}`);
    } else if (latest.conclusion !== 'success') {
      return result('ci_green', 'fail', `${name} concluded ${latest.conclusion} on ${head.slice(0, 7)}`);
    } else {
      reasons.push(`${name}: success`);
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
  const token = issueToken(ctx.ticket.key);
  const tests = (ctx.report.tests ?? []).filter((t) => testName(t.id).includes(`${token}_`));
  if (tests.length === 0) {
    return result('bug_test_exists', 'fail', `no test named for ${ctx.ticket.key}: the change may be right, but nothing proves it`);
  }
  const failed = tests.find((t) => t.outcome !== 'passed');
  if (failed) return result('bug_test_exists', 'fail', `${testName(failed.id)}: ${failed.outcome}`);
  return result('bug_test_exists', 'pass', `${tests.length} test(s) for ${ctx.ticket.key} passed`);
}

export function metricCompare(ctx, name, bound, direction) {
  const label = `metric_${direction === 'min' ? 'at_least' : 'at_most'}(${name}, ${bound})`;
  const trust = reportTrusted(ctx);
  if (trust.status !== 'pass') return result(label, 'unknown', trust.reason);
  const value = ctx.report.metrics?.[name];
  if (typeof value !== 'number') return result(label, 'fail', `${name} not reported`);
  // Drift metrics compare two datasets; equal data hashes make the number meaningless.
  const hashes = ctx.report.data_hashes;
  if (/^psi/i.test(name) && hashes?.train && hashes.train === hashes.live) {
    return result(label, 'unknown', 'data hashes for training and live data are equal: the drift number compares a dataset with itself');
  }
  const guard = ctx.config?.tooGood?.[name];
  if (guard !== undefined && value > guard) {
    return result(label, 'unknown', `${name} = ${value} is above ${guard}: too good, human review`);
  }
  const ok = direction === 'min' ? value >= bound : value <= bound;
  return result(label, ok ? 'pass' : 'fail', `${name} = ${value}`);
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
  const removed = [...new Set((ctx.baseReport.tests ?? []).map((t) => testName(t.id)))].filter(
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
