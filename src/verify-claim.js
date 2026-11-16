// Orchestrates one claim: collect evidence, run deterministic checks, record and report.

import { fetch } from '@forge/api';
import { kvs } from '@forge/kvs';
import { appendAudit } from './audit-store.js';
import { collectGithub } from './github-evidence.js';
import { addComment } from './jira.js';
import { addVerdictProperty, collectJira } from './jira-evidence.js';
import { verify } from './verifier/verdict.js';

export const VERIFY_CONFIG = {
  requiredWorkflowPaths: ['.github/workflows/ci.yml'],
  reportTrustPaths: ['.github/workflows/', 'src/bank/testing/'],
  tooGood: { auc: 0.95 },
  // Files that decide how a metric is measured or reported (DESIGN.md section 12, risk 12).
  guardedPaths: [
    'src/fraud/evaluate.py', 'src/fraud/model.py', 'src/bank/testing/', 'tests/conftest.py',
    'tests/test_fraud_model.py', 'tests/test_bench.py', 'pyproject.toml',
  ],
};

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

const DEFAULT_DEPS = {
  collectJira, collectGithub, addVerdictProperty, appendAudit, addComment, fetchFn: fetch, store: kvs,
  env: () => ({ repo: process.env.GITHUB_REPO, token: process.env.GITHUB_TOKEN }),
};

// One claim, once. The queue retries a job that throws, so every side effect is recorded in a
// progress key: a retry reuses the first verdict and skips the steps already done, and never
// posts a second verdict (review F6, 16 Nov).
export async function verifyClaim({ issueKey, claim }, deps = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const progressKey = `claim-progress:${claim.id}`;
  let progress = (await d.store.get(progressKey)) ?? null;
  if (progress?.done) return progress.verdict;
  if (!progress) {
    const { verdict, record, comment } = await decide({ issueKey, claim }, d);
    progress = { verdict, record, comment, steps: {} };
    await d.store.set(progressKey, progress);
  }
  const save = () => d.store.set(progressKey, progress);
  if (!progress.steps.property) {
    await d.addVerdictProperty(issueKey, progress.record);
    progress.steps.property = true;
    await save();
  }
  if (!progress.steps.audit) {
    const audit = await d.appendAudit({ actor: 'team-lead-verifier', event: 'verdict', data: { issueKey, ...progress.record } });
    progress.steps.audit = { seq: audit.seq, hash: audit.hash };
    await save();
  }
  if (!progress.steps.comment) {
    const a = progress.steps.audit;
    await d.addComment(issueKey, `${progress.comment}\nAudit seq ${a.seq}, hash ${a.hash.slice(0, 12)}.`);
    progress.steps.comment = true;
  }
  progress.done = true;
  await save();
  return progress.verdict;
}

// Collects the evidence and runs the checks. A GitHub error is not evidence of absence.
export async function decide({ issueKey, claim }, d) {
  const ticket = await d.collectJira(issueKey);
  const { repo, token } = d.env();
  let github = { pr: null, workflowRuns: [], deployRuns: [] };
  let githubError = null;
  if (repo) {
    try {
      github = await d.collectGithub({ repo, key: issueKey, token, fetchFn: d.fetchFn });
    } catch (error) {
      githubError = error.message;
    }
  }
  const ctx = { ticket, ...github, config: VERIFY_CONFIG };
  let verdict = verify(claim, ctx);
  if ((githubError || !repo) && verdict.result === 'contradicted' && verdict.checks.some((c) => c.name === 'pr_linked' && c.status === 'fail')) {
    verdict = { ...verdict, result: 'cannot_verify', reason: `code host not reachable${githubError ? `: ${githubError}` : ''}` };
  }
  const record = { claimId: claim.id, type: claim.type, result: verdict.result, reason: verdict.reason, checker: verdict.checkerVersion, at: new Date().toISOString(), headSha: github.pr?.headSha ?? null };
  const comment = formatVerdict(issueKey, claim, verdict, { prUrl: github.pr?.url, githubConfigured: Boolean(repo) });
  console.log('verdict', issueKey, claim.type, verdict.result, JSON.stringify(github.meta ?? {}));
  return { verdict, record, comment };
}
