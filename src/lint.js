// Rule lint for requirement text. No model. Findings drive the PM agent's rewrite.

const VAGUE = /\b(fix|fixed|improve|better|handle|support|optimi[sz]e|enhance|clean ?up|make (it )?work|doesn'?t work|does nothing)\b/i;
const ACTOR = /\b(users?|customers?|admins?|operators?|systems?|apis?|services?|pages?|jobs?|teams?|managers?|agents?)\b/i;
const OBSERVABLE = /\b(shows?|returns?|displays?|is|are|equals?|within|at most|at least|under|over|never|always|rejects?|creates?|sends?)\b/i;
const CHECK_TYPES = new Set([
  'test_passes', 'metric_at_least', 'metric_at_most', 'version_at_least', 'path_absent',
  'blocked_by_done', 'subtasks_done', 'link_exists', 'field_equals', 'deployed',
  'migration_additive', 'repair_balanced', 'recon_proof', 'evidence_linked', 'ci_green', 'manual',
]);

// Version of the rules below; the bake-off records it with PM rows. 2 (13 Nov): no exempt small
// numbers, ids stripped first, numbers in AC checks grounded too.
export const LINT_VERSION = 2;

export function numbersIn(text) {
  return (String(text).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
}

// Ids are not quantities: issue keys, AC ids, {TOKEN} and test names are removed before numbers
// are compared with the request.
export function quantityText(text) {
  return String(text ?? '')
    .replace(/\b[A-Z][A-Z0-9]*-\d+\b/g, ' ')
    .replace(/\bAC\d+\b/g, ' ')
    .replace(/\{TOKEN\}/g, ' ')
    .replace(/\btest_\w+/g, ' ')
    // A story point estimate is the PM's own proposal, written as "2 points" (Fibonacci only).
    .replace(/\b(1|2|3|5|8|13)[ -]points?\b/g, ' ');
}

// draft: { summary, description, acceptanceCriteria: [{ acId, statement, check }] }
// sources: texts the numbers may come from (the request, linked evidence)
export function lintRequirement(draft, sources = []) {
  const findings = [];
  const text = `${draft.summary ?? ''}\n${draft.description ?? ''}`;
  if (VAGUE.test(text) && !OBSERVABLE.test(text)) {
    findings.push({ rule: 'vague-verb', message: `"${text.match(VAGUE)[0]}" has no observable result` });
  }
  if (!ACTOR.test(text)) findings.push({ rule: 'no-actor', message: 'no actor (who does or sees what?)' });
  if (!OBSERVABLE.test(text)) findings.push({ rule: 'no-result', message: 'no observable result' });
  const acs = draft.acceptanceCriteria ?? [];
  if (acs.length === 0) findings.push({ rule: 'no-ac', message: 'no acceptance criteria' });
  for (const ac of acs) {
    if (!ac.check || !CHECK_TYPES.has(ac.check.type)) {
      findings.push({ rule: 'ac-no-check', message: `${ac.acId}: no valid check` });
    }
  }
  // Every number, unit or threshold must come from the request or the evidence; story points are
  // a separate field and are not checked here.
  const allowed = new Set(sources.map(quantityText).flatMap(numbersIn));
  const checks = acs.map((a) => (a.check ? (a.check.args ?? []).join(' ') : ''));
  const all = quantityText([text, ...acs.map((a) => a.statement ?? ''), ...checks].join('\n'));
  for (const n of new Set(numbersIn(all))) {
    if (!allowed.has(n)) {
      findings.push({ rule: 'ungrounded-number', message: `${n} does not appear in the request or evidence; state an open question instead` });
    }
  }
  return { pass: findings.length === 0, findings };
}
