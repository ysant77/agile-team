// Review advice (owner decision 20 Nov, item 1): a model review is advice only. A stored finding
// is shown with its hunk, its file and line, and the changed line quoted from the packet by code,
// marked "advice from a model, not counted". It never changes a verdict: the result, the reason
// and the checks stay as code decided them. Before 20 Nov, applyReviewHold here turned a supported
// ready, fixed or done claim into cannot_verify when a blocking finding was stored for the head
// commit; src/verify-claim.js called it on every supported claim and no config turned it off.
// This module does not import review.js, because review.js reads VERIFY_CONFIG from
// verify-claim.js when it loads.

export const ADVICE_LABEL = 'advice from a model, not counted';
export const ADVICE_HEADING = 'Advice from a model, not counted';
export const ADVICE_NOTE = 'A model wrote this. Code did not check it, and it does not change the verdict. A person may read it.';
export const MAX_ADVICE = 6;

// Rule (iii), 17 Nov: a finding states a defect only when its text has words beyond a reference.
// Hunk ids, file paths, line references, AC ids, numbers and the words "finding", "see", "line"
// and "hunk" are removed first. "Finding 1: see P121:H3, line 62." states nothing. Known limit: a
// short word such as "Bad." still passes; it is advice only.
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

// The guard-accepted findings of an accepted review that state a defect. Rule (ii), 17 Nov: after a
// style fallback the record keeps the model's findings in `modelFindings`; the template in
// `review.findings` has no defect statement. A malformed stored review gives none and never throws.
function adviceFindings(record) {
  if (record?.outcome !== 'review') return [];
  const source = Array.isArray(record.modelFindings) ? record.modelFindings : record.review?.findings;
  if (!Array.isArray(source)) return [];
  return source.filter((f) => f !== null && typeof f === 'object' && typeof f.hunk === 'string' && statesDefect(f.text));
}

// The blocking findings with an AC (guard 7). They are advice like any other finding; the severity
// is shown, never counted.
export function blockingFindings(record) {
  return adviceFindings(record).filter((f) => f.severity === 'blocking' && f.ac);
}

const clip = (text, max) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// The advice items for one head commit: only reviews of that head, only accepted findings.
export function reviewAdvice(reviews, headSha) {
  if (!headSha || !Array.isArray(reviews)) return [];
  const seen = new Set();
  const items = [];
  for (const f of reviews.filter((r) => r?.headSha === headSha).flatMap(adviceFindings)) {
    const item = {
      label: ADVICE_LABEL,
      hunk: clip(f.hunk, 20),
      file: clip(f.file, 120),
      line: Number.isInteger(f.line) ? f.line : null,
      quote: typeof f.quote === 'string' ? f.quote.slice(0, 200) : null,
      severity: f.severity === 'blocking' ? 'blocking' : 'note',
      ac: typeof f.ac === 'string' && f.ac ? clip(f.ac, 20) : null,
      text: clip(f.text, 300),
    };
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= MAX_ADVICE) break;
  }
  return items;
}

// The verdict with the advice attached. The result, the reason and the checks are not touched.
export function withAdvice(verdict, reviews, headSha) {
  return { ...verdict, advice: reviewAdvice(reviews, headSha) };
}

export function adviceLine(a) {
  const where = `${a.hunk} ${a.file}:${a.line ?? '?'} ${typeof a.quote === 'string' ? JSON.stringify(a.quote) : '(line text not stored)'}`;
  return `${a.severity === 'blocking' ? `Blocking (${a.ac ?? 'no AC'}) ` : 'Note '}${where}: ${a.text}`;
}

// The verdict comment's advice block: a heading line, then one line per item.
export function formatAdvice(advice) {
  if (!Array.isArray(advice) || advice.length === 0) return [];
  return [`${ADVICE_HEADING}. ${ADVICE_NOTE}`, ...advice.map((a) => `- ${adviceLine(a)}`)];
}
