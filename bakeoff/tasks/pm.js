// PM role: turn a raw request into a ticket. Scored by the same lint and AC parser as the app.

import { lintRequirement } from '../../src/lint.js';
import { malformedAcLines, normaliseAcs, parseAcLines } from '../../src/ticket-spec.js';

export const REQUESTS = [
  ['S01', "The send money button doesn't work on phones."],
  ['S02', 'Customers hate the statement page, make it better.'],
  ['S03', 'Can we support instant payments? How long would it take?'],
  ['S04', 'Support says a customer took out 150 from an account with 100 in it.'],
  ['S07', 'Interest is a cent off on some accounts.'],
  ['S11', 'The scanner says one of our libraries has a known vulnerability.'],
  ['S13', "A tester saw another customer's statement by changing the number in the URL."],
  ['S21', '`test_transfer_timeout` fails about one run in ten. Fix it or delete it.'],
];

const SCHEMA = {
  type: 'object',
  required: ['summary', 'description', 'acceptanceCriteria', 'storyPoints'],
  properties: {
    summary: { type: 'string' },
    description: { type: 'string' },
    acceptanceCriteria: { type: 'string', description: 'one line per criterion: "AC1 | statement | check"' },
    storyPoints: { type: 'integer' },
  },
};

const SYSTEM = `You are the product manager of a small team that builds a demo bank (Python, FastAPI,
SQLite ledger, a web page). Turn the request into one Jira ticket.
- summary: one line. description: who does what and what they observe, with exact values.
- acceptanceCriteria: one line per criterion, "AC<n> | <observable statement> | <check>", for
  example "AC1 | a withdrawal larger than the balance is refused | test_passes(test_{TOKEN}_withdraw_refused)".
  The check is one of
  test_passes(test_{TOKEN}_name), metric_at_least(name, value), metric_at_most(name, value),
  version_at_least(package, version), path_absent(path), manual(). Write {TOKEN} literally.
- Use only numbers that appear in the request, or story points from 1, 2, 3, 5, 8, 13.
- storyPoints: one of 1, 2, 3, 5, 8, 13.
Answer with JSON only.`;

function score(draftRaw, request) {
  const acText = String(draftRaw.acceptanceCriteria ?? '');
  const lines = acText.split('\n').map((l) => l.trim()).filter(Boolean);
  const malformed = malformedAcLines(acText);
  const acs = normaliseAcs(parseAcLines(acText), 'BANK');
  const draft = { summary: draftRaw.summary, description: draftRaw.description, acceptanceCriteria: acs };
  const lint = lintRequirement(draft, [request]);
  // Harness-only rules: a criterion must state something (not a copied placeholder), and each
  // line holds one criterion.
  const weak = lines.filter((line) => {
    const parts = line.split('|').map((x) => x.trim());
    const statement = parts[1] ?? '';
    return statement.split(/\s+/).length < 4 || /^(statement|observable statement)$/i.test(statement)
      || (line.match(/\bAC\d+\s*\|/g) ?? []).length !== 1;
  }).length;
  return {
    weakAcLines: weak,
    findings: lint.findings.length,
    rules: lint.findings.map((f) => f.rule),
    messages: lint.findings.map((f) => f.message),
    acLines: lines.length,
    validAcShare: lines.length ? (lines.length - malformed.length) / lines.length : 0,
    ungrounded: lint.findings.filter((f) => f.rule === 'ungrounded-number').length,
    pointsValid: [1, 2, 3, 5, 8, 13].includes(draftRaw.storyPoints),
  };
}

// Up to two rounds, as in the app: findings from round 1 go back to the model once.
export async function runPm(ask, [id, request]) {
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: request }];
  let last = null;
  for (let round = 1; round <= 2; round += 1) {
    const reply = await ask(messages, SCHEMA);
    if (!reply.ok || !reply.parsed) return { task: id, round, failed: reply.error ?? 'invalid JSON', calls: reply.calls };
    const s = score(reply.parsed, request);
    last = { task: id, rounds: round, ...s, draft: reply.parsed };
    if (s.findings === 0 && s.weakAcLines === 0) break;
    messages.push({ role: 'assistant', content: reply.content });
    messages.push({ role: 'user', content: `Review of your ticket draft for the request above: ${[...s.messages, ...(s.weakAcLines ? ['an acceptance criterion has no real statement, or one line holds several criteria'] : [])].join('; ')}. Rewrite the same ticket so none of these remain, and answer with JSON only.` });
  }
  return { ...last, score: last.findings === 0 && last.validAcShare === 1 && last.weakAcLines === 0 && last.acLines > 0 ? 1 : 0 };
}
