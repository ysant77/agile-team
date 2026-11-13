// Arbitration cases (DESIGN.md sections 6a and 6b). Pure functions: the Forge glue collects the
// evidence, these build the sides, run the rule and the packet the AI team lead may see.

import { arbitrate, HUMAN_DOMAINS } from './arbitration.js';

export const QUESTIONS = ['winner', 'design', 'readability', 'manual_ac'];

function metricOf(report, name) {
  const value = report?.metrics?.[name];
  if (typeof value === 'number') return { median: value, iqrLow: value, iqrHigh: value };
  if (value && typeof value.median === 'number') {
    return { median: value.median, iqrLow: value.iqr_low ?? value.median, iqrHigh: value.iqr_high ?? value.median };
  }
  return null;
}

// Packages in the head report's lock that the base report's lock does not have. Without both
// reports nothing is compared (null), and the tie-break treats the side as adding nothing.
export function newDependencies(baseReport, report) {
  if (!baseReport?.deps || !report?.deps) return null;
  return Object.keys(report.deps).filter((name) => !(name in baseReport.deps)).sort();
}

// Named rules for failure modes a change can add (DESIGN 6c, gap 3). Each rule reads only the
// PR's file list and the head report's test ids, so it is code, not judgement.
export const FAILURE_MODE_RULES = [
  {
    name: 'cache without a stale-read test',
    applies: ({ files }) => files.some((f) => /cache/i.test(f)),
    covered: ({ tests }) => tests.some((t) => /stale/i.test(t)),
  },
];

export function newFailureModes({ files = [], report } = {}) {
  const tests = (report?.tests ?? []).map((t) => String(t.id ?? ''));
  return FAILURE_MODE_RULES.filter((r) => r.applies({ files, tests }) && !r.covered({ files, tests })).map((r) => r.name);
}

// evidence per side: { prNumber, pr, report, baseReport, verdict, diffLines, files }
export function buildSide(e, metric) {
  return {
    id: `PR${e.prNumber}`,
    gatesPassed: e.verdict?.result === 'supported',
    gateReason: e.verdict?.reason ?? 'not verified',
    metrics: metric ? metricOf(e.report, metric) : null,
    newFailureModes: newFailureModes({ files: e.files ?? [], report: e.report }),
    newDependencies: newDependencies(e.baseReport, e.report) ?? [],
    diffLines: e.diffLines ?? null,
  };
}

const short = (text, n = 400) => (String(text ?? '').length > n ? `${String(text).slice(0, n)}...` : String(text ?? ''));

