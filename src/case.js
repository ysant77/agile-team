// Arbitration cases (DESIGN.md sections 6a and 6b). Pure functions: the Forge glue collects the
// evidence, these build the sides, run the rule and the packet the AI team lead may see.

import { arbitrate, HUMAN_DOMAINS } from './arbitration.js';

export const QUESTIONS = ['winner', 'design', 'readability', 'manual_ac'];

// Only finite numbers count. Infinity (a report may hold 1e999), NaN or a string is a missing
// value, and a missing value sends the case to a human. An absent IQR bound falls back to the
// median; a present one that is not finite makes the metric missing.
function metricOf(report, name) {
  const value = report?.metrics?.[name];
  if (typeof value === 'number') return Number.isFinite(value) ? { median: value, iqrLow: value, iqrHigh: value } : null;
  if (!value || !Number.isFinite(value.median)) return null;
  const bound = (b) => (b === undefined || b === null ? value.median : Number.isFinite(b) ? b : null);
  const iqrLow = bound(value.iqr_low);
  const iqrHigh = bound(value.iqr_high);
  if (iqrLow === null || iqrHigh === null) return null;
  return { median: value.median, iqrLow, iqrHigh };
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

// The metrics a ticket registered before work started: its metric_at_least (higher is better)
// and metric_at_most (lower is better) ACs. The case never takes a metric or a direction from the
// caller (unit 2 review, items 1 and 2).
export function registeredMetrics(ticket) {
  const found = new Map();
  for (const a of ticket?.acceptanceCriteria ?? []) {
    const t = a.check?.type;
    if (t !== 'metric_at_least' && t !== 'metric_at_most') continue;
    const name = String(a.check.args?.[0] ?? '');
    if (!name) continue;
    const higherIsBetter = t === 'metric_at_least';
    const seen = found.get(name);
    // The same metric as both at least and at most: code cannot know the direction, so the
    // AC order must not choose it (PR 3 re-check, item 1).
    if (!seen) found.set(name, { metric: name, higherIsBetter });
    else if (seen.higherIsBetter !== higherIsBetter) seen.conflict = true;
  }
  return [...found.values()];
}

// The high-stake domain comes from the stored ticket spec (aat.ticket), never from the caller.
// collectJira does not read Jira labels, so a label does not set the domain.
export function ticketDomain(ticket) {
  return ticket?.domain && HUMAN_DOMAINS.includes(ticket.domain) ? ticket.domain : null;
}

// Caller input that disagrees with the ticket is refused.
export function caseInputErrors(payload, ticket) {
  const errors = [];
  const registered = registeredMetrics(ticket);
  const metric = String(payload?.metric ?? '').trim();
  if (metric) {
    const reg = registered.find((m) => m.metric === metric);
    if (reg?.conflict) errors.push(`${metric} is registered in both directions on ${ticket?.key ?? 'the ticket'}`);
    if (!reg) errors.push(`${metric} is not a registered metric of ${ticket?.key ?? 'the ticket'} (registered: ${registered.map((m) => m.metric).join(', ') || 'none'})`);
    const dir = payload?.higherIsBetter;
    if (reg && !reg.conflict && dir !== undefined && dir !== null && dir !== '') {
      const higher = dir !== false && dir !== 'false';
      if (higher !== reg.higherIsBetter) errors.push(`direction of ${metric} disagrees with the ticket (${reg.higherIsBetter ? 'higher' : 'lower'} is better)`);
    }
  }
  const domain = String(payload?.domain ?? '').trim();
  if (domain && domain !== ticketDomain(ticket)) errors.push(`domain ${domain} disagrees with the ticket (${ticketDomain(ticket) ?? 'none'})`);
  return errors;
}

// evidence per side: { prNumber, pr, report, baseReport, verdict, diffLines, files }. A value
// nobody measured stays null (unknown), never "none" (unit 2 review, item 3).
export function buildSide(e, metric) {
  return {
    id: `PR${e.prNumber}`,
    gatesPassed: e.verdict?.result === 'supported',
    gateReason: e.verdict?.reason ?? 'not verified',
    metrics: metric ? metricOf(e.report, metric) : null,
    // Measured from the evidence (unit 3); null when the file list or a report is missing.
    newFailureModes: Array.isArray(e.newFailureModes) ? e.newFailureModes
      : Array.isArray(e.files) ? newFailureModes({ files: e.files, report: e.report }) : null,
    newDependencies: Array.isArray(e.newDependencies) ? e.newDependencies : newDependencies(e.baseReport, e.report),
    diffLines: typeof e.diffLines === 'number' ? e.diffLines : null,
  };
}

const short = (text, n = 400) => (String(text ?? '').length > n ? `${String(text).slice(0, n)}...` : String(text ?? ''));

export function buildPacket({ issueKey, ticket, question, evidence }) {
  const domain = ticketDomain(ticket);
  const registered = registeredMetrics(ticket);
  // Two registered metrics: code cannot know which one decides, so a human does.
  const metricConflict = registered.filter((m) => m.conflict).map((m) => m.metric);
  const pre = registered.length === 1 && !metricConflict.length ? { ...registered[0], margin: 0.1 } : null;
  const metric = pre?.metric ?? null;
  const sides = evidence.map((e) => buildSide(e, metric));
  const arbitration = arbitrate({ domain, preRegistered: pre, metricDisputed: registered.length > 1, metricConflict }, sides);
  const items = [];
  let n = 0;
  const add = (kind, text) => items.push({ id: `E${(n += 1)}`, kind, text });
  for (const [i, e] of evidence.entries()) {
    const s = sides[i];
    add('ci', `${s.id}: claim "ready" is ${e.verdict?.result ?? 'not verified'}: ${short(e.verdict?.reason, 200)}`);
    if (metric && s.metrics) add('metric', `${s.id}: ${metric} median ${s.metrics.median}, IQR ${s.metrics.iqrLow} to ${s.metrics.iqrHigh}`);
    add('diff', `${s.id}: ${s.diffLines ?? 'unknown'} changed lines in ${e.files?.length ?? 'unknown'} files${e.files?.length ? `: ${e.files.slice(0, 8).join(', ')}` : ''}`);
    const deps = s.newDependencies;
    const modes = s.newFailureModes;
    add('rule', `${s.id}: new dependencies: ${deps === null ? 'not known (base or head report missing)' : deps.length ? deps.join(', ') : 'none'}; new failure modes: ${modes === null ? 'not known (file list missing)' : modes.length ? modes.join(', ') : 'none'}`);
    // Written by the PR author: shown, but it never grounds a number (unit 2 review, item 5).
    if (e.pr?.body) add('pr_text', `${s.id} description: ${short(e.pr.body)}`);
  }
  const alive = sides.filter((s) => s.gatesPassed);
  const withinNoise = Boolean(pre) && alive.length > 1 && arbitration.decidedBy !== 'code-metric';
  const packet = {
    ticket: { key: issueKey, domain: domain || null, acs: (ticket?.acceptanceCriteria ?? []).map((a) => ({ acId: a.acId })) },
    question,
    sides: sides.map((s) => ({ id: s.id, gatesPassed: s.gatesPassed })),
    evidence: items,
    withinNoise,
  };
  const highStake = Boolean(domain && HUMAN_DOMAINS.includes(domain));
  const opinionAllowed = question !== 'winner' || arbitration.decidedBy === 'human';
  return { packet, arbitration, opinionAllowed, highStake };
}

export function formatCase(issueKey, c) {
  const a = c.arbitration;
  const lines = [`Arbitration case on ${issueKey} (${c.packet.question}): ${c.packet.sides.map((s) => `${s.id} ${s.gatesPassed ? 'passes' : 'fails'} the gates`).join('; ')}.`];
  if (a.winner) lines.push(`Decided by code (${a.decidedBy}, ${a.rule}): ${a.winner}. ${a.reason}`);
  else if (a.recommendation) lines.push(`Recommended, not verified: ${a.recommendation.id} (${a.recommendation.rule}). ${a.reason}. A human decides.`);
  else lines.push(`Code does not decide (${a.rule}): ${a.reason}`);
  if (c.highStake) lines.push(`${c.packet.ticket.domain} is decided by a human; the AI team lead may only summarise.`);
  else if (c.opinionAllowed) lines.push('The AI team lead may record an opinion. A human decides.');
  lines.push(`Evidence: ${c.packet.evidence.map((e) => `${e.id} ${e.text}`).join(' | ')}`);
  return lines.join('\n');
}

export function formatOpinion(issueKey, record, arbitration = null) {
  const o = record.opinion;
  // A design or readability opinion may prefer another PR than the code result: say so plainly
  // (unit 2 review, item 10).
  const rec = arbitration?.recommendation;
  const against = arbitration?.winner && o?.decision && o.decision !== arbitration.winner
    ? `, against the code result ${arbitration.winner} (${arbitration.rule})`
    : rec && o?.decision && o.decision !== rec.id ? `, which differs from the recommendation ${rec.id} (${rec.rule})` : '';
  const head = {
    opinion: `Opinion (not verified) on ${issueKey}: prefers ${o?.decision}${against}. A human decides.`,
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
