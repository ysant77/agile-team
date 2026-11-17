// Plain-English gate for the AI team lead's free text (reasons and risks) before it is shown or
// audited. First failure: the agent gets the lint findings and one retry. Second failure: the
// text is replaced by a template built from the structured fields, and the record says so.

import { lintMessage, lintText, STYLE_CONTRACT } from './style.js';

export function lintOpinion(opinion) {
  const parts = [...(opinion?.reasons ?? []).map((r) => r.text), ...(opinion?.risks ?? [])];
  return parts.flatMap((t) => lintText(t, { kind: 'description' }).findings);
}

export function templateOpinion(opinion) {
  return {
    ...opinion,
    reasons: (opinion.reasons ?? []).map((r, i) => ({ ...r, text: `Reason ${i + 1} for ${opinion.decision}: see ${r.evidence.join(', ')}.` })),
    risks: (opinion.risks ?? []).map((_, i) => `Risk ${i + 1}: see the audited opinion input.`),
  };
}

// record: the output of applyGuards. retries: how many style retries this case already used.
export function styleGate(record, retries) {
  if (!record.opinion || record.outcome === 'invalid_opinion') return { action: 'accept', record };
  const findings = lintOpinion(record.opinion);
  if (findings.length === 0) return { action: 'accept', record: { ...record, style: 'pass' } };
  if (retries < 1) {
    return { action: 'retry', message: `Style findings: ${lintMessage(findings)}. ${STYLE_CONTRACT} Rewrite the reasons and risks, keep the same decision and evidence ids, and call record-opinion again.` };
  }
  return { action: 'accept', record: { ...record, opinion: templateOpinion(record.opinion), style: 'fallback', styleFindings: findings.length } };
}
