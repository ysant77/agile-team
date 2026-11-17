// Rule lint for requirement text. No model. Findings drive the PM agent's rewrite.

const VAGUE = /\b(fix|fixed|improve|better|handle|support|optimi[sz]e|enhance|clean ?up|make (it )?work|doesn'?t work|does nothing)\b/i;
const ACTOR = /\b(users?|customers?|admins?|operators?|systems?|apis?|services?|pages?|jobs?|teams?|managers?|agents?)\b/i;
const OBSERVABLE = /\b(shows?|returns?|displays?|is|are|equals?|within|at most|at least|under|over|never|always|rejects?|creates?|sends?)\b/i;
const CHECK_TYPES = new Set([
  'test_passes', 'metric_at_least', 'metric_at_most', 'version_at_least', 'path_absent',
  'blocked_by_done', 'subtasks_done', 'link_exists', 'field_equals', 'deployed',
  'migration_additive', 'repair_balanced', 'recon_proof', 'evidence_linked', 'ci_green', 'manual',
]);

// Version of the rules below; the bake-off records it with PM rows.
// 2 (13 Nov): no exempt small numbers, ids stripped first, numbers in AC checks grounded too.
// 3 (16 Nov): a number with a unit, a threshold or a time limit must still come from the request.
//   Two kinds of number are allowed without it, each from a fixed list: a bare count of 1 to 9
//   that only enumerates ("2 fields"), and a standard HTTP status code after HTTP, status, code,
//   returns, gets or responds with. "3 s on 3G" still fails.
// 4 (17 Nov): a status code before a unit ("returns 500 ms", "gets 200 EUR") is a quantity, and a
//   bare count is allowed only before a noun from SAFE_NOUNS ("5 failures" and "9 users" fail).
// 5 (17 Nov): allowlist, not blocklist. A number needs a source unless it is a standard HTTP status
//   code used as a status: after HTTP, status, code, returns, gets, gives or responds with, and
//   followed only by the end of the clause, punctuation or a word from STATUS_NEXT. A unit, a
//   currency, a "/" rate or a noun after the code ("500 milliseconds", "200 €", "500/s",
//   "404 items") makes it a quantity. Bare counts ("9 tabs") need a source too.
// 6 (17 Nov): an issue key or AC id is stripped only when it is a known id: in a source, or an AC
//   id of the draft. "TIMEOUT-30 seconds" and "MAX-5 retries" are quantities. Text is normalised
//   (NFKC, whitespace collapsed) and each field is checked alone. A plural after a status code
//   ("500 errors", "200 responses") is a count. A number in a test name ("test_500ms") is checked.
export const LINT_VERSION = 6;

const HTTP_CODES = '200|201|202|204|301|302|304|400|401|403|404|405|409|410|422|429|500|502|503|504';
// Words that may follow a status code. Any other word makes the number a quantity.
// "and" or "or" may join two status codes, but never a quantity ("200 or more credits").
// Singular only: "500 errors" and "200 responses" read as counts.
const STATUS_NEXT = 'error|status|response|code|when|if|for|(?:and|or)(?!\\s+(?:more|less|fewer|above|below|over|under|greater|higher|lower|up|at)\\b)';
const HTTP_CONTEXT = new RegExp(
  `\\b(HTTP|status(?: code)?|code|returns?|gets?|gives?|responds? with)\\s+((?:an?|the)\\s+)?(?:HTTP\\s+)?(${HTTP_CODES})\\b`
  + `(?=\\s*(?:[.,;:!?)](?![\\d/])|$)|\\s+(?:${STATUS_NEXT})\\b)`, 'gi');

export function numbersIn(text) {
  return (String(text).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
}

const KEY = /\b[A-Z][A-Z0-9]*-\d+\b/g;
const AC_ID = /\bAC\d+\b/g;

// Ids in the texts: issue keys and AC ids.
export function idsIn(text) {
  return [...String(text ?? '').matchAll(KEY), ...String(text ?? '').matchAll(AC_ID)].map((m) => m[0]);
}

// Ids are not quantities: known issue keys and AC ids, {TOKEN} and test names are removed before
// numbers are compared with the request. A key-shaped token that is not in `known` stays.
// NFKC turns wide digits into ASCII and "½" into "1⁄2". Line breaks count as spaces, so
// "500\nms" reads as "500 ms".
export function normalise(text) {
  return String(text ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function quantityText(text, known = new Set()) {
  const drop = (id) => (known.has(id) ? ' ' : id);
  return normalise(text)
    .replace(KEY, drop)
    .replace(AC_ID, drop)
    .replace(/\{TOKEN\}/g, ' ')
    // A test name is an id, but a part of it that starts with a digit ("500ms") is a quantity.
    .replace(/\btest_\w+/g, (name) => ` ${name.slice(5).split('_').filter((p) => /^\d/.test(p)).join(' ')} `)
    // A story point estimate is the PM's own proposal, written as "2 points" (Fibonacci only).
    .replace(/\b(1|2|3|5|8|13)[ -]points?\b/g, ' ')
    // Standard HTTP status codes used as a status (version 5 rules).
    .replace(HTTP_CONTEXT, '$1 $2');
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
  // Known ids: every id in a source, and the AC ids of the draft.
  const known = new Set([...sources.flatMap(idsIn), ...acs.map((a) => String(a.acId ?? '').trim())]);
  const allowed = new Set(sources.map((s) => quantityText(s, known)).flatMap(numbersIn));
  const checks = acs.map((a) => (a.check ? (a.check.args ?? []).join(' ') : ''));
  // Each field alone: the end of a field ends a clause.
  const fields = [draft.summary, draft.description, ...acs.map((a) => a.statement), ...checks];
  const found = fields.flatMap((f) => numbersIn(quantityText(f, known)));
  for (const n of new Set(found)) {
    if (!allowed.has(n)) {
      findings.push({ rule: 'ungrounded-number', message: `${n} does not appear in the request or evidence; state an open question instead` });
    }
  }
  return { pass: findings.length === 0, findings };
}