export function buildPacket({ issueKey, ticket, domain, question, metric, higherIsBetter, evidence }) {
  const sides = evidence.map((e) => buildSide(e, metric));
  // The metric step needs the metric from every side that passes the gates; otherwise skip it.
  const measured = sides.filter((s) => s.gatesPassed).every((s) => s.metrics);
  // A benchmark's spread is jitter inside one CI job, not the noise between jobs: one runner can
  // be twice as fast as another with the same code. So the metric step compares sides only when
  // their reports come from the same job (the same job_id on every report); otherwise it is
  // skipped and the case says it cannot compare performance across jobs.
  const aliveReports = evidence.filter((_, i) => sides[i].gatesPassed).map((e) => e.report);
  const jobs = aliveReports.map((r) => r?.job_id ?? null);
  const sameJob = jobs.length > 1 && jobs.every((j) => j && j === jobs[0]);
  const crossJob = Boolean(metric && measured && aliveReports.length > 1 && !sameJob);
  const pre = metric && measured && !crossJob ? { metric, higherIsBetter: higherIsBetter !== false, margin: 0.1 } : null;
  const arbitration = arbitrate({ domain, preRegistered: pre }, sides);
  const items = [];
  let n = 0;
  const add = (kind, text) => items.push({ id: `E${(n += 1)}`, kind, text });
  for (const [i, e] of evidence.entries()) {
    const s = sides[i];
    add('ci', `${s.id}: claim "ready" is ${e.verdict?.result ?? 'not verified'}: ${short(e.verdict?.reason, 200)}`);
    if (metric && s.metrics) add('metric', `${s.id}: ${metric} median ${s.metrics.median}, IQR ${s.metrics.iqrLow} to ${s.metrics.iqrHigh}`);
    add('diff', `${s.id}: ${s.diffLines ?? 'unknown'} changed lines in ${e.files?.length ?? 'unknown'} files${e.files?.length ? `: ${e.files.slice(0, 8).join(', ')}` : ''}`);
    const deps = newDependencies(e.baseReport, e.report);
    add('rule', `${s.id}: new dependencies: ${deps === null ? 'not compared (base or head report missing)' : deps.length ? deps.join(', ') : 'none'}; new failure modes: ${s.newFailureModes.length ? s.newFailureModes.join(', ') : 'none'}`);
    if (e.pr?.body) add('review', `${s.id} description: ${short(e.pr.body)}`);
  }
  if (crossJob) {
    add('rule', `${metric}: cannot compare across jobs. Each pull request ran its benchmark in a different CI job. A report's spread shows jitter inside one job only. No side wins on performance.`);
  }
  const alive = sides.filter((s) => s.gatesPassed);
  // Metric numbers that cannot be compared count as inside the noise for the opinion guards.
  const withinNoise = crossJob || (Boolean(pre) && alive.length > 1 && arbitration.decidedBy !== 'code-metric');
  const packet = {
    ticket: { key: issueKey, domain: domain || null, acs: (ticket?.acceptanceCriteria ?? []).map((a) => ({ acId: a.acId })) },
    question,
    sides: sides.map((s) => ({ id: s.id, gatesPassed: s.gatesPassed })),
    evidence: items,
    withinNoise,
    crossJob,
  };
  const highStake = Boolean(domain && HUMAN_DOMAINS.includes(domain));
  const opinionAllowed = question !== 'winner' || arbitration.decidedBy === 'human';
  return { packet, arbitration, opinionAllowed, highStake };
}

export function formatCase(issueKey, c) {
  const a = c.arbitration;
  const lines = [`Arbitration case on ${issueKey} (${c.packet.question}): ${c.packet.sides.map((s) => `${s.id} ${s.gatesPassed ? 'passes' : 'fails'} the gates`).join('; ')}.`];
  lines.push(a.winner ? `Decided by code (${a.decidedBy}, ${a.rule}): ${a.winner}. ${a.reason}` : `Code does not decide (${a.rule}): ${a.reason}`);
  if (c.packet.crossJob) lines.push('Performance: the pull requests ran in different CI jobs. Code does not compare their benchmarks.');
  if (c.highStake) lines.push(`${c.packet.ticket.domain} is decided by a human; the AI team lead may only summarise.`);
  else if (c.opinionAllowed) lines.push('The AI team lead may record an opinion. A human decides.');
  lines.push('Evidence:', ...c.packet.evidence.map((e) => `- ${e.id} ${e.text}`));
  return lines.join('\n');
}

export function formatOpinion(issueKey, record) {
  const o = record.opinion;
  const head = {
    opinion: `Opinion (not verified) on ${issueKey}: prefers ${o?.decision}. A human decides.`,
    human: `Opinion (not verified) on ${issueKey}: handed to a human (${record.guard}).`,
    summary_only: `Summary (not verified) on ${issueKey}: high-stake domain, a human decides.`,
    invalid_opinion: `Opinion on ${issueKey} discarded by guard "${record.guard}": ${record.reasons.join('; ')}. A human decides.`,
  }[record.outcome];
  const lines = [head];
  if (o && record.outcome !== 'invalid_opinion') {
    lines.push(...o.reasons.map((r) => `- ${r.text} [${r.evidence.join(', ')}]`));
    if (o.risks.length) lines.push(`Risks: ${o.risks.join('; ')}`);
    lines.push(`Confidence ${o.confidence}.`);
  }
  lines.push(`Prompt ${record.promptVersion}, input hash ${record.inputHash.slice(0, 12)}.`);
  return lines.join('\n');
}
