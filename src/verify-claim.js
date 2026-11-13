// Orchestrates one claim: collect evidence, run deterministic checks, record and report.

import { fetch } from '@forge/api';
import { appendAudit } from './audit-store.js';
import { collectGithub, collectPrStats } from './github-evidence.js';
import { addComment } from './jira.js';
import { addVerdictProperty, collectJira } from './jira-evidence.js';
import { parseTwin } from './monitor.js';
import { verify } from './verifier/verdict.js';

export const VERIFY_CONFIG = {
  requiredWorkflows: ['CI'],
  tooGood: { auc: 0.95 },
  // Files that decide how a metric is measured or reported (DESIGN.md section 12, risk 12).
  guardedPaths: [
    'src/fraud/evaluate.py', 'src/fraud/model.py', 'src/bank/testing/', 'tests/conftest.py',
    'tests/test_fraud_model.py', 'tests/test_bench.py', 'pyproject.toml',
  ],
  // Registered benchmarks: a gate on one of these needs the repeated form with exactly this many
  // runs, from this test, passed, and no change to what can alter how it is measured. The report
  // plugin refuses a second write of a metric name, so another test cannot replace the value.
  benchmarks: {
    transfers_per_s: { test: 'tests/test_bench.py::test_transfer_throughput', runs: 20 },
  },
  benchmarkGuardedPaths: ['.github/workflows/', 'pytest.ini', 'setup.cfg', 'tox.ini', 'tests/conftest.py'],
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

export async function verifyClaim({ issueKey, claim }) {
  const ticket = await collectJira(issueKey);
  const repo = process.env.GITHUB_REPO;
  let github = { pr: null, workflowRuns: [], deployRuns: [] };
  let githubError = null;
  if (repo) {
    try {
      github = await collectGithub({ repo, key: issueKey, token: process.env.GITHUB_TOKEN, fetchFn: fetch });
      if (github.pr) {
        const stats = await collectPrStats({ repo, prNumber: github.pr.number, token: process.env.GITHUB_TOKEN, fetchFn: fetch });
        github.prFiles = stats.files;
      }
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
  // Twin and origin come from the PR body the scenario generator writes; the skill is the
  // ticket's first label. They feed the monitor's assignment posterior, never the verdict.
  const { twin, origin } = parseTwin(github.pr?.body);
  const record = {
    claimId: claim.id, type: claim.type, result: verdict.result, reason: verdict.reason, checker: verdict.checkerVersion,
    at: new Date().toISOString(), headSha: github.pr?.headSha ?? null, twin, origin, skill: ticket.labels?.[0] ?? null,
  };
  await addVerdictProperty(issueKey, record);
  const audit = await appendAudit({ actor: 'team-lead-verifier', event: 'verdict', data: { issueKey, ...record } });
  await addComment(issueKey, formatVerdict(issueKey, claim, verdict, { prUrl: github.pr?.url, githubConfigured: Boolean(repo) }) + `\nAudit seq ${audit.seq}, hash ${audit.hash.slice(0, 12)}.`);
  console.log('verdict', issueKey, claim.type, verdict.result, JSON.stringify(github.meta ?? {}));
  return verdict;
}
