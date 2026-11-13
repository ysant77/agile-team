// Human decision on an arbitration case (DESIGN 6c, gap 4). A Jira comment
//   decision: PR7 because the lock table is easier to reason about
// is parsed, checked against the open case and audited next to it. Pure functions; the comment
// trigger does the reading and writing.

const DECISION_RE = /^\s*decision:\s*PR\s*#?(\d+)\s+because\s+([\s\S]+)$/i;
const MIN_REASON = 5;

export function parseDecision(text) {
  const m = DECISION_RE.exec(String(text ?? ''));
  if (!m) return null;
  return { prNumber: Number(m[1]), reason: m[2].trim().replace(/\s+/g, ' ') };
}

// The last opinion that counted (not discarded by a guard), if any.
function lastOpinionSide(kase) {
  const valid = (kase.opinions ?? []).filter((o) => o.outcome === 'opinion' && o.opinion?.decision);
  return valid.length ? valid[valid.length - 1].opinion.decision : null;
}

export function applyDecision(kase, parsed, { by, at }) {
  if (!kase) return { ok: false, error: 'no open arbitration case on this work item; call open-case first' };
  if (!(kase.prNumbers ?? []).includes(parsed.prNumber)) {
    return { ok: false, error: `PR${parsed.prNumber} is not in the case (sides: ${(kase.prNumbers ?? []).map((n) => `PR${n}`).join(', ')})` };
  }
  if (parsed.reason.length < MIN_REASON) return { ok: false, error: `a reason of at least ${MIN_REASON} characters is required` };
  const side = `PR${parsed.prNumber}`;
  const failedGate = (kase.packet?.sides ?? []).find((s) => s.id === side && s.gatesPassed === false);
  const opinionSide = lastOpinionSide(kase);
  const record = {
    side,
    reason: parsed.reason,
    by,
    at,
    codeWinner: kase.arbitration?.winner ?? null,
    agreesWithCode: kase.arbitration?.winner ? kase.arbitration.winner === side : null,
    opinionSide,
    agreesWithOpinion: opinionSide ? opinionSide === side : null,
    // A human may choose a side that failed a gate; it is recorded, never hidden.
    overridesFailedGate: Boolean(failedGate),
  };
  return { ok: true, record, kase: { ...kase, decisions: [...(kase.decisions ?? []), record] } };
}

export function formatDecision(issueKey, record) {
  const lines = [`Human decision on ${issueKey}: ${record.side}. Reason: ${record.reason}`];
  if (record.codeWinner) {
    lines.push(record.agreesWithCode ? `This agrees with the code decision (${record.codeWinner}).` : `This overrides the code decision (${record.codeWinner}).`);
  }
  if (record.opinionSide) {
    lines.push(`The AI team lead's opinion (not verified) preferred ${record.opinionSide}; ${record.agreesWithOpinion ? 'the decision agrees' : 'the decision differs'}.`);
  }
  if (record.overridesFailedGate) lines.push(`Warning: ${record.side} failed a gate.`);
  return lines.join('\n');
}
