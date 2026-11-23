// Orchestrates one claim: collect evidence, run deterministic checks, record and report.

import { fetch } from '@forge/api';
import { kvs } from '@forge/kvs';
import { appendAudit, readAudit } from './audit-store.js';
import { auditSeqs, readApprovals } from './approvals.js';
import { collectGithub, collectPrStats } from './github-evidence.js';
import { releaseClaim } from './claim-intake.js';
import { latestPrLink } from './pr-link.js';
import { addComment, findComment } from './jira.js';
import { LATEST_DONE_KEY } from './sign-off.js';
import { addVerdictProperty, collectJira, collectReviews } from './jira-evidence.js';
import { formatAdvice, withAdvice } from './review-advice.js';
import { compactChecks } from './verdict-view.js';
import { parseTwin } from './monitor.js';
import { CONFIG_TRUST_PATHS } from './verifier/checks.js';
import { buildDoneEvidence, formatEvidence } from './verifier/evidence.js';
import { verify } from './verifier/verdict.js';

export const VERIFY_CONFIG = {
  requiredWorkflowPaths: ['.github/workflows/ci.yml'],
  reportTrustPaths: ['.github/workflows/', '.github/actions/', '.github/codeql/', '**/conftest.py', 'src/bank/testing/',
    // The scripts that write the repro and coverage blocks of the report.
    'scripts/repro.py', 'scripts/changed_coverage.py', 'scripts/pinned.py',
    // Dependency and pytest configuration (finding D2, 19 Nov).
    ...CONFIG_TRUST_PATHS],
  // Protected regression set (docs/PROTECTED-TESTS.md). pinnedRequired is the value for a
  // repository that is not listed: advisory. pinnedRequiredRepos lists the repositories ("owner/
  // name") whose main runs the pinned step (scripts/pinned.py); for them a CI report without a
  // pinned block gives unknown. configFor() sets pinnedRequired per repository. Set here, never
  // read from a report. Listed at rollout step 6 (19 Nov; docs/PROTECTED-TESTS.md, "Rollout").
  pinnedRequired: false,
  pinnedRequiredRepos: ['ysant77/yms-bank-demo', 'ysant77/yms-bank-demo-cases'],
  // Report provenance (design P0-3): the repositories whose CI uploads the report hash markers.
  // A repository is listed only after a real PR run on it shows that the comment text and the
  // marker hash agree: the bank (PR run 44455535406, push run 44456621300) and the demo
  // repository (demo PR runs of 19 Nov; push run 44473706448). Any other repository: advisory.
  provenanceRequired: false,
  provenanceRequiredRepos: ['ysant77/yms-bank-demo', 'ysant77/yms-bank-demo-cases'],
  tooGood: { auc: 0.95 },
  // D-cov (DESIGN 15c): fixed per repository before work starts, never per PR.
  coverage: { changedFloor: 0.8, maxDropPoints: 0.5 },
  // Small security check (DESIGN 14g): "observe" (shown, not counted) until a bank PR shows the
  // real check; then "enforce". No token, no new egress host.
  securityCheck: { mode: 'observe', checkName: 'CodeQL', appSlug: 'github-advanced-security', appId: 57789, onFixedReady: true },
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
  lines.push(...formatAdvice(verdict.advice));
  lines.push(`Checker: ${verdict.checkerVersion}. Deterministic; no model decided this verdict.`);
  return lines.join('\n');
}

// A claim that GitHub could not answer for a transient reason (a rate limit, a server error, a
// network error): no verdict is stored, the claim slots are given back, and the person is told
// when to try again (lead review of 23 Nov, finding 3).
export function formatNotChecked(issueKey, claim, transient) {
  const when = transient.retryAt ? 'Post the claim again after that time.' : 'Post the claim again in a few minutes.';
  return [
    `Team lead verifier: claim "${claim.type}" on ${issueKey} was not checked.`,
    `Reason: ${transient.reason}.`,
    `No verdict was recorded, and this claim does not count toward the hourly claim limit. ${when}`,
  ].join('\n');
}

