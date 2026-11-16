// Turns a claim plus collected evidence into a verdict. Deterministic; version-stamped.

import * as c from './checks.js';
import { evidenceComplete } from './evidence.js';

export const CHECKER_VERSION = 'verifier/1';

// One acceptance-criterion check, from { type, args }.
export function runAcCheck(ctx, check) {
  // Test names may use {TOKEN} (BANK3) or {KEY} (BANK-3): the key is unknown when ACs are written.
  const key = ctx.ticket?.key ?? '';
  const a = (check.args ?? []).map((v) =>
    typeof v === 'string' ? v.replaceAll('{TOKEN}', key.replace('-', '')).replaceAll('{KEY}', key) : v,
  );
  switch (check.type) {
    case 'test_passes':
      return c.testPasses(ctx, a[0]);
    case 'metric_at_least':
      return c.metricCompare(ctx, a[0], a[1], 'min');
    case 'metric_at_most':
      return c.metricCompare(ctx, a[0], a[1], 'max');
    case 'version_at_least':
      return c.versionAtLeast(ctx, a[0], a[1]);
    case 'path_absent':
      return c.pathAbsent(ctx, a[0]);
    case 'blocked_by_done':
      return c.blockedByDone(ctx);
    case 'subtasks_done':
      return c.subtasksDone(ctx);
    case 'link_exists':
      return (ctx.ticket.links ?? []).some((l) => !a[0] || l.type === a[0])
        ? { name: 'link_exists', status: 'pass', reason: 'link found' }
        : { name: 'link_exists', status: 'fail', reason: 'no link' };
    case 'field_equals':
      if (!ctx.ticket.fields || !(a[0] in ctx.ticket.fields)) {
        return { name: `field_equals(${a[0]})`, status: 'unknown', reason: `field ${a[0]} not read from Jira` };
      }
      return ctx.ticket.fields[a[0]] === a[1]
        ? { name: `field_equals(${a[0]})`, status: 'pass', reason: `${a[0]} = ${a[1]}` }
        : { name: `field_equals(${a[0]})`, status: 'fail', reason: `${a[0]} = ${ctx.ticket.fields?.[a[0]]}` };
    case 'deployed':
      return c.deployed(ctx, a[0]);
    case 'migration_additive':
      return c.migrationAdditive(ctx, a[0]);
    case 'repair_balanced':
      return c.repairBalanced(ctx);
    case 'recon_proof':
      return c.reconProof(ctx);
    case 'evidence_linked':
      return c.evidenceLinked(ctx);
    case 'ci_green':
      return c.ciGreen(ctx);
    case 'manual':
    default:
      return c.manual(a[0] ?? check.statement ?? check.type);
  }
}

export function acMapped(ctx) {
  const acs = ctx.ticket.acceptanceCriteria ?? [];
  if (acs.length === 0) {
    return { name: 'ac_mapped', status: 'fail', reason: 'ticket has no acceptance criteria', parts: [] };
  }
  const parts = acs.map((ac) => ({ acId: ac.acId, ...runAcCheck(ctx, ac.check) }));
  const failed = parts.filter((p) => p.status === 'fail');
  const unknown = parts.filter((p) => p.status === 'unknown');
  const status = failed.length ? 'fail' : unknown.length ? 'unknown' : 'pass';
  const reason = failed.length
    ? failed.map((p) => `${p.acId}: ${p.reason}`).join('; ')
    : unknown.length
      ? unknown.map((p) => `${p.acId}: ${p.reason}`).join('; ')
      : `${parts.length} AC(s) met`;
  return { name: 'ac_mapped', status, reason, parts };
}

// Which checks a claim type runs.
export const CLAIM_CHECKS = {
  fixed: (ctx) => [
    c.prLinked(ctx),
    c.ciGreen(ctx),
    ...[c.acTestsRunNewCode(ctx)].filter(Boolean),
    ...[c.ciAttempts(ctx)].filter(Boolean),
    acMapped(ctx),
    ...[c.measurementUnchanged(ctx)].filter(Boolean),
    ...(ctx.ticket.type === 'Bug' ? [c.bugTestExists(ctx)] : []),
    ...(ctx.baseReport ? [c.testsNotRemoved(ctx)] : []),
    ...c.securityCheck(ctx, 'fixed'),
  ],
  ready: (ctx) => [
    c.prLinked(ctx),
    c.ciGreen(ctx),
    ...[c.acTestsRunNewCode(ctx)].filter(Boolean),
    ...[c.ciAttempts(ctx)].filter(Boolean),
    ...[c.baseCurrent(ctx)].filter(Boolean),
    acMapped(ctx),
    ...[c.measurementUnchanged(ctx)].filter(Boolean),
    ...(ctx.baseReport ? [c.testsNotRemoved(ctx)] : []),
    ...c.securityCheck(ctx, 'ready'),
  ],
  // DESIGN 15a: "done" means on main, reproduced, covered and recorded. A ticket with no code work
  // (a spike, a parent of sub-tasks) keeps the sub-task, blocker and AC checks and the record.
  done: (ctx) => {
    const checks = [c.subtasksDone(ctx), c.blockedByDone(ctx), acMapped(ctx)];
    // A Task (refactor, tests only, chore) has no defect to reproduce: its AC tests pass on head,
    // with the full suite, coverage and trust rules (benchmark I01, I02; DESIGN 15j).
    const reproduce = ctx.ticket?.type === 'Task' ? [] : [c.reproduced(ctx)];
    if (c.hasCodeWork(ctx)) checks.push(c.onMain(ctx), c.mergedClean(ctx), ...reproduce, c.coverageOk(ctx), ...c.securityCheck(ctx, 'done'));
    const replaced = c.acTestsRunNewCode(ctx);
    if (replaced) checks.push(replaced);
    const attempts = c.ciAttempts(ctx);
    if (attempts) checks.push(attempts);
    const measured = c.measurementUnchanged(ctx);
    if (measured) checks.push(measured);
    const signoff = c.checkHumanSignoff(ctx);
    if (signoff) checks.push(signoff);
    return [...checks, evidenceComplete({ id: ctx.claimId, type: 'done' }, ctx, checks)];
  },
  deployed: (ctx) => [c.deployed(ctx, ctx.claimArgs?.tag)],
  merged: (ctx) => [c.mergedClean(ctx)],
  acs: (ctx) => [acMapped(ctx)],
};

export function verify(claim, ctx) {
  const run = CLAIM_CHECKS[claim.type];
  if (!run) {
    return {
      claimId: claim.id,
      result: 'cannot_verify',
      reason: `unknown claim type "${claim.type}"`,
      checks: [],
      checkerVersion: CHECKER_VERSION,
    };
  }
  const checks = run({ ...ctx, claimArgs: claim.args, claimId: claim.id });
  // An advisory check is shown but does not change the verdict.
  const counted = checks.filter((k) => !k.advisory);
  const failed = counted.filter((k) => k.status === 'fail');
  const unknown = counted.filter((k) => k.status === 'unknown');
  const result = failed.length ? 'contradicted' : unknown.length ? 'cannot_verify' : 'supported';
  const reason = failed.length
    ? failed.map((k) => k.reason).join('; ')
    : unknown.length
      ? unknown.map((k) => k.reason).join('; ')
      : 'all checks passed';
  return { claimId: claim.id, result, reason, checks, checkerVersion: CHECKER_VERSION };
}
