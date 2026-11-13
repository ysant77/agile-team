// Plain controlled English for text a human reads (owner rule, 13 Nov). The ASD-STE100 rules are
// the guide; this is a code lint, not a claim of compliance. Checks: sentence length (20 words for
// an instruction, 25 for a description), a passive-voice heuristic, hedge and praise words, and,
// where a claim must have a source, an evidence id or check name.

export const LIMITS = { instruction: 20, description: 25 };
const HEDGE = ['maybe', 'perhaps', 'possibly', 'probably', 'might', 'likely', 'seems', 'appears', 'somewhat', 'arguably', 'fairly', 'quite', 'rather'];
const PRAISE = ['great', 'excellent', 'amazing', 'awesome', 'robust', 'seamless', 'seamlessly', 'powerful', 'elegant', 'perfect', 'perfectly', 'clearly', 'simply', 'just', 'very', 'really', 'best-in-class', 'cutting-edge', 'state-of-the-art', 'impressive', 'significantly'];
const BANNED = new Map([...HEDGE.map((w) => [w, 'hedge']), ...PRAISE.map((w) => [w, 'praise'])]);
// "is checked", "were removed", "has been merged": a be-form followed by a past participle.
const PASSIVE = /\b(is|are|was|were|be|been|being)\s+(\w+ly\s+)?(\w+ed|built|done|made|given|taken|seen|shown|written|run|found|held|kept|left|sent|set|known)\b/i;
// Verdict names are defined terms, not passives: "the claim is supported".
const TERMS = /^(supported|contradicted|SUPPORTED|CONTRADICTED)$/;
const SOURCE = /\b(E\d+|PR ?#?\d+|seq \d+|[a-z]+_[a-z_]+|[0-9a-f]{7,40})\b/;

// Split on sentence ends and line breaks; list items and table rows count as one sentence each.
export function sentences(text) {
  return String(text ?? '')
    .split(/\n+/)
    .flatMap((line) => line.replace(/^\s*([-*]|\d+\.)\s+/, '').split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/))
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z]/.test(s));
}

const words = (s) => s.replace(/`[^`]*`/g, 'X').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));

export function lintText(text, { kind = 'description', needSource = false } = {}) {
  const findings = [];
  const limit = LIMITS[kind] ?? LIMITS.description;
  for (const s of sentences(text)) {
    const n = words(s).length;
    if (n > limit) findings.push({ rule: 'long-sentence', text: s.slice(0, 60), detail: `${n} words; limit ${limit}` });
    const passive = [...s.matchAll(new RegExp(PASSIVE.source, 'gi'))].find((m) => !TERMS.test(m[3]));
    if (passive) findings.push({ rule: 'passive', text: s.slice(0, 60), detail: passive[0] });
    for (const w of words(s.toLowerCase())) {
      const clean = w.replace(/[^a-z-]/g, '');
      if (BANNED.has(clean)) findings.push({ rule: BANNED.get(clean), text: s.slice(0, 60), detail: clean });
    }
  }
  if (needSource && !SOURCE.test(String(text ?? ''))) findings.push({ rule: 'no-source', text: String(text).slice(0, 60), detail: 'a claim needs an evidence id, check name or commit' });
  return { pass: findings.length === 0, findings };
}

// The style contract given to a model wherever free text is unavoidable.
export const STYLE_CONTRACT = 'Write plain technical English: one idea per sentence; at most 20 words for an instruction and 25 for a description; active voice; no hedge words (maybe, probably, seems); no praise words (great, robust, simply); use the same term for the same thing; give numbers with units; give the source id (evidence id, check name or commit) for every claim.';

export function lintMessage(findings) {
  return findings.slice(0, 8).map((f) => `${f.rule}: "${f.text}" (${f.detail})`).join('; ');
}
