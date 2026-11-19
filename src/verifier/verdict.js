// Turns a claim plus collected evidence into a verdict. Deterministic; version-stamped.

import * as c from './checks.js';
import { evidenceComplete } from './evidence.js';

// verifier/2: definition of done (on main, reproduced, covered, recorded, signed off).
export const CHECKER_VERSION = 'verifier/2';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.length > 0;
const unknown = (name, reason) => ({ name, status: 'unknown', reason });

// Top-level guard (final review, item 2): a check that throws on malformed input gives unknown
// with the check's name, so the verdict is cannot_verify, never a crash and never supported.
function safe(name, fn, ...args) {
  try {
    return fn(...args);
  } catch (error) {
    return unknown(name, `malformed input: ${name} threw (${error?.message ?? error})`);
  }
}

// One acceptance-criterion check, from { type, args }.
export function runAcCheck(ctx, check) {
  if (!isObj(check) || !isText(check.type)) return unknown('ac_check', 'malformed input: the AC has no check with a type');
  if (check.args !== undefined && !Array.isArray(check.args)) return unknown(`${check.type}`, 'malformed input: the AC check arguments are not a list');
  // Test names may use {TOKEN} (BANK3) or {KEY} (BANK-3): the key is unknown when ACs are written.
  // A key that is not text resolves to nothing, so a named test is not found.
  const key = isText(ctx.ticket?.key) ? ctx.ticket.key : '';
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
    case 'link_exists': {
      // The reader always gives a list; anything else was not read (PR 9 review, item 3).
      // No link type means any link; a type that is not text is malformed.
      if (a[0] !== undefined && !isText(a[0])) return unknown('link_exists', 'malformed input: the link type is not text');
      const links = ctx.ticket?.links;
      if (!Array.isArray(links) || !links.every((l) => isObj(l) && isText(l.type))) {
        return unknown('link_exists', 'malformed input: the link list was not read, or it is malformed');
      }
      return links.some((l) => !a[0] || l.type === a[0])
        ? { name: 'link_exists', status: 'pass', reason: 'link found' }
        : { name: 'link_exists', status: 'fail', reason: 'no link' };
    }
    case 'field_equals':
      if (!isText(a[0])) return unknown('field_equals', 'malformed input: the check names no field');
      if (!isObj(ctx.ticket?.fields) || !Object.hasOwn(ctx.ticket.fields, a[0])) {
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
  if (!isObj(ctx.ticket)) return { ...unknown('ac_mapped', 'malformed input: the ticket was not read'), parts: [] };
  // None stored means no AC; any other value that is not a list of objects is malformed.
  const acs = ctx.ticket.acceptanceCriteria ?? [];
  if (!Array.isArray(acs) || !acs.every(isObj)) return { ...unknown('ac_mapped', 'malformed input: the acceptance criteria are not a list of objects'), parts: [] };
  if (acs.length === 0) {
    // Work defined by sub-tasks: every sub-task done stands for the AC (benchmark B24). A ticket
    // with no AC and no sub-task has nothing to check (B13).
    const subs = ctx.ticket.subtasks ?? [];
    if (!Array.isArray(subs) || !subs.every(isObj)) return { ...unknown('ac_mapped', 'malformed input: the sub-task list is malformed'), parts: [] };
    if (subs.length && subs.every((t) => t.statusCategory === 'done')) {
      return { name: 'ac_mapped', status: 'pass', reason: `no AC; the work is ${subs.length} sub-task(s), all done`, parts: [] };
    }
    return { name: 'ac_mapped', status: 'fail', reason: 'ticket has no acceptance criteria', parts: [] };
  }
  const parts = acs.map((ac) => ({ acId: ac.acId, ...safe(`${ac.acId ?? 'AC'} check`, runAcCheck, ctx, ac.check) }));
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
    safe('pr_linked', c.prLinked, ctx),
    safe('ci_green', c.ciGreen, ctx),
    ...[safe('ac_tests_run_new_code', c.acTestsRunNewCode, ctx)].filter(Boolean),
    ...[safe('ci_attempts', c.ciAttempts, ctx)].filter(Boolean),
    safe('ac_mapped', acMapped, ctx),
    safe('acs_recorded', c.acsRecorded, ctx),
    ...[safe('measurement_unchanged', c.measurementUnchanged, ctx)].filter(Boolean),
    ...(ctx.ticket?.type === 'Bug' ? [safe('bug_test_exists', c.bugTestExists, ctx)] : []),
    ...(ctx.baseReport ? [safe('tests_not_removed', c.testsNotRemoved, ctx)] : []),
    safe('pinned_tests_hold', c.pinnedTestsHold, ctx),
    ...[safe('code_scanning', c.securityCheck, ctx, 'fixed')].flat(),
  ],
  ready: (ctx) => [
    safe('pr_linked', c.prLinked, ctx),
    safe('ci_green', c.ciGreen, ctx),
    ...[safe('ac_tests_run_new_code', c.acTestsRunNewCode, ctx)].filter(Boolean),
    ...[safe('ci_attempts', c.ciAttempts, ctx)].filter(Boolean),
    ...[safe('base_current', c.baseCurrent, ctx)].filter(Boolean),
    safe('ac_mapped', acMapped, ctx),
    safe('acs_recorded', c.acsRecorded, ctx),
    ...[safe('measurement_unchanged', c.measurementUnchanged, ctx)].filter(Boolean),
    ...(ctx.baseReport ? [safe('tests_not_removed', c.testsNotRemoved, ctx)] : []),
    safe('pinned_tests_hold', c.pinnedTestsHold, ctx),
    ...[safe('code_scanning', c.securityCheck, ctx, 'ready')].flat(),
  ],
  // DESIGN 15a: "done" means on main, reproduced, covered and recorded. A ticket with no code work
  // (a spike, a parent of sub-tasks) keeps the sub-task, blocker and AC checks and the record.
  done: (ctx) => {
    const checks = [safe('subtasks_done', c.subtasksDone, ctx), safe('blocked_by_done', c.blockedByDone, ctx), safe('ac_mapped', acMapped, ctx), safe('acs_recorded', c.acsRecorded, ctx)];
    // A Task (refactor, tests only, chore) has no defect to reproduce: its AC tests pass on head,
    // with the full suite, coverage and trust rules (benchmark I01, I02; DESIGN 15j). A ticket
    // with no AC test (only metric, CI or path ACs) has nothing to reproduce either.
    const reproduce = c.needsRepro(ctx) ? [safe('reproduced', c.reproduced, ctx)] : [];
    if (c.hasCodeWork(ctx)) {
      checks.push(safe('on_main', c.onMain, ctx), safe('merged_clean', c.mergedClean, ctx), ...reproduce, safe('coverage', c.coverageOk, ctx),
        safe('pinned_tests_hold', c.pinnedTestsHold, ctx),
        ...[safe('code_scanning', c.securityCheck, ctx, 'done')].flat());
    }
    // Rule (PR 9 review, item 5): a done claim with a linked PR needs that PR merged, whatever
    // the AC types. Only a ticket with no code AC and no linked PR has no PR gate.
    else if (ctx.pr || ctx.forkPrs?.length) checks.push(safe('on_main', c.onMain, ctx));
    // No PR found is "no PR gate" only when the pull request list was read to the end (final
    // review, item 4). A PR that names the key can be on a page that was not read.
    else if (!(isObj(ctx.truncated) && ctx.truncated.pulls === false)) {
      checks.push(unknown('on_main', `no pull request in the latest ones names ${ctx.ticket?.key}; the pull request list is not complete (page limit, or no page flag), so a linked PR may be missed`));
    }
    const replaced = safe('ac_tests_run_new_code', c.acTestsRunNewCode, ctx);
    if (replaced) checks.push(replaced);
    const attempts = safe('ci_attempts', c.ciAttempts, ctx);
    if (attempts) checks.push(attempts);
    const measured = safe('measurement_unchanged', c.measurementUnchanged, ctx);
    if (measured) checks.push(measured);
    const signoff = safe('human_signoff', c.checkHumanSignoff, ctx);
    if (signoff) checks.push(signoff);
    return [...checks, safe('evidence_record', evidenceComplete, { id: ctx.claimId, type: 'done' }, ctx, checks)];
  },
  deployed: (ctx) => [safe('deployed', c.deployed, ctx, ctx.claimArgs?.tag)],
  merged: (ctx) => [safe('merged_clean', c.mergedClean, ctx)],
  acs: (ctx) => [safe('ac_mapped', acMapped, ctx), safe('acs_recorded', c.acsRecorded, ctx)],
};

export function verify(claim, ctx) {
  const claimId = isObj(claim) ? claim.id : undefined;
  const cannot = (reason) => ({ claimId, result: 'cannot_verify', reason, checks: [], checkerVersion: CHECKER_VERSION });
  // Own keys only: "toString" or "constructor" is not a claim type.
  const type = isObj(claim) ? claim.type : undefined;
  const run = typeof type === 'string' && Object.hasOwn(CLAIM_CHECKS, type) ? CLAIM_CHECKS[type] : null;
  if (!run) return cannot(`unknown claim type "${isObj(claim) ? String(type) : 'no claim'}"`);
  if (!isObj(ctx)) return cannot('malformed input: no evidence context');
  // A throw while the check list is built (outside one check) is malformed input too.
  let checks;
  try {
    checks = run({ ...ctx, claimArgs: claim.args, claimId: claim.id });
  } catch (error) {
    return cannot(`malformed input: ${type} verdict assembly threw (${error?.message ?? error})`);
  }
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
