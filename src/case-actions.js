// Rovo actions for arbitration: open a case from two or three pull requests, and record the AI
// team lead's opinion on it. Code decides whatever it can; an opinion never decides.

import { fetch } from '@forge/api';
import { kvs } from '@forge/kvs';
import { HUMAN_DOMAINS } from './arbitration.js';
import { appendAudit } from './audit-store.js';
import { buildPacket, formatCase, formatOpinion, QUESTIONS } from './case.js';
import { collectGithub, collectPrStats } from './github-evidence.js';
import { addComment } from './jira.js';
import { collectJira } from './jira-evidence.js';
import { applyGuards, OPINION_PROMPT_VERSION } from './opinion.js';
import { VERIFY_CONFIG } from './verify-claim.js';
import { verify } from './verifier/verdict.js';

const caseKey = (issueKey) => `case:${issueKey}`;

export function parseCaseInput(payload) {
  const issueKey = String(payload?.issueKey ?? '').trim().toUpperCase();
  const prNumbers = String(payload?.prNumbers ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  const question = String(payload?.question ?? 'winner').trim();
  const domain = String(payload?.domain ?? '').trim() || null;
  const errors = [];
  if (!/^[A-Z][A-Z0-9]*-[1-9][0-9]*$/.test(issueKey)) errors.push('issueKey must look like BANK-32');
  if (prNumbers.length < 2 || prNumbers.length > 3 || prNumbers.some((n) => !Number.isInteger(n) || n < 1)) {
    errors.push('prNumbers must list 2 or 3 pull request numbers');
  }
  if (!QUESTIONS.includes(question)) errors.push(`question must be one of ${QUESTIONS.join(', ')}`);
  if (domain && !HUMAN_DOMAINS.includes(domain)) errors.push(`domain must be empty or one of ${HUMAN_DOMAINS.join(', ')}`);
  const metric = String(payload?.metric ?? '').trim() || null;
  return { errors, issueKey, prNumbers, question, domain, metric, higherIsBetter: payload?.higherIsBetter !== false && payload?.higherIsBetter !== 'false' };
}

export async function openCase(payload) {
  const input = parseCaseInput(payload);
  if (input.errors.length) return { ok: false, error: input.errors.join('; ') };
  const repo = process.env.GITHUB_REPO;
  if (!repo) return { ok: false, error: 'no repository configured' };
  const token = process.env.GITHUB_TOKEN;
  const ticket = await collectJira(input.issueKey);
  const evidence = [];
  for (const prNumber of input.prNumbers) {
    const github = await collectGithub({ repo, key: input.issueKey, token, fetchFn: fetch, prNumber });
    if (!github.pr) {
      const where = github.truncated?.pulls ? `the latest 500 pull requests of ${repo}` : repo;
      return { ok: false, error: `pull request ${prNumber} not found in ${where}` };
    }
    const stats = await collectPrStats({ repo, prNumber, token, fetchFn: fetch });
    // The file list from collectGithub: every page, or null when it is cut.
    const verdict = verify({ id: `case:${input.issueKey}:${prNumber}`, type: 'ready', text: '' }, { ticket, ...github, config: VERIFY_CONFIG });
    evidence.push({ prNumber, pr: github.pr, report: github.report, baseReport: github.baseReport, verdict, ...stats });
  }
  const built = buildPacket({ ...input, ticket, evidence });
  const stored = { ...built, prNumbers: input.prNumbers, openedAt: new Date().toISOString(), opinions: [] };
  await kvs.set(caseKey(input.issueKey), stored);
  const audit = await appendAudit({ actor: 'arbitration', event: 'case_opened', data: {
    issueKey: input.issueKey, prNumbers: input.prNumbers, decidedBy: built.arbitration.decidedBy,
    winner: built.arbitration.winner, rule: built.arbitration.rule } });
  await addComment(input.issueKey, `${formatCase(input.issueKey, stored)}\nAudit seq ${audit.seq}.`);
  return { ok: true, arbitration: built.arbitration, opinionAllowed: built.opinionAllowed, highStake: built.highStake, packet: built.packet };
}

export async function recordOpinion(payload) {
  const issueKey = String(payload?.issueKey ?? '').trim().toUpperCase();
  const stored = await kvs.get(caseKey(issueKey));
  if (!stored) return { ok: false, error: `no open arbitration case on ${issueKey}; call open-case first` };
  if (!stored.opinionAllowed && !stored.highStake) {
    return { ok: false, error: `code already decided this case (${stored.arbitration.rule}); no opinion is needed` };
  }
  const record = applyGuards(payload?.opinion ?? '', stored.packet, { model: 'rovo', promptVersion: OPINION_PROMPT_VERSION });
  stored.opinions.push({ ...record, at: new Date().toISOString() });
  await kvs.set(caseKey(issueKey), stored);
  const audit = await appendAudit({ actor: 'ai-team-lead', event: 'opinion', data: {
    issueKey, outcome: record.outcome, guard: record.guard, decision: record.opinion?.decision ?? null,
    confidence: record.opinion?.confidence ?? null, inputHash: record.inputHash } });
  await addComment(issueKey, `${formatOpinion(issueKey, record)}\nAudit seq ${audit.seq}.`);
  return { ok: true, outcome: record.outcome, guard: record.guard, reasons: record.reasons, finalDecision: 'human' };
}
