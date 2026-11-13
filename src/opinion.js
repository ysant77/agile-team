// AI team lead opinion (DESIGN.md section 6b). The model gives an opinion only; code checks the
// schema, applies the guards and always leaves the decision to a human.

import { canonical, sha256 } from './audit.js';
import { HUMAN_DOMAINS } from './arbitration.js';
import { numbersIn } from './lint.js';

// Version of the guards below. 2 (13 Nov): exact-match ids and numbers in risks. The bake-off
// records it; lead rows scored under another version are re-run, not compared.
export const GUARD_VERSION = 2;
export const OPINION_PROMPT_VERSION = 'lead-opinion/1';
export const MIN_CONFIDENCE = 0.7;
export const MAX_REASONS = 5;
export const LABEL = 'Opinion (not verified)';

// JSON schema for structured output (Ollama `format`) and for the Rovo action input.
export const OPINION_SCHEMA = {
  type: 'object',
  required: ['decision', 'reasons', 'confidence', 'risks'],
  properties: {
    decision: { type: 'string', description: 'a side id, or "human"' },
    reasons: {
      type: 'array',
      maxItems: MAX_REASONS,
      items: {
        type: 'object',
        required: ['text', 'evidence'],
        properties: {
          text: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    risks: { type: 'array', items: { type: 'string' } },
  },
};

// packet: { ticket: { key, domain, acs: [{ acId }] }, sides: [{ id, gatesPassed }],
//           evidence: [{ id, kind, text }], withinNoise }
export function packetHash(packet) {
  return sha256(canonical(packet));
}

export function validateOpinion(raw) {
  const errors = [];
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ['not valid JSON'] };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['not a JSON object'] };
  }
  if (typeof value.decision !== 'string' || !value.decision.trim()) errors.push('decision missing');
  if (!Array.isArray(value.reasons) || value.reasons.length === 0) errors.push('reasons missing');
  else if (value.reasons.length > MAX_REASONS) errors.push(`more than ${MAX_REASONS} reasons`);
  else {
    value.reasons.forEach((r, i) => {
      if (!r || typeof r.text !== 'string' || !r.text.trim()) errors.push(`reason ${i + 1}: no text`);
      if (!Array.isArray(r?.evidence) || r.evidence.length === 0) {
        errors.push(`reason ${i + 1}: cites no evidence`);
      }
    });
  }
  const c = value.confidence;
  if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1) errors.push('confidence not in 0..1');
  if (value.risks !== undefined && !Array.isArray(value.risks)) errors.push('risks not a list');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    opinion: {
      decision: value.decision.trim(),
      reasons: value.reasons.map((r) => ({ text: r.text.trim(), evidence: r.evidence.map(String) })),
      confidence: c,
      risks: (value.risks ?? []).map(String),
    },
  };
}

