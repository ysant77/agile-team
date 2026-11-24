// Collects GitHub evidence for one ticket. fetchFn is injected (Forge fetch in production,
// a stub in tests). Token optional: without it, only a public repository can be read, and GitHub
// allows 60 calls an hour for each outgoing address (shared with other apps on the platform).

import { extractReport, extractReportText, namesKey } from './verifier/report.js';

const API = 'https://api.github.com';
const BOT = 'github-actions[bot]';
// The file on the ci-reports branch that holds the report of a base branch. main (or no branch)
// keeps main.json, so the current demo PRs read what they read before. Another branch gets
// reports/<name>.json, with each "/" as "-"; a name with any other character gives null.
export function baseReportPath(branch) {
  if (branch === null || branch === undefined || branch === 'main') return 'main.json';
  const name = String(branch).replaceAll('/', '-');
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name) && !name.includes('..') ? `reports/${name}.json` : null;
}

// The GitHub Actions bot account. Checked by id and type: a login is only text.
export const ACTIONS_BOT_ID = 41898282;
const isActionsBot = (u) => u?.id === ACTIONS_BOT_ID && u?.type === 'Bot';

export const githubHeaders = (token) => ({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'agile-team-forge-app',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

// "2026-11-23 08:01 UTC": the time to try again, as a person reads it.
const utc = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

// One classifier for a GitHub answer that is not ok (lead review of 23 Nov, finding 3). Classes:
// rate_limited (the hourly limit; 0 calls left), secondary_limit (too many calls at once),
// auth (401), forbidden (403 with calls left), not_found (404), server (5xx), other. The two
// limits and server errors are transient: they say nothing about the claim. GitHub's rules: the
// primary limit resets at x-ratelimit-reset (seconds since 1970); a secondary limit gives
// retry-after (seconds), or, without it, a wait of at least one minute.
export function classifyGithubResponse(response, { now = Date.now(), message = '' } = {}) {
  const status = response?.status ?? 0;
  const header = (k) => response?.headers?.get?.(k) ?? null;
  const remaining = header('x-ratelimit-remaining');
  const retryAfter = Number(header('retry-after'));
  const reset = Number(header('x-ratelimit-reset'));
  const limited = status === 403 || status === 429;
  if (limited && remaining === '0') {
    const at = Number.isFinite(reset) && reset > 0 ? reset * 1000 : now + 60 * 60 * 1000;
    return { kind: 'rate_limited', status, transient: true, retryAt: new Date(at).toISOString(),
      reason: `GitHub rate limit reached (HTTP ${status}, 0 calls left this hour); try again after ${utc(at)}` };
  }
  if (limited && (status === 429 || header('retry-after') !== null || /secondary rate limit/i.test(message))) {
    const at = now + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60) * 1000;
    return { kind: 'secondary_limit', status, transient: true, retryAt: new Date(at).toISOString(), retryAfterS: Math.round((at - now) / 1000),
      reason: `GitHub secondary rate limit, too many calls at once (HTTP ${status}); try again after ${utc(at)}` };
  }
  if (status === 401) {
    return { kind: 'auth', status, transient: false, retryAt: null,
      reason: 'GitHub refused the token (HTTP 401): it is wrong, revoked or expired' };
  }
  if (status === 403) {
    return { kind: 'forbidden', status, transient: false, retryAt: null,
      reason: 'GitHub refused access (HTTP 403) with calls left: the token or the app may not read this repository' };
  }
  if (status === 404) {
    return { kind: 'not_found', status, transient: false, retryAt: null,
      reason: 'not found (HTTP 404): the repository is private or not readable with this token, or the item does not exist' };
  }
  if (status >= 500) {
    return { kind: 'server', status, transient: true, retryAt: null, reason: `GitHub server error (HTTP ${status})` };
  }
  return { kind: 'other', status, transient: false, retryAt: null, reason: `GitHub answered HTTP ${status}` };
}

// A GitHub read that failed. The message keeps the old form "GitHub <path>: HTTP <status>" and
// adds the reason. transient: the failure says nothing about the claim, so no verdict is stored.
export class GitHubError extends Error {
  constructor(path, c, tries = 1) {
    const where = `GitHub ${path.split('?')[0]}`;
    const tail = tries > 1 ? ` after ${tries} tries` : '';
    super(c.status ? `${where}: HTTP ${c.status}: ${c.reason}${tail}` : `${where}: ${c.reason}${tail}`);
    this.name = 'GitHubError';
    Object.assign(this, { kind: c.kind, status: c.status, transient: c.transient, retryAt: c.retryAt, reason: `${c.reason}${tail}` });
  }
}

// The answer of a Rovo action when GitHub could not be read: the reason, not an exception.
export const githubFailure = (error) => ({ ok: false, error: `GitHub could not be read: ${error?.message ?? error}` });

// Bounded retry: a server error or a network error is tried 3 times in all (waits of 0.3 s and
// 0.9 s); a secondary limit with a wait of at most 10 s is waited out once. The primary limit is
// never waited out here: its reset can be an hour away.
export const RETRY = { waitsMs: [300, 900], secondaryMaxWaitS: 10 };
const realSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// One GitHub reader for all paths. get(path) returns the parsed body; with required: false, a 404
// gives null (an empty answer). Every other failure throws a GitHubError.
export function githubClient({ token, fetchFn, sleep = realSleep, now = Date.now, retry = RETRY }) {
  const headers = githubHeaders(token);
  // retried: the first 5 retries, each { kind, status, path without the query } (first judge
  // claims, 24 Nov: the count alone did not say which call was retried or why). No header, no body.
  const meta = { calls: 0, rateRemaining: null, retries: 0, retried: [] };
  const noteRetry = (kind, status, path) => {
    meta.retries += 1;
    if (meta.retried.length < 5) meta.retried.push({ kind, status, path: String(path).split('?')[0].slice(0, 120) });
  };
  const get = async (path, { required = false } = {}) => {
    let secondaryWaited = false;
    for (let attempt = 1; ; attempt += 1) {
      meta.calls += 1;
      let response;
      try {
        response = await fetchFn(`${API}${path}`, { headers });
      } catch (error) {
        if (attempt <= retry.waitsMs.length) {
          noteRetry('network', 0, path);
          await sleep(retry.waitsMs[attempt - 1]);
          continue;
        }
        throw new GitHubError(path, { kind: 'network', status: 0, transient: true, retryAt: null,
          reason: `GitHub could not be reached (${String(error?.message ?? error).slice(0, 80)})` }, attempt);
      }
      meta.rateRemaining = response.headers?.get?.('x-ratelimit-remaining') ?? meta.rateRemaining;
      if (response.status === 404 && !required) return null;
      if (response.ok) return response.json();
      let message = '';
      try {
        message = String((await response.json())?.message ?? '');
      } catch {
        message = '';
      }
      const c = classifyGithubResponse(response, { now: now(), message });
      if (c.kind === 'server' && attempt <= retry.waitsMs.length) {
        noteRetry('server', response.status, path);
        await sleep(retry.waitsMs[attempt - 1]);
        continue;
      }
      if (c.kind === 'secondary_limit' && !secondaryWaited && c.retryAfterS <= retry.secondaryMaxWaitS) {
        secondaryWaited = true;
        noteRetry('secondary_limit', response.status, path);
        await sleep(c.retryAfterS * 1000);
        continue;
      }
      throw new GitHubError(path, c, c.kind === 'server' ? attempt : 1);
    }
  };
  return { get, meta };
}

// All changed file names of one PR (GitHub serves at most 3,000, in pages of 100). A renamed
// file counts under both names. A full last page means the list may go on: the result is null
// (not known), never a short list that hides a changed file (second review, item 1).
export const FILE_PAGES = 30;
// patches: the patches of Python files are kept there (null when GitHub leaves one out), so a
// claim needs no second read of the same list (lead review of 23 Nov, finding 4).
export async function listPrFiles(get, repo, prNumber, added = [], patches = null) {
  const names = [];
  for (let page = 1; page <= FILE_PAGES; page += 1) {
    const files = (await get(`/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`, { required: true })) ?? [];
    for (const f of files) {
      names.push(f.filename, ...(f.previous_filename ? [f.previous_filename] : []));
      if (f.status === 'added') added.push(f.filename);
      if (patches && String(f.filename).endsWith('.py')) patches[f.filename] = typeof f.patch === 'string' ? f.patch : null;
    }
    if (files.length < 100) return names;
  }
  return null;
}

// prNumber picks one pull request; without it, the latest one whose title or branch names the key.
// provenance: { workflowPaths } reads the run artifacts that carry the report hash markers.
export async function collectGithub({ repo, key, token, fetchFn, prNumber = null, securityCheck = null, provenance = null, sleep, now }) {
  // required: a 404 means GitHub hides the repository (private, no token), which is an error,
  // not an empty answer.
  const { get, meta } = githubClient({ token, fetchFn, sleep, now });
  // Pages of 100 until a short page or the page limit. A full last page means the list may go
  // on, so the caller gets `truncated` and must treat the missing part as not known.
  const getPages = async (path, maxPages, pick = (body) => body, options = {}) => {
    const items = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const body = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, options);
      const list = pick(body) ?? [];
      items.push(...list);
      if (list.length < 100) return { items, truncated: false };
    }
    return { items, truncated: true };
  };
  const truncated = { pulls: false, comments: false, runs: false, files: false, checks: false };

  // The 500 most recently updated pull requests.
  const pullPages = await getPages(`/repos/${repo}/pulls?state=all&sort=updated&direction=desc`, 5, (b) => b, { required: true });
  const pulls = pullPages.items;
  truncated.pulls = pullPages.truncated;
  // GitHub compares owner and repository names without case.
  const sameRepo = (name) => String(name ?? '').toLowerCase() === String(repo).toLowerCase();
  // A PR is linked when its title or branch names the key at a boundary, and its head branch is
  // in this repository (not a fork). Closed PRs that were not merged are abandoned work.
  const linkedTo = (p) => sameRepo(p.head?.repo?.full_name) && (namesKey(p.title, key) || namesKey(p.head?.ref, key));
  const naming = prNumber ? pulls.filter((p) => p.number === prNumber) : pulls.filter(linkedTo);
  const live = naming.filter((p) => !(p.state === 'closed' && !p.merged_at));
  // PRs from forks that name the key: not linked (their CI report is not posted), but not
  // "no PR" either (benchmark I08).
  const forkPrs = prNumber ? [] : pulls
    .filter((p) => !sameRepo(p.head?.repo?.full_name) && (namesKey(p.title, key) || namesKey(p.head?.ref, key)))
    .filter((p) => !(p.state === 'closed' && !p.merged_at))
    .map((p) => p.number);
  const match = live[0] ?? naming[0];
  const prCandidates = prNumber ? [prNumber] : live.map((p) => p.number);
  const pr = match
    ? {
        number: match.number,
        title: match.title,
        branch: match.head?.ref,
        state: match.state,
        merged: Boolean(match.merged_at),
        mergeSha: match.merged_at ? (match.merge_commit_sha ?? null) : null,
        // Whether the PR names the key and comes from this repository; false for a PR picked by
        // number that does not (unit 2 review, item 7).
        linked: linkedTo(match),
        headSha: match.head?.sha,
        url: match.html_url,
        body: match.body ?? '',
        baseRef: match.base?.ref ?? null,
        // The GitHub author, for the decider rule of arbitration cases (src/decision.js).
        author: match.user ? { login: match.user.login ?? null, id: match.user.id ?? null } : null,
      }
    : null;

  let report = null;
  let reportRaw = null;
  let reportAuthor = null;
  let reportComment = null;
  let prFiles = null;
  let prAddedFiles = null;
  let prPatches = null;
  let workflowRuns = [];
  let securityRuns = null;
  if (pr) {
    const runPages = await getPages(`/repos/${repo}/actions/runs?head_sha=${pr.headSha}`, 3, (b) => b?.workflow_runs);
    truncated.runs = runPages.truncated;
    workflowRuns = runPages.items.map((r) => ({
      id: r.id,
      attempt: r.run_attempt ?? 1,
      name: r.name,
      path: r.path,
      headSha: r.head_sha,
      status: r.status,
      conclusion: r.conclusion,
      event: r.event ?? null,
      headBranch: r.head_branch ?? null,
      headRepo: r.head_repository?.full_name ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      runStartedAt: r.run_started_at,
      url: r.html_url,
    }));
    // GitHub lists only the latest attempt of a run. For a re-run, read the conclusion and the
    // job steps of each earlier attempt, so a failed or cancelled attempt stays visible
    // (benchmark B05). At most MAX_ATTEMPTS earlier attempts are read; the rest are counted in
    // earlierUnread. A list that could not be read is null (not known).
    const MAX_ATTEMPTS = 5;
    for (const run of workflowRuns) {
      run.earlierFailures = [];
      run.earlierConclusions = [];
      run.earlierUnread = Math.max(0, (run.attempt ?? 1) - 1 - MAX_ATTEMPTS);
      for (let n = 1; n < (run.attempt ?? 1) && n <= MAX_ATTEMPTS; n += 1) {
        const attempt = await get(`/repos/${repo}/actions/runs/${run.id}/attempts/${n}`);
        if (!attempt) run.earlierConclusions = null;
        else run.earlierConclusions?.push({ attempt: n, conclusion: attempt.conclusion ?? null });
        const jobs = await get(`/repos/${repo}/actions/runs/${run.id}/attempts/${n}/jobs`);
        if (!jobs) {
          run.earlierFailures = null; // not known
          break;
        }
        for (const job of jobs.jobs ?? []) {
          for (const step of job.steps ?? []) {
            if (step.conclusion === 'failure') run.earlierFailures.push({ attempt: n, job: job.name, step: step.name });
          }
        }
      }
      // A run without a result (cancelled, stale, skipped): read the steps of its own attempt. A
      // later success counts only when no step of this run failed (ci_green). null: not known.
      if (run.status === 'completed' && ['cancelled', 'stale', 'skipped'].includes(run.conclusion)) {
        const jobs = await get(`/repos/${repo}/actions/runs/${run.id}/attempts/${run.attempt ?? 1}/jobs`);
        run.stepFailures = jobs ? (jobs.jobs ?? []).flatMap((job) => (job.steps ?? [])
          .filter((step) => step.conclusion === 'failure')
          .map((step) => ({ attempt: run.attempt ?? 1, job: job.name, step: step.name }))) : null;
        // A job can fail with no step marked failure (a cancelled run, a job timeout). Its own
        // conclusion is read too. null: not known.
        run.jobConclusions = jobs ? (jobs.jobs ?? []).map((job) => ({ attempt: run.attempt ?? 1, job: job.name, conclusion: job.conclusion ?? null })) : null;
      }
    }
    // Comments come oldest first; the latest bot report can be on any page.
    const commentPages = await getPages(`/repos/${repo}/issues/${pr.number}/comments`, 10);
    truncated.comments = commentPages.truncated;
    const fromBot = commentPages.items.filter((c) => isActionsBot(c.user) && extractReport(c.body));
    const latest = fromBot[fromBot.length - 1];
    if (latest) {
      report = extractReport(latest.body);
      reportRaw = extractReportText(latest.body);
      reportAuthor = BOT;
      reportComment = { createdAt: latest.created_at, updatedAt: latest.updated_at };
    }
    // Every changed file, so the verifier can see a change to the workflow or the report plugin.
    prAddedFiles = [];
    prPatches = {};
    prFiles = await listPrFiles(get, repo, pr.number, prAddedFiles, prPatches);
    if (prFiles === null) {
      prAddedFiles = null;
      prPatches = null; // a cut list: not known
    }
    truncated.files = prFiles === null;
    // The code-scanning result check of the head (small security check, DESIGN 14g). Public
    // check runs need no token; the app id filter keeps the list short.
    if (securityCheck && securityCheck.mode !== 'off') {
      const appFilter = securityCheck.appId ? `?app_id=${securityCheck.appId}` : '';
      const checkPages = await getPages(`/repos/${repo}/commits/${pr.headSha}/check-runs${appFilter}`, 1, (b) => b?.check_runs);
      truncated.checks = checkPages.truncated;
      securityRuns = checkPages.items.map((c) => ({
        name: c.name,
        appSlug: c.app?.slug ?? null,
        appId: c.app?.id ?? null,
        headSha: c.head_sha,
        status: c.status,
        conclusion: c.conclusion,
        title: c.output?.title ?? null,
        summary: c.output?.summary ?? null,
      }));
    }
  }

  // The current tip of the PR's base branch: a ready claim needs CI on the current base
  // (benchmark I09). Unknown (null) when GitHub does not answer.
  let baseTip = null;
  if (pr?.baseRef && !pr.merged) {
    const branch = await get(`/repos/${repo}/branches/${encodeURIComponent(pr.baseRef)}`);
    baseTip = branch?.commit?.sha ?? null;
  }

  // Report of the PR's base branch, written by CI to the `ci-reports` branch: main.json for main
  // (and when no PR is found), reports/<branch>.json for another base branch (fresh-site path,
  // way A: one judge branch for each demo case). A name that cannot be mapped: no base report.
  let baseReport = null;
  let baseReportRaw = null;
  const reportPath = baseReportPath(pr?.baseRef ?? null);
  const file = reportPath ? await get(`/repos/${repo}/contents/${reportPath}?ref=ci-reports`) : null;
  if (file?.content) {
    try {
      baseReportRaw = Buffer.from(file.content, 'base64').toString('utf8');
      baseReport = JSON.parse(baseReportRaw);
    } catch {
      baseReport = null;
    }
  }

  // Report provenance (design P0-3): the artifact names of the pinned PR runs on the head, and of
  // the push runs for the main.json commit. At most 3 runs each; a list that cannot be read is
  // null (not known). One call per run, plus one for the push runs.
  const artifactsByRun = {};
  let baseRuns = [];
  if (provenance) {
    const paths = provenance.workflowPaths ?? ['.github/workflows/ci.yml'];
    const pinned = (r) => paths.includes(String(r.path ?? '').split('@')[0]);
    const listArtifacts = async (id) => {
      try {
        const body = await get(`/repos/${repo}/actions/runs/${id}/artifacts?per_page=100`);
        return Array.isArray(body?.artifacts) ? body.artifacts.map((a) => a.name) : null;
      } catch {
        return null;
      }
    };
    for (const run of workflowRuns.filter((r) => pinned(r) && r.event === 'pull_request').slice(0, 3)) {
      artifactsByRun[run.id] = await listArtifacts(run.id);
    }
    const baseSha = baseReport?.head_sha;
    if (typeof baseSha === 'string' && /^[0-9a-f]{40}$/.test(baseSha)) {
      try {
        const runs = await get(`/repos/${repo}/actions/runs?head_sha=${baseSha}&event=push&per_page=20`);
        baseRuns = (runs?.workflow_runs ?? []).map((r) => ({
          id: r.id, attempt: r.run_attempt ?? 1, path: r.path, headSha: r.head_sha, event: r.event ?? null,
          headBranch: r.head_branch ?? null, headRepo: r.head_repository?.full_name ?? null, conclusion: r.conclusion,
        }));
      } catch {
        baseRuns = null;
      }
      for (const run of (baseRuns ?? []).filter(pinned).slice(0, 3)) artifactsByRun[run.id] = await listArtifacts(run.id);
    }
  }

  // A merged PR whose merge commit has no main.json yet: the push runs on the merge commit, so the
  // reason can tell a run that is still going from a missing report (owner decision 24 Nov). One
  // call, only in that case; a read error gives null (not known).
  let mergeRuns = null;
  const mergeSha = pr?.mergeSha;
  if (typeof mergeSha === 'string' && /^[0-9a-f]{40}$/.test(mergeSha) && baseReport?.head_sha !== mergeSha) {
    try {
      const runs = await get(`/repos/${repo}/actions/runs?head_sha=${mergeSha}&event=push&per_page=20`);
      mergeRuns = Array.isArray(runs?.workflow_runs) ? runs.workflow_runs.map((r) => ({
        id: r.id, attempt: r.run_attempt ?? 1, path: r.path, headSha: r.head_sha, event: r.event ?? null,
        headBranch: r.head_branch ?? null, status: r.status ?? null, conclusion: r.conclusion ?? null,
      })) : null;
    } catch {
      mergeRuns = null;
    }
  }

  const deploys = await get(`/repos/${repo}/actions/workflows/deploy.yml/runs?per_page=20`);
  const deployRuns = (deploys?.workflow_runs ?? []).map((r) => ({
    name: 'deploy',
    tag: r.head_branch,
    conclusion: r.conclusion,
    createdAt: r.created_at,
    url: r.html_url,
  }));

  return {
    pr,
    prCandidates,
    forkPrs,
    truncated,
    report,
    reportRaw,
    reportAuthor,
    reportComment,
    prFiles,
    prAddedFiles,
    prPatches,
    baseTip,
    securityRuns,
    workflowRuns,
    baseReport,
    baseReportRaw,
    baseRuns,
    artifactsByRun,
    baseWorkflowFiles: baseReport?.workflow_files ?? null,
    // A merged PR's result on main is the main report (ci-reports/main.json). It counts only while
    // it is for the merge commit; after a later merge the check says the report is for another
    // commit (DESIGN 15a).
    mergeSha: pr?.mergeSha ?? null,
    mergeReport: pr?.mergeSha ? baseReport : null,
    mergeRuns,
    deployRuns,
    meta: { calls: meta.calls, retries: meta.retries, rateRemaining: meta.rateRemaining, authenticated: Boolean(token), ...(meta.retried.length ? { retried: meta.retried } : {}) },
  };
}

