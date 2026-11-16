// The style test set: every text a human reads that code renders, plus sample free-text answers.
import { readFileSync } from 'node:fs';
import { formatCase, formatOpinion, buildPacket } from '../src/case.js';
import { applyGuards } from '../src/opinion.js';
import { formatDecision } from '../src/decision.js';
import { formatVerdict } from '../src/verify-claim.js';
import { buildMonitor } from '../src/monitor.js';
import { applyReviewGuards, buildReviewPacket, formatReview } from '../src/review.js';

const side = (n, result, diff, extra = {}) => ({ prNumber: n, verdict: { result, reason: `${result} by checks` }, diffLines: diff, files: ['src/bank/ledger.py'], pr: { body: `Fix for PR${n}` }, report: { metrics: {} }, ...extra });
const base = { issueKey: 'BANK-32', ticket: { acceptanceCriteria: [{ acId: 'AC1' }] }, domain: null, question: 'winner', metric: null };

export function renderedTexts() {
  const verdict = { result: 'contradicted', reason: 'AC1: test_BANK4_concurrent_withdrawals_20_threads failed', checkerVersion: 'verifier/1',
    checks: [{ name: 'ci_green', status: 'pass', reason: 'CI: success' }, { name: 'ac_mapped', status: 'fail', reason: '1 of 2 AC(s) failed',
      parts: [{ acId: 'AC1', name: 'test_passes(test_BANK4_concurrent_withdrawals_20_threads)', status: 'fail', reason: 'failed in the CI report' }] }] };
  const tie = buildPacket({ ...base, evidence: [side(5, 'supported', 40), side(7, 'supported', 40)] });
  const smaller = buildPacket({ ...base, evidence: [side(5, 'supported', 12), side(7, 'supported', 140)] });
  const cross = buildPacket({ ...base, metric: 'transfers_per_s', evidence: [side(5, 'supported', 40, { report: { job_id: 'a', metrics: { transfers_per_s: 10 } } }), side(7, 'supported', 60, { report: { job_id: 'b', metrics: { transfers_per_s: 20 } } })] });
  const opinion = applyGuards({ decision: 'PR7', reasons: [{ text: 'PR7 keeps one write path for balances.', evidence: ['E3'] }], confidence: 0.8, risks: ['PR7 adds 60 changed lines.'] }, tie.packet);
  const decision = { side: 'PR7', reason: 'the lock table is easier to read', codeWinner: 'PR5', agreesWithCode: false, opinionSide: 'PR7', agreesWithOpinion: true, overridesFailedGate: false };
  const monitor = buildMonitor([]);
  const s56 = JSON.parse(readFileSync('fixtures/S56.json', 'utf8')).steps[1];
  const review = applyReviewGuards(s56.review, buildReviewPacket(s56.packet));
  return [
    ['verdict comment', formatVerdict('BANK-4', { type: 'fixed' }, verdict, { githubConfigured: true })],
    ['case (tie)', formatCase('BANK-32', tie)],
    ['case (smaller diff)', formatCase('BANK-32', smaller)],
    ['case (cross job)', formatCase('BANK-32', cross)],
    ['opinion comment', formatOpinion('BANK-32', opinion)],
    ['decision comment', formatDecision('BANK-32', decision)],
    ['review comment', formatReview('BANK-4', 61, review)],
    ['review comment (refused)', formatReview('BANK-4', 61, { ...review, outcome: 'invalid_review', guard: 'unknown-hunk', review: null })],
    ...monitor.notes.map((n, i) => [`monitor note ${i + 1}`, n]),
    ['skill: write-checkable-ticket', readFileSync('skills/write-checkable-ticket/SKILL.md', 'utf8').split('---').slice(2).join('---')],
    ['skill: explain-verdicts', readFileSync('skills/explain-verdicts/SKILL.md', 'utf8').split('---').slice(2).join('---')],
    ['skill: review-pull-request', readFileSync('skills/review-pull-request/SKILL.md', 'utf8').split('---').slice(2).join('---')],
  ];
}

// Free-text answers in the style a model writes without a contract (written for this set, 13 Nov).
export const MODEL_SAMPLES = JSON.parse(readFileSync('test/fixtures-style/model-samples.json', 'utf8'));