// Identifiers that must match exactly: commit shas (7 to 40 hex with a digit and a letter), PR
// references, evidence ids, AC ids and issue keys.
export function idsIn(text) {
  const t = String(text ?? '');
  const shas = (t.match(/\b[0-9a-f]{7,40}\b/g) ?? []).filter((x) => /[0-9]/.test(x) && /[a-f]/.test(x));
  const refs = t.match(/\b(PR ?#?\d+|E\d+|AC\d+|[A-Z][A-Z0-9]+-\d+)\b/g) ?? [];
  return [...new Set([...shas, ...refs.map((r) => r.replace(/^PR ?#?/, 'PR'))])];
}

function groundedNumbers(packet) {
  const texts = [
    ...packet.evidence.flatMap((e) => [e.id, e.text]),
    ...packet.sides.map((s) => s.id),
    packet.ticket?.key ?? '',
    ...(packet.ticket?.acs ?? []).map((a) => a.acId),
  ];
  return new Set(texts.flatMap(numbersIn));
}

// Returns the record that is shown and audited. `outcome` is one of:
//   'opinion'          the opinion stands as advice; a human still decides
//   'human'            handed to a human (low confidence, noise, or the model chose human)
//   'summary_only'     high-stake domain: the opinion is shown as a summary, a human decides
//   'invalid_opinion'  discarded by a guard; a human decides
export function applyGuards(raw, packet, meta = {}) {
  const base = {
    label: LABEL,
    promptVersion: meta.promptVersion ?? OPINION_PROMPT_VERSION,
    model: meta.model ?? null,
    digest: meta.digest ?? null,
    inputHash: packetHash(packet),
    finalDecision: 'human',
  };
  const checked = validateOpinion(raw);
  if (!checked.ok) return { ...base, outcome: 'invalid_opinion', guard: 'schema', reasons: checked.errors, opinion: null };
  const opinion = checked.opinion;
  const invalid = (guard, why) => ({ ...base, outcome: 'invalid_opinion', guard, reasons: [why], opinion });

  const sides = new Map(packet.sides.map((s) => [s.id, s]));
  if (opinion.decision !== 'human' && !sides.has(opinion.decision)) {
    return invalid('unknown-side', `decision "${opinion.decision}" is not a side of this case`);
  }
  // Guard 1: an opinion cannot override a failed check.
  if (opinion.decision !== 'human' && !sides.get(opinion.decision).gatesPassed) {
    return invalid('failed-gate', `${opinion.decision} failed a gate; an opinion cannot override a check`);
  }
  const evidence = new Map(packet.evidence.map((e) => [e.id, e]));
  for (const reason of opinion.reasons) {
    const missing = reason.evidence.filter((id) => !evidence.has(id));
    if (missing.length) return invalid('unknown-evidence', `cites unknown evidence ${missing.join(', ')}`);
  }
  // Guard 3b: exact match. Every commit sha, PR, evidence, AC and issue id in the reasons and
  // risks must appear verbatim in the packet; risks get the number check too.
  const packetText = [...packet.evidence.flatMap((e) => [e.id, e.text]), ...packet.sides.map((s) => s.id),
    packet.ticket?.key ?? '', ...(packet.ticket?.acs ?? []).map((a) => a.acId)].join(' ');
  for (const text of [...opinion.reasons.map((r) => r.text), ...(opinion.risks ?? [])]) {
    const ids = idsIn(text).filter((id) => !packetText.includes(id));
    if (ids.length) return invalid('ungrounded-id', `${ids.join(', ')} not in the evidence`);
  }
  // Guard 3: every number in the reasons must appear in the evidence.
  const allowed = groundedNumbers(packet);
  for (const reason of opinion.reasons) {
    const bad = numbersIn(reason.text).filter((n) => !allowed.has(n));
    if (bad.length) return invalid('ungrounded-number', `${bad.join(', ')} not in the evidence`);
  }
  for (const risk of opinion.risks ?? []) {
    const bad = numbersIn(risk).filter((n) => !allowed.has(n));
    if (bad.length) return invalid('ungrounded-number', `${bad.join(', ')} not in the evidence`);
  }
  // Guard 2: hand to a human.
  const domain = packet.ticket?.domain;
  if (domain && HUMAN_DOMAINS.includes(domain)) {
    return { ...base, outcome: 'summary_only', guard: 'high-stake', reasons: [`${domain} is decided by a human`], opinion };
  }
  if (opinion.decision === 'human') {
    return { ...base, outcome: 'human', guard: 'model', reasons: ['the opinion asks for a human'], opinion };
  }
  if (opinion.confidence < MIN_CONFIDENCE) {
    return { ...base, outcome: 'human', guard: 'low-confidence', reasons: [`confidence ${opinion.confidence} < ${MIN_CONFIDENCE}`], opinion };
  }
  const cited = opinion.reasons.flatMap((r) => r.evidence.map((id) => evidence.get(id).kind));
  if (packet.withinNoise && cited.every((kind) => kind === 'metric')) {
    return { ...base, outcome: 'human', guard: 'noise', reasons: ['the metric difference is inside the noise and nothing else is cited'], opinion };
  }
  return { ...base, outcome: 'opinion', guard: null, reasons: [], opinion };
}

// The side the opinion advises, or 'human' when a guard handed the case on.
export function advised(record) {
  return record.outcome === 'opinion' ? record.opinion.decision : 'human';
}
