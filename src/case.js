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

// The metrics a ticket registered before work started: its metric_at_least (higher is better)
// and metric_at_most (lower is better) ACs. The case never takes a metric or a direction from the
// caller (unit 2 review, items 1 and 2).
export function registeredMetrics(ticket) {
  const found = new Map();
  for (const a of ticket?.acceptanceCriteria ?? []) {
    const t = a.check?.type;
    if (t !== 'metric_at_least' && t !== 'metric_at_most') continue;
    const name = String(a.check.args?.[0] ?? '');
    if (name && !found.has(name)) found.set(name, { metric: name, higherIsBetter: t === 'metric_at_least' });
  }
  return [...found.values()];
}

// The high-stake domain comes from the ticket (field or label), never from the caller.
export function ticketDomain(ticket) {
  if (ticket?.domain && HUMAN_DOMAINS.includes(ticket.domain)) return ticket.domain;
  return (ticket?.labels ?? []).find((l) => HUMAN_DOMAINS.includes(l)) ?? null;
}

// Caller input that disagrees with the ticket is refused.
export function caseInputErrors(payload, ticket) {
  const errors = [];
  const registered = registeredMetrics(ticket);
  const metric = String(payload?.metric ?? '').trim();
  if (metric) {
    const reg = registered.find((m) => m.metric === metric);
    if (!reg) errors.push(`${metric} is not a registered metric of ${ticket?.key ?? 'the ticket'} (registered: ${registered.map((m) => m.metric).join(', ') || 'none'})`);
    const dir = payload?.higherIsBetter;
    if (reg && dir !== undefined && dir !== null && dir !== '') {
      const higher = dir !== false && dir !== 'false';
      if (higher !== reg.higherIsBetter) errors.push(`direction of ${metric} disagrees with the ticket (${reg.higherIsBetter ? 'higher' : 'lower'} is better)`);
    }
  }
  const domain = String(payload?.domain ?? '').trim();
  if (domain && domain !== ticketDomain(ticket)) errors.push(`domain ${domain} disagrees with the ticket (${ticketDomain(ticket) ?? 'none'})`);
  return errors;
}

// evidence per side: { prNumber, pr, report, verdict, diffLines, files, newFailureModes,
// newDependencies }. A value nobody measured stays null (unknown), never "none".
export function buildSide(e, metric) {
  return {
    id: `PR${e.prNumber}`,
    gatesPassed: e.verdict?.result === 'supported',
    gateReason: e.verdict?.reason ?? 'not verified',
    metrics: metric ? metricOf(e.report, metric) : null,
    newFailureModes: Array.isArray(e.newFailureModes) ? e.newFailureModes : null,
    newDependencies: Array.isArray(e.newDependencies) ? e.newDependencies : null,
    diffLines: typeof e.diffLines === 'number' ? e.diffLines : null,
  };
}

const short = (text, n = 400) => (String(text ?? '').length > n ? `${String(text).slice(0, n)}...` : String(text ?? ''));

export function buildPacket({ issueKey, ticket, question, evidence }) {
  const domain = ticketDomain(ticket);
  const registered = registeredMetrics(ticket);
  // Two registered metrics: code cannot know which one decides, so a human does.
  const pre = registered.length === 1 ? { ...registered[0], margin: 0.1 } : null;
  const metric = pre?.metric ?? null;
  const sides = evidence.map((e) => buildSide(e, metric));
  const arbitration = arbitrate({ domain, preRegistered: pre, metricDisputed: registered.length > 1 }, sides);
  const items = [];
  let n = 0;
  const add = (kind, text) => items.push({ id: `E${(n += 1)}`, kind, text });
  for (const [i, e] of evidence.entries()) {
    const s = sides[i];
    add('ci', `${s.id}: claim "ready" is ${e.verdict?.result ?? 'not verified'}: ${short(e.verdict?.reason, 200)}`);
    if (metric && s.metrics) add('metric', `${s.id}: ${metric} median ${s.metrics.median}, IQR ${s.metrics.iqrLow} to ${s.metrics.iqrHigh}`);
    add('diff', `${s.id}: ${s.diffLines ?? 'unknown'} changed lines in ${e.files?.length ?? 'unknown'} files${e.files?.length ? `: ${e.files.slice(0, 8).join(', ')}` : ''}`);
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
  lines.push(a.winner ? `Decided by code (${a.decidedBy}, ${a.rule}): ${a.winner}. ${a.reason}` : `Code does not decide (${a.rule}): ${a.reason}`);
  if (c.highStake) lines.push(`${c.packet.ticket.domain} is decided by a human; the AI team lead may only summarise.`);
  else if (c.opinionAllowed) lines.push('The AI team lead may record an opinion. A human decides.');
  lines.push(`Evidence: ${c.packet.evidence.map((e) => `${e.id} ${e.text}`).join(' | ')}`);
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
