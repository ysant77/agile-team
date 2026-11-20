// Arm D rating rule in the app: a review can hold a claim, never pass one. This module does not
// import review.js, because review.js reads VERIFY_CONFIG from verify-claim.js when it loads.

export const HOLD_CLAIMS = ['ready', 'fixed', 'done'];

// Rule (iii), 17 Nov: a finding states a defect only when its text has words beyond a reference.
// Hunk ids, file paths, line references, AC ids, numbers and the words "finding", "see", "line"
// and "hunk" are removed first. "Finding 1: see P121:H3, line 62." states nothing. Known limit: a
// short word such as "Bad." still passes; it can only hold a claim for a person to check.
const REFERENCE_WORDS = /\b(?:findings?|see|lines?|hunks?|at|in|on|of|the|and)\b/gi;
export function statesDefect(text) {
  if (typeof text !== 'string') return false;
  const rest = text
    .replace(/\bP\d+:H\d+\b/g, ' ')
    .replace(/[\w./-]+\.\w+(?::\d+)?/g, ' ')
    .replace(/\bAC\d+\b/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(REFERENCE_WORDS, ' ');
  return /[A-Za-z]{2,}/.test(rest);
}

// The findings that can hold a claim. Only an accepted review counts. Rule (ii), 17 Nov: after a
// style fallback the record keeps the model's guard-accepted findings in `modelFindings`, and the
// hold uses them; the template in `review.findings` is only what people see. A malformed stored
// review (findings not an array, a finding that is not an object) gives no finding and never
// throws.
export function blockingFindings(record) {
  if (record?.outcome !== 'review') return [];
  const source = Array.isArray(record.modelFindings) ? record.modelFindings : record.review?.findings;
  if (!Array.isArray(source)) return [];
  return source.filter((f) => f !== null && typeof f === 'object' && f.severity === 'blocking' && f.ac && statesDefect(f.text));
}

// A supported ready, fixed or done claim becomes cannot_verify when an accepted review for the
// same head commit has a blocking finding with an AC. Any other verdict is returned unchanged.
// Fail-open by design: no review, a refused review, a review for another head or a failed read
// changes nothing, so a model failure cannot block every claim; the code checks still decide.
export function applyReviewHold(verdict, claim, reviews, headSha) {
  if (verdict.result !== 'supported' || !HOLD_CLAIMS.includes(claim.type) || !headSha) return verdict;
  const findings = (Array.isArray(reviews) ? reviews : [])
    .filter((r) => r?.headSha === headSha)
    .flatMap(blockingFindings);
  if (findings.length === 0) return verdict;
  const acs = [...new Set(findings.map((f) => f.ac))];
  // The reason shows the model's own defect statement, not only the place (rule ii).
  const where = [...new Set(findings.map((f) => `${f.hunk} ${f.file}:${f.line}: "${String(f.text).trim()}"`))].join('; ');
  return {
    ...verdict,
    result: 'cannot_verify',
    reason: `${acs.join(', ')}: the code checks passed, but a person must check the reviewer's blocking finding (${where}) on head ${headSha.slice(0, 7)}`,
    reviewHold: { acs, headSha },
  };
}