const DEFAULT_DEPS = {
  collectJira, collectGithub, collectPrStats, collectReviews, addVerdictProperty, appendAudit, readAudit, addComment, findComment, fetchFn: fetch, store: kvs,
  releaseClaim,
  env: () => ({ repo: process.env.GITHUB_REPO, token: process.env.GITHUB_TOKEN }),
};

// One claim, once. The queue retries a job that throws, so every side effect is recorded in a
// progress key: a retry reuses the first verdict and skips the steps already done, and never
// posts a second verdict (review F6, 16 Nov). A lease key lets only one delivery of a claim work
// at a time; a second delivery throws and the queue retries it later (second review, item 7).
export const LEASE_MS = 5 * 60 * 1000;
export const verdictMarker = (claimId) => `[verdict ${claimId}]`;

async function takeLease(store, key, now) {
  try {
    await store.set(key, { at: now }, { keyPolicy: 'FAIL_IF_EXISTS' });
    return;
  } catch (error) {
    const held = await store.get(key);
    if (!held) throw error;
    if (now - held.at < LEASE_MS) throw new Error('another delivery is verifying this claim; retry later');
    // A stale lease: the delivery that held it stopped. Take it over.
    await store.set(key, { at: now });
  }
}

export async function verifyClaim({ issueKey, claim }, deps = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const progressKey = `claim-progress:${claim.id}`;
  const leaseKey = `claim-lease:${claim.id}`;
  let progress = (await d.store.get(progressKey)) ?? null;
  if (progress?.done) return progress.verdict;
  await takeLease(d.store, leaseKey, Date.now());
  try {
    progress = (await d.store.get(progressKey)) ?? null;
    if (progress?.done) return progress.verdict;
    if (!progress) {
      const { verdict, record, comment, evidence, transient } = await decide({ issueKey, claim }, d);
      progress = transient
        ? { transient, comment: formatNotChecked(issueKey, claim, transient), steps: {} }
        : { verdict, record, comment, evidence: evidence ?? null, steps: {} };
      await d.store.set(progressKey, progress);
    }
    const save = () => d.store.set(progressKey, progress);
    if (progress.transient) {
      // No property, no audit entry: nothing final was decided. The slots go back first, so a
      // failed comment post does not keep them.
      if (!progress.steps.released) {
        await d.releaseClaim?.(claim.id, d.store);
        progress.steps.released = true;
        await save();
      }
      if (!progress.steps.comment) {
        const marker = verdictMarker(claim.id);
        if (!progress.steps.commentMarker) {
          progress.steps.commentMarker = marker;
          await save();
        } else if (await d.findComment(issueKey, marker)) {
          progress.steps.comment = true;
        }
        if (!progress.steps.comment) {
          await d.addComment(issueKey, `${progress.comment}\n${marker}`);
          progress.steps.comment = true;
        }
      }
      progress.done = true;
      progress.verdict = { result: 'not_checked', reason: progress.transient.reason, retryAt: progress.transient.retryAt ?? null };
      await save();
      return progress.verdict;
    }
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
    // The sign-off reads the claimant and the merged commit from this audit entry (src/sign-off.js).
    if (claim.type === 'done' && !progress.steps.latestDone) {
      await d.store.set(LATEST_DONE_KEY(issueKey), { seq: progress.steps.audit.seq, hash: progress.steps.audit.hash });
      progress.steps.latestDone = true;
      await save();
    }
    // The evidence record goes into the audit chain before the comment, so a posted done verdict
    // always has its record (DESIGN 15d).
    if (progress.evidence && !progress.steps.evidence) {
      const audit = await d.appendAudit({ actor: 'team-lead-verifier', event: 'done_evidence', data: { issueKey, ...progress.evidence } });
      progress.steps.evidence = { seq: audit.seq, hash: audit.hash };
      await save();
    }
    if (!progress.steps.comment) {
      // The marker is saved before the post. If the post worked but a later save failed, the
      // retry finds the marker in Jira and does not post again.
      const marker = verdictMarker(claim.id);
      if (!progress.steps.commentMarker) {
        progress.steps.commentMarker = marker;
        await save();
      } else if (await d.findComment(issueKey, marker)) {
        progress.steps.comment = true;
      }
      if (!progress.steps.comment) {
        const a = progress.steps.audit;
        await d.addComment(issueKey, `${progress.comment}\nAudit seq ${a.seq}, hash ${a.hash.slice(0, 12)}. ${marker}`);
        progress.steps.comment = true;
      }
    }
    progress.done = true;
    await save();
    return progress.verdict;
  } finally {
    await d.store.delete?.(leaseKey);
  }
}

