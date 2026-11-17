// Tool use and instruction following (DESIGN 9l), task set 2. The model gets the tools from
// src/tool-specs.js, calls them in a short loop against fixed stub results, and code scores four
// dimensions per probe: tool selection, argument correctness, abstain, and the probe's rule.

import { ticketGrounding } from '../../src/index.js';
import { idsIn } from '../../src/opinion.js';
import { lintText } from '../../src/style.js';
import { ollamaTools, TOOL_SPECS } from '../../src/tool-specs.js';

const STUB = {
  'get-verdicts': { ok: true, issueKey: 'BANK-4', total: 2, verdicts: [
    { claimId: 'c2', type: 'fixed', result: 'supported', reason: 'all checks passed', checker: 'verifier/1', headSha: 'b941c25' },
    { claimId: 'c1', type: 'fixed', result: 'contradicted', reason: 'AC1: test_BANK4_concurrent_withdrawals_20_threads failed', checker: 'verifier/1', headSha: '55a7340' },
  ], arbitration: null, audit: { seq: 4, hash: 'd1f7a164' } },
  'lint-requirement': { pass: false, findings: [{ rule: 'vague-verb', message: '"faster" has no observable result' }, { rule: 'no-actor', message: 'no actor (who does or sees what?)' }] },
  'read-github-commit': { ok: true, repository: 'ysant77/yms-bank-demo', sha: 'f0e856c', date: '2026-11-13T07:00:00Z', message: 'Merge pull request #12' },
  'create-ticket': { ok: true, key: 'BANK-99' },
  'open-case': { ok: true, arbitration: { decidedBy: 'code-rule', winner: 'PR5', rule: 'smaller diff' }, opinionAllowed: false },
  'record-opinion': { ok: false, error: 'code already decided this case' },
};

const PM_TOOLS = ['lint-requirement', 'create-ticket', 'read-github-commit'];
const LEAD_TOOLS = ['read-github-commit', 'open-case', 'record-opinion', 'get-verdicts'];
const SYSTEM = 'You are an agent in a Jira team. Use a tool only when it gives data you need. Never invent numbers, ids or results. Do not create anything before the user confirms. If no tool fits, say so in one sentence. Write plain technical English: short active sentences, no hedge or praise words, a source id for every claim.';

// expect: tools that must be called (with exact args), tools that must not be called, and rules.
export const PROBES = [
  { id: 'T1-verdicts', set: 2, tools: LEAD_TOOLS, user: 'Why was the fixed claim on BANK-4 contradicted first?',
    must: [{ name: 'get-verdicts', args: { issueKey: 'BANK-4' } }], mustNot: ['open-case', 'record-opinion'], rules: ['ids-from-results', 'style'] },
  { id: 'T2-lint', set: 2, tools: PM_TOOLS, user: 'Is this requirement checkable: "Make statements faster"? Only check it.',
    must: [{ name: 'lint-requirement', args: { request: /statements faster/i } }], mustNot: ['create-ticket'], rules: ['style'] },
  { id: 'T3-commit', set: 2, tools: PM_TOOLS, user: 'What is the latest commit of ysant77/yms-bank-demo?',
    must: [{ name: 'read-github-commit', args: { repository: 'ysant77/yms-bank-demo' } }], mustNot: ['create-ticket'], rules: ['ids-from-results'] },
  { id: 'T4-abstain', set: 2, tools: LEAD_TOOLS, user: 'What is the weather in Singapore today?',
    must: [], mustNot: Object.keys(TOOL_SPECS), abstain: true, rules: [] },
  { id: 'T5-no-write', set: 2, tools: PM_TOOLS, user: 'Create a ticket in BANK: the login page should work better on slow networks.',
    must: [], mustNot: ['create-ticket'], rules: ['no-invented-numbers'] },
  { id: 'T6-one-pr', set: 2, tools: LEAD_TOOLS, user: 'BANK-32 has only pull request 5. Open an arbitration case for it.',
    must: [], mustNot: ['open-case', 'record-opinion'], rules: [] },
];

function argsMatch(want, got) {
  return Object.entries(want).every(([k, v]) => (v instanceof RegExp ? v.test(String(got?.[k] ?? '')) : String(got?.[k] ?? '').trim() === v));
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

// Scores a finished conversation: calls [{name, args}], final text, results the model saw.
export function scoreProbe(probe, calls, finalText, seen) {
  const names = calls.map((c) => c.name);
  const selection = probe.must.every((m) => names.includes(m.name)) && !names.some((n) => probe.mustNot.includes(n));
  const args = probe.must.every((m) => calls.some((c) => c.name === m.name && argsMatch(m.args, c.args)));
  const abstain = probe.abstain ? calls.length === 0 && /\b(no tool|cannot|can't|not able|no data|outside)\b/i.test(finalText) : true;
  const rules = {};
  for (const rule of probe.rules) {
    if (rule === 'ids-from-results') {
      const known = `${probe.user} ${JSON.stringify(seen)}`;
      rules[rule] = idsIn(finalText).every((id) => known.includes(id));
    }
    if (rule === 'style') rules[rule] = lintText(finalText).pass;
    if (rule === 'no-invented-numbers') {
      const tickets = calls.filter((c) => c.name === 'create-ticket');
      rules[rule] = tickets.every((c) => ticketGrounding({ ...c.args, request: probe.user }) === null);
    }
  }
  const rulesOk = Object.values(rules).every(Boolean);
  return { selection, args, abstain, rules, score: selection && args && abstain && rulesOk ? 1 : 0 };
}

export async function runTools(ask, probe) {
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: probe.user }];
  const tools = ollamaTools(probe.tools);
  const calls = [];
  const seen = [];
  let finalText = '';
  for (let round = 0; round < 3; round += 1) {
    const reply = await ask(messages, undefined, tools);
    if (!reply.ok) return { task: probe.id, failed: reply.error, score: 0 };
    const toolCalls = reply.toolCalls ?? [];
    if (toolCalls.length === 0) {
      finalText = reply.content;
      break;
    }
    messages.push({ role: 'assistant', content: reply.content ?? '', tool_calls: toolCalls.map((f) => ({ function: f })) });
    for (const f of toolCalls) {
      const call = { name: f.name, args: parseArgs(f.arguments) };
      calls.push(call);
      const result = STUB[call.name] ?? { ok: false, error: `unknown tool ${call.name}` };
      seen.push(result);
      messages.push({ role: 'tool', content: JSON.stringify(result) });
    }
  }
  const scored = scoreProbe(probe, calls, finalText, seen);
  return { task: probe.id, ...scored, calls, finalText: finalText.slice(0, 1200) };
}
