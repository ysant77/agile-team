// D-evidence (DESIGN 15d): one record per done claim, built by code from the evidence and the
// check results. No model writes any part of it. The record's hash goes into the audit chain.

import { canonical, sha256 } from '../audit.js';
import { hasCodeWork, testsNotRemoved } from './checks.js';
import { testName } from './report.js';

const DEFAULT_PATHS = ['.github/workflows/ci.yml'];
const runPath = (r) => String(r.path ?? '').split('@')[0];

function pinnedRunUrl(ctx) {
  const paths = ctx.config?.requiredWorkflowPaths ?? DEFAULT_PATHS;
  const run = (ctx.workflowRuns ?? []).find((r) => paths.includes(runPath(r)) && r.headSha === ctx.pr?.headSha && r.url);
  return run?.url ?? null;
}

export function buildDoneEvidence(claim, ctx, checks, checkerVersion = null) {
  const key = ctx.ticket?.key ?? '';
  const code = hasCodeWork(ctx);
  const repro = ctx.report?.repro ?? null;
  const acParts = checks.find((c) => c.name === 'ac_mapped')?.parts ?? [];
  const acs = (ctx.ticket?.acceptanceCriteria ?? []).map((ac) => {
    const isTest = ac.check?.type === 'test_passes';
    const name = isTest ? String(ac.check.args?.[0] ?? '').replaceAll('{TOKEN}', key.replace('-', '')).replaceAll('{KEY}', key) : null;
    const row = name ? (repro?.tests ?? []).find((t) => testName(t.id) === name) : null;
    return {
      acId: ac.acId,
      check: ac.check?.type ?? null,
      testId: name,
      base: row ? { outcome: row.base?.outcome ?? null, excType: row.base?.exc_type ?? null } : null,
      head: row ? { outcome: row.head?.outcome ?? null } : null,
      status: acParts.find((p) => p.acId === ac.acId)?.status ?? null,
    };
  });
  const cov = ctx.report?.coverage;
  const body = {
    ticket: key,
    claimId: claim.id,
    checker: checkerVersion,
    codeWork: code,
    acs,
    fullSuite: code && repro?.full_suite
      ? { outcome: repro.full_suite.outcome, passed: repro.full_suite.passed ?? null, failed: repro.full_suite.failed ?? null }
      : null,
    testsNotRemoved: code ? testsNotRemoved(ctx).status : null,
    coverage: code && cov
      ? { changedCovered: cov.changed_covered ?? null, changedExecutable: cov.changed_executable ?? null, headTotal: cov.head_total ?? null, baseTotal: cov.base_total ?? null }
      : null,
    headSha: code ? (ctx.pr?.headSha ?? null) : null,
    mergeSha: code ? (ctx.mergeSha ?? null) : null,
    ciRunUrl: code ? pinnedRunUrl(ctx) : null,
    adoptedChecks: ctx.adoptedChecks ?? [],
    humanDecisions: ctx.ticket?.decisions ?? [],
    checks: checks.map((c) => ({ name: c.name, status: c.status, ...(c.advisory ? { advisory: true } : {}) })),
  };
  return { ...body, hash: sha256(canonical(body)) };
}

// The parts a code ticket's record must have. A missing part makes the claim unknown.
export function missingParts(record) {
  if (!record.codeWork) return [];
  const missing = [];
  for (const a of record.acs) {
    if (a.testId && !(a.base?.outcome && a.head?.outcome)) missing.push(`${a.acId} base and head outcome`);
  }
  if (!record.fullSuite) missing.push('full-suite result');
  if (!record.coverage) missing.push('coverage');
  if (!record.headSha) missing.push('head commit');
  if (!record.mergeSha) missing.push('merge commit');
  if (!record.ciRunUrl) missing.push('CI run URL');
  return missing;
}

export function evidenceComplete(claim, ctx, checks) {
  const record = buildDoneEvidence(claim, ctx, checks);
  const missing = missingParts(record);
  return missing.length
    ? { name: 'evidence_record', status: 'unknown', reason: `evidence record incomplete: ${missing.join(', ')}` }
    : { name: 'evidence_record', status: 'pass', reason: record.codeWork ? 'evidence record complete' : 'evidence record complete (no code work)' };
}

// Plain text for the Jira comment and the panel.
export function formatEvidence(r) {
  const lines = [`Evidence record (hash ${r.hash.slice(0, 12)}), written by code:`];
  for (const a of r.acs) {
    if (a.testId && a.base && a.head) {
      lines.push(`- ${a.acId} ${a.testId}: base ${a.base.outcome}${a.base.excType ? ` (${a.base.excType})` : ''}, head ${a.head.outcome}`);
    } else lines.push(`- ${a.acId} ${a.check ?? 'check'}: ${a.status ?? 'not run'}`);
  }
  if (r.codeWork) {
    if (r.fullSuite) lines.push(`- full suite on head: ${r.fullSuite.outcome} (${r.fullSuite.passed ?? '?'} passed, ${r.fullSuite.failed ?? '?'} failed); tests not removed: ${r.testsNotRemoved}`);
    if (r.coverage) lines.push(`- changed lines covered: ${r.coverage.changedCovered} of ${r.coverage.changedExecutable}; total ${r.coverage.headTotal}% (base ${r.coverage.baseTotal}%)`);
    lines.push(`- head ${String(r.headSha ?? '-').slice(0, 7)}, merge ${String(r.mergeSha ?? '-').slice(0, 7)}, CI run ${r.ciRunUrl ?? '-'}`);
  }
  for (const a of r.adoptedChecks) lines.push(`- adopted check ${a.testName} for ${a.ac} by ${a.by}: ${a.reason}`);
  for (const h of r.humanDecisions) lines.push(`- human decision by ${h.by} (audit seq ${h.seq}): ${h.text}`);
  return lines.join('\n');
}