// Size of one pull request: changed lines and file names (two calls).
export async function collectPrStats({ repo, prNumber, token, fetchFn, sleep, now }) {
  const client = githubClient({ token, fetchFn, sleep, now });
  const get = (path) => client.get(path, { required: true });
  const pr = await get(`/repos/${repo}/pulls/${prNumber}`);
  // Every page of changed files. A full last page means the list may go on, so the files and
  // patches are null (not known), never a short list (second review of unit 1, item 1).
  const files = [];
  let complete = false;
  for (let page = 1; page <= FILE_PAGES; page += 1) {
    const list = await get(`/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`);
    files.push(...list);
    if (list.length < 100) {
      complete = true;
      break;
    }
  }
  // Missing counts are unknown, not 0: a 0 would win "smaller diff" (unit 2 review, item 3).
  const diffLines = typeof pr?.additions === 'number' && typeof pr?.deletions === 'number' ? pr.additions + pr.deletions : null;
  if (!complete) return { diffLines, files: null, patches: null };
  // Patches of Python files, so a metric gate can see added lines that could tamper with a
  // measurement. GitHub leaves out the patch of a very large file; that is kept as null.
  const patches = Object.fromEntries(files.filter((f) => f.filename.endsWith('.py')).map((f) => [f.filename, f.patch ?? null]));
  return { diffLines, files: files.map((f) => f.filename), patches };
}

// Changed files of one pull request with their patches, for the code reviewer (DESIGN 14a). Every
// page of 100 (GitHub serves at most 3,000 files); GitHub leaves out the patch of a very large
// file, which stays null.
export async function collectPrFiles({ repo, prNumber, token, fetchFn, sleep, now }) {
  const { get } = githubClient({ token, fetchFn, sleep, now });
  // Any error, a 404 included, stops the read: a hidden list is not an empty change. A full last
  // page means the list may go on, so it is marked as cut (second review of unit 1, items 1, 2).
  const files = [];
  for (let page = 1; page <= FILE_PAGES; page += 1) {
    const list = await get(`/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`, { required: true });
    files.push(...list.map((f) => ({ filename: f.filename, status: f.status, patch: typeof f.patch === 'string' ? f.patch : null })));
    if (list.length < 100) return { files, truncated: false };
  }
  return { files, truncated: true };
}
