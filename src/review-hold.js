// Arm D rating rule in the app: a review can hold a claim, never pass one. This module does not
// import review.js, because review.js reads VERIFY_CONFIG from verify-claim.js when it loads.

export const HOLD_CLAIMS = ['ready', 'fixed', 'done'];

// The findings that can hold a claim. Only an accepted review counts.
export function blockingFindings(record) {
  if (record?.outcome !== 'review' || !record.review) return [];
  return record.review.findings.filter((f) => f.severity === 'blocking' && f.ac);
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
  const where = [...new Set(findings.map((f) => `${f.hunk} ${f.file}:${f.line}`))].join(', ');
  return {
    ...verdict,
    result: 'cannot_verify',
    reason: `${acs.join(', ')}: the code checks passed, but a person must check the reviewer's blocking finding (${where}) on head ${headSha.slice(0, 7)}`,
    reviewHold: { acs, headSha },
  };
}
