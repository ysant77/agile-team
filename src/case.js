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

// evidence per side: { prNumber, pr, report, verdict, diffLines, files }
export function buildSide(e, metric) {
  return {
    id: `PR${e.prNumber}`,
    gatesPassed: e.verdict?.result === 'supported',
    gateReason: e.verdict?.reason ?? 'not verified',
    metrics: metric ? metricOf(e.report, metric) : null,
    newFailureModes: [],
    newDependencies: e.newDependencies ?? [],
    diffLines: e.diffLines ?? null,
  };
}

const short = (text, n = 400) => (String(text ?? '').length > n ? `${String(text).slice(0, n)}...` : String(text ?? ''));

export function buildPacket({ issueKey, ticket, domain, question, metric, higherIsBetter, evidence }) {
  const sides = evidence.map((e) => buildSide(e, metric));
  // The metric step needs the metric from every side that passes the gates; otherwise skip it.
  const measured = sides.filter((s) => s.gatesPassed).every((s) => s.metrics);
  const pre = metric && measured ? { metric, higherIsBetter: higherIsBetter !== false, margin: 0.1 } : null;
  const arbitration = arbitrate({ domain, preRegistered: pre }, sides);
  const items = [];
  let n = 0;
  const add = (kind, text) => items.push({ id: `E${(n += 1)}`, kind, text });
  for (const [i, e] of evidence.entries()) {
    const s = sides[i];
    add('ci', `${s.id}: claim "ready" is ${e.verdict?.result ?? 'not verified'}: ${short(e.verdict?.reason, 200)}`);
    if (metric && s.metrics) add('metric', `${s.id}: ${metric} median ${s.metrics.median}, IQR ${s.metrics.iqrLow} to ${s.metrics.iqrHigh}`);
    add('diff', `${s.id}: ${s.diffLines ?? 'unknown'} changed lines in ${e.files?.length ?? 'unknown'} files${e.files?.length ? `: ${e.files.slice(0, 8).join(', ')}` : ''}`);
    if (e.pr?.body) add('review', `${s.id} description: ${short(e.pr.body)}`);
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
