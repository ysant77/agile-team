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

// Linked GitHub accounts of Jira people: "accountId=login" pairs, comma separated (Forge variable
// GITHUB_ACCOUNTS, set by a site admin). A Jira account id and a GitHub login are different
// identities; this list is the only link between them. Logins are compared in lower case.
export function parseGithubAccounts(text) {
  const out = {};
  for (const pair of String(text ?? '').split(',')) {
    const i = pair.lastIndexOf('=');
    if (i <= 0) continue;
    const accountId = pair.slice(0, i).trim();
    const login = pair.slice(i + 1).trim().toLowerCase();
    if (accountId && login) out[accountId] = login;
  }
  return out;
}

const knownLogin = (a) => typeof a?.login === 'string' && a.login.trim() !== '';

// Owner decision 19 Nov (item 3): a decision is not recorded from the author of a PR in the case
// or from the claimant of the latest claim on the work item. Fail safe: when the app cannot show
// that the decider is neither, it does not record. Returns the reason, or null when allowed.
//   by: the Jira account of the decider; kase: the stored case with prAuthors { PR7: { login, id } };
//   latestClaim: { by } or null (no claim on the work item); accounts: parseGithubAccounts output.
export function deciderRule({ by, kase, latestClaim, accounts }) {
  if (typeof by !== 'string' || !by) return 'Jira did not say who wrote the decision';
  if (latestClaim) {
    if (typeof latestClaim.by !== 'string' || !latestClaim.by) return 'the claimant of the latest claim is not known, so the app cannot show that you are another person';
    if (latestClaim.by === by) return 'you made the latest claim on this work item, and a decision must come from another person';
  }
  const sides = (kase?.prNumbers ?? []).map((n) => `PR${n}`);
  for (const side of sides) {
    if (!knownLogin(kase?.prAuthors?.[side])) return `the author of ${side} is not known, so the app cannot show that you did not write it; open the case again`;
  }
  const login = accounts?.[by];
  if (!login) return 'your GitHub account is not linked (Forge variable GITHUB_ACCOUNTS), so the app cannot show that you did not write a PR in the case';
  const own = sides.filter((side) => kase.prAuthors[side].login.trim().toLowerCase() === login);
  if (own.length) return `you are the author of ${own.join(' and ')}, and a decision must come from another person`;
  return null;
}