// The app configuration for one repository. Only the pinned-block requirement differs per
// repository today. A repository that is missing or not listed (or a malformed list) is advisory.
export function configFor(repo, repos = VERIFY_CONFIG.pinnedRequiredRepos, provenanceRepos = VERIFY_CONFIG.provenanceRequiredRepos) {
  const name = String(repo ?? '').trim().toLowerCase();
  const listed = (list) => Array.isArray(list) && name !== ''
    && list.some((r) => typeof r === 'string' && r.trim().toLowerCase() === name);
  return { ...VERIFY_CONFIG, pinnedRequired: listed(repos), provenanceRequired: listed(provenanceRepos) };
}

// Collects the evidence and runs the checks. A GitHub error is not evidence of absence.
export async function decide({ issueKey, claim }, d) {
  const ticket = await d.collectJira(issueKey);
  const { repo, token } = d.env();
  // An audited PR link from the panel (src/pr-link.js). It counts only when a person other than
  // the claimant made it; then the claim reads that PR by number. A read error: no link.
  let prLink = null;
  if (d.store && d.readAudit) {
    try {
      prLink = await latestPrLink(issueKey, { store: d.store, readAudit: d.readAudit }, claim.by ?? null);
    } catch (error) {
      console.log('PR link not read', issueKey, error.message);
    }
  }
  const linkedPr = prLink?.counted && (!prLink.repo || String(prLink.repo).toLowerCase() === String(repo ?? '').toLowerCase()) ? prLink.prNumber : null;
  let github = { pr: null, workflowRuns: [], deployRuns: [] };
  let githubError = null;
  if (repo) {
    try {
      github = await d.collectGithub({ repo, key: issueKey, token, fetchFn: d.fetchFn, securityCheck: VERIFY_CONFIG.securityCheck,
        provenance: { workflowPaths: VERIFY_CONFIG.requiredWorkflowPaths }, ...(linkedPr ? { prNumber: linkedPr } : {}) });
      // Patches of Python files for the metric tamper check. collectGithub keeps them from its
      // own read of the file list; a reader that does not (a test stub) is asked separately.
      if (github.pr && !('prPatches' in github)) {
        const stats = await d.collectPrStats({ repo, prNumber: github.pr.number, token, fetchFn: d.fetchFn });
        github.prPatches = stats.patches;
      }
    } catch (error) {
      // A transient failure says nothing about the claim: no verdict (see verifyClaim).
      if (error?.transient) {
        console.log('claim not checked', issueKey, claim.type, error.kind, error.message);
        return { transient: { kind: error.kind, reason: error.message, retryAt: error.retryAt ?? null } };
      }
      githubError = error.message;
    }
  }
  // The sign-off's audit event, so the check can tell a button sign-off from a property written
  // by REST. A read error leaves it null: the check then says unknown.
  let signoffEvent = null;
  const seq = ticket.signoff?.auditSeq;
  if (Number.isInteger(seq) && seq >= 0 && d.readAudit) {
    try {
      [signoffEvent] = await d.readAudit(seq, 1);
    } catch (error) {
      console.log('sign-off audit read failed', issueKey, error.message);
    }
  }
  // Approvals of removed or changed tests and the audited AC record (finding E1): the app's store
  // and the audit event of each entry. A reader that is not given (a replay) means none stored. A
  // read error makes the record unreadable, so the checks that use it say unknown.
  let approvals;
  const approvalEvents = new Map();
  // The deployed app reads the store it was given (Forge KVS); a test gives its own.
  const readStored = d.readApprovals ?? (d.store ? (key) => readApprovals(key, d.store) : null);
  if (readStored) {
    try {
      approvals = await readStored(issueKey);
      for (const seq of auditSeqs(approvals)) {
        if (!d.readAudit) break;
        const [e] = await d.readAudit(seq, 1);
        approvalEvents.set(seq, e);
      }
    } catch (error) {
      console.log('approval record read failed', issueKey, error.message);
      approvals = 'unreadable';
    }
  }
  // mergeRequiredTests: tests that must pass by name in the merge result. None are configured;
  // merged_clean still needs every base test kept and unique migrations. The checks read a
  // missing list as not known, so it is always set here.
  const ctx = { ticket, ...github, repo, linkedPr, mergeRequiredTests: [], config: configFor(repo), claimant: claim.by ?? null, signoffEvent, approvals, approvalEvents };
  let verdict = verify(claim, ctx);
  // The link is shown with the checks, as advice that never changes the verdict by itself.
  if (prLink) verdict = { ...verdict, checks: [...verdict.checks, { name: 'pr_link', status: 'pass', advisory: true, reason: prLink.reason }] };
  // Without the code host, a PR check that does not pass says why (a fail or an unknown).
  if ((githubError || !repo) && verdict.result !== 'supported' && verdict.checks.some((c) => ['pr_linked', 'on_main'].includes(c.name) && c.status !== 'pass')) {
    verdict = { ...verdict, result: 'cannot_verify', reason: `code host not reachable${githubError ? `: ${githubError}` : ''}` };
  }
  // Owner decision 20 Nov: a stored review is advice only. Its findings for the head commit are
  // shown with the verdict, marked "advice from a model, not counted"; they never change the
  // result, the reason or the checks. A failed read gives no advice and changes nothing.
  let reviews = [];
  if (github.pr?.headSha) {
    try {
      reviews = await d.collectReviews(issueKey);
    } catch (error) {
      console.log('reviews not read', issueKey, error.message);
    }
  }
  verdict = withAdvice(verdict, reviews, github.pr?.headSha ?? null);
  // Twin and origin come from the PR body the scenario generator writes; the skill is the
  // ticket's first label. They feed the monitor's assignment posterior, never the verdict.
  const { twin, origin } = parseTwin(github.pr?.body);
  const record = {
    claimId: claim.id, type: claim.type, result: verdict.result, reason: verdict.reason, checker: verdict.checkerVersion,
    at: new Date().toISOString(), headSha: github.pr?.headSha ?? null, twin, origin, skill: ticket.labels?.[0] ?? null,
    ...(verdict.advice.length ? { advice: verdict.advice } : {}),
    // The verdict view shows what was proved and what was not checked (src/verdict-view.js).
    checks: compactChecks(verdict.checks).slice(0, 30),
  };
  let comment = formatVerdict(issueKey, claim, verdict, { prUrl: github.pr?.url, githubConfigured: Boolean(repo) });
  // The panel's sign-off button reads these from the latest done verdict: the person who claimed
  // (who cannot sign off) and the merged commit that a sign-off must name (src/sign-off.js).
  record.claimant = claim.by ?? null;
  record.mergeSha = github.pr?.mergeSha ?? null;
  // DESIGN 15d: every done verdict carries the evidence record that code built from what it saw.
  let evidence = null;
  if (claim.type === 'done') {
    evidence = buildDoneEvidence(claim, ctx, verdict.checks, verdict.checkerVersion);
    record.evidenceHash = evidence.hash;
    comment = `${comment}\n${formatEvidence(evidence)}`;
  }
  console.log('verdict', issueKey, claim.type, verdict.result, JSON.stringify(github.meta ?? {}));
  return { verdict, record, comment, evidence };
}
