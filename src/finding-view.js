// The panel's view of a stored discovery finding (lead, 23 Nov). A finding had no screen: a person
// saw it only in the Rovo chat. This view reads the record that record-finding stored
// (src/discovery.js) and gives the texts of the panel section. It only reads: it never changes the
// kind or the status, and a record that does not have the stored shape gives no view.

import { RULE_QUESTION, isRuleFile, readFindingFor } from './discovery.js';

export const FINDING_NOT_FOUND = 'No stored finding has this id. A finding id looks like F-<12 letters or digits>-<8 letters or digits>.';

const KINDS = ['defect', 'no_defect', 'unclear'];
const cite = (c) => `${c.file}:${c.line}`;

export function findingView(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f) || typeof f.findingId !== 'string' || !KINDS.includes(f.kind)) return null;
  const citations = Array.isArray(f.citations) ? f.citations.filter((c) => c && typeof c.file === 'string') : [];
  const questions = Array.isArray(f.openQuestions) ? f.openQuestions.filter((q) => typeof q === 'string') : [];
  const r = f.reproducer;
  const level = (x, name) => (x?.level ? `${name} ${x.level}: ${x.reason ?? ''}.` : null);
  const severity = [level(f.severity, 'Severity'), level(f.priority, 'Priority')].filter(Boolean).join(' ') || null;
  return {
    findingId: f.findingId,
    kind: f.kind,
    title: `${f.findingId}: ${f.kind} (${f.status ?? 'unconfirmed'})`,
    symptom: typeof f.symptom === 'string' ? f.symptom : '',
    hypothesis: typeof f.hypothesis === 'string' ? f.hypothesis : '',
    ruleCitations: citations.filter((c) => isRuleFile(c.file)).map(cite),
    codeCitations: citations.filter((c) => !isRuleFile(c.file)).map(cite),
    reproducer: r && r.file && r.testName ? `${r.file}, ${r.testName}: ${r.asserts ?? ''}` : null,
    severity,
    noRuleNote: f.kind === 'unclear' && f.proposedKind === 'defect'
      ? 'The model proposed a defect, but the finding cites no rule (a read line of docs, a README or a test), so it is recorded as unclear.'
      : null,
    ruleQuestion: questions.includes(RULE_QUESTION) ? RULE_QUESTION : null,
    openQuestions: questions.filter((q) => q !== RULE_QUESTION),
    readAt: `Read at commit ${String(f.commit ?? '').slice(0, 7)} of ${f.repo ?? '?'}, by ${f.by ?? '?'} on ${String(f.at ?? '').slice(0, 10)}.`,
  };
}

// d = { store, accountId, canBrowse(key) }: the app's KVS, the caller that Jira names, and the
// caller's browse permission (src/discovery.js readFindingFor). A refusal gives the not-found text.
export async function getFindingAction(payload, d) {
  const view = findingView(await readFindingFor(payload?.findingId, d));
  return view ? { ok: true, view } : { ok: false, error: FINDING_NOT_FOUND };
}
