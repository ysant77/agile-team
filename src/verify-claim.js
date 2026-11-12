// Orchestrates one claim: collect evidence, run deterministic checks, record and report.

import { fetch } from '@forge/api';
import { appendAudit } from './audit-store.js';
import { collectGithub } from './github-evidence.js';
import { addComment } from './jira.js';
import { addVerdictProperty, collectJira } from './jira-evidence.js';
import { verify } from './verifier/verdict.js';

export const VERIFY_CONFIG = { requiredWorkflows: ['CI'], tooGood: { auc: 0.95 } };

const SYMBOL = { supported: 'SUPPORTED', contradicted: 'CONTRADICTED', cannot_verify: 'CANNOT VERIFY' };

export function formatVerdict(issueKey, claim, verdict, meta) {
  const lines = [
    `Team lead verifier: claim "${claim.type}" on ${issueKey} is ${SYMBOL[verdict.result]}.`,
    `Reason: ${verdict.reason}`,
    'Checks:',
    ...verdict.checks.flatMap((c) => [
      `- ${c.status.toUpperCase()} ${c.name}: ${c.reason}`,
      ...(c.parts ?? []).map((p) => `  - ${p.status.toUpperCase()} ${p.acId} ${p.name}: ${p.reason}`),
    ]),
  ];
  if (meta?.prUrl) lines.push(`Pull request: ${meta.prUrl}`);
  if (meta && !meta.githubConfigured) lines.push('GitHub evidence off: no repository configured.');
  lines.push(`Checker: ${verdict.checkerVersion}. Deterministic; no model decided this verdict.`);
  return lines.join('\n');
}

export async function verifyClaim({ issueKey, claim }) {
  const ticket = await collectJira(issueKey);
  const repo = process.env.GITHUB_REPO;
  let github = { pr: null, workflowRuns: [], deployRuns: [] };
  let githubError = null;
  if (repo) {
    try {
      github = await collectGithub({ repo, key: issueKey, token: process.env.GITHUB_TOKEN, fetchFn: fetch });
    } catch (error) {
      githubError = error.message;
    }
  }
  const ctx = { ticket, ...github, config: VERIFY_CONFIG };
  let verdict = verify(claim, ctx);
  if ((githubError || !repo) && verdict.result === 'contradicted' && verdict.checks.some((c) => c.name === 'pr_linked' && c.status === 'fail')) {
    // Without GitHub access a missing PR is not evidence of absence.
    verdict = { ...verdict, result: 'cannot_verify', reason: `code host not reachable${githubError ? `: ${githubError}` : ''}` };
  }
  const record = { claimId: claim.id, type: claim.type, result: verdict.result, reason: verdict.reason, checker: verdict.checkerVersion, at: new Date().toISOString(), headSha: github.pr?.headSha ?? null };
  await addVerdictProperty(issueKey, record);
  const audit = await appendAudit({ actor: 'team-lead-verifier', event: 'verdict', data: { issueKey, ...record } });
  await addComment(issueKey, formatVerdict(issueKey, claim, verdict, { prUrl: github.pr?.url, githubConfigured: Boolean(repo) }) + `\nAudit seq ${audit.seq}, hash ${audit.hash.slice(0, 12)}.`);
  console.log('verdict', issueKey, claim.type, verdict.result, JSON.stringify(github.meta ?? {}));
  return verdict;
}
