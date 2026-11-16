// Collects GitHub evidence for one ticket. fetchFn is injected (Forge fetch in production,
// a stub in tests). Token optional: without it, only a public repository can be read.

import { extractReport, namesKey } from './verifier/report.js';

const API = 'https://api.github.com';
const BOT = 'github-actions[bot]';
// The GitHub Actions bot account. Checked by id and type: a login is only text.
export const ACTIONS_BOT_ID = 41898282;
const isActionsBot = (u) => u?.id === ACTIONS_BOT_ID && u?.type === 'Bot';

// All changed file names of one PR (GitHub serves at most 3,000, in pages of 100). A renamed
// file counts under both names. A full last page means the list may go on: the result is null
// (not known), never a short list that hides a changed file (second review, item 1).
export const FILE_PAGES = 30;
export async function listPrFiles(get, repo, prNumber) {
  const names = [];
  for (let page = 1; page <= FILE_PAGES; page += 1) {
    const files = (await get(`/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`, { required: true })) ?? [];
    for (const f of files) names.push(f.filename, ...(f.previous_filename ? [f.previous_filename] : []));
    if (files.length < 100) return names;
  }
  return null;
}

// prNumber picks one pull request; without it, the latest one whose title or branch names the key.
export async function collectGithub({ repo, key, token, fetchFn, prNumber = null, securityCheck = null }) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'agile-team-forge-app',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  let calls = 0;
  let rateRemaining = null;
  // required: a 404 means GitHub hides the repository (private, no token), which is an error,
  // not an empty answer.
  const get = async (path, { required = false } = {}) => {
    calls += 1;
    const response = await fetchFn(`${API}${path}`, { headers });
    rateRemaining = response.headers?.get?.('x-ratelimit-remaining') ?? rateRemaining;
    if (response.status === 404 && !required) return null;
    if (!response.ok) throw new Error(`GitHub ${path.split('?')[0]}: HTTP ${response.status}`);
    return response.json();
  };
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
  const naming = prNumber
    ? pulls.filter((p) => p.number === prNumber)
    : pulls.filter((p) => sameRepo(p.head?.repo?.full_name) && (namesKey(p.title, key) || namesKey(p.head?.ref, key)));
  const live = naming.filter((p) => !(p.state === 'closed' && !p.merged_at));
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
        headSha: match.head?.sha,
        url: match.html_url,
        body: match.body ?? '',
        baseRef: match.base?.ref ?? null,
      }
    : null;

  let report = null;
  let reportAuthor = null;
  let reportComment = null;
  let prFiles = null;
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
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      runStartedAt: r.run_started_at,
      url: r.html_url,
    }));
    // GitHub lists only the latest attempt of a run. For a re-run, read the job steps of each
    // earlier attempt, so a failed attempt stays visible (benchmark B05).
    for (const run of workflowRuns) {
      run.earlierFailures = [];
      for (let n = 1; n < (run.attempt ?? 1) && n <= 5; n += 1) {
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
    }
    // Comments come oldest first; the latest bot report can be on any page.
    const commentPages = await getPages(`/repos/${repo}/issues/${pr.number}/comments`, 10);
    truncated.comments = commentPages.truncated;
    const fromBot = commentPages.items.filter((c) => isActionsBot(c.user) && extractReport(c.body));
    const latest = fromBot[fromBot.length - 1];
    if (latest) {
      report = extractReport(latest.body);
      reportAuthor = BOT;
      reportComment = { createdAt: latest.created_at, updatedAt: latest.updated_at };
    }
    // Every changed file, so the verifier can see a change to the workflow or the report plugin.
    prFiles = await listPrFiles(get, repo, pr.number);
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

  // Report for the default branch, written by CI to the `ci-reports` branch as main.json.
  let baseReport = null;
  const file = await get(`/repos/${repo}/contents/main.json?ref=ci-reports`);
  if (file?.content) {
    try {
      baseReport = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    } catch {
      baseReport = null;
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
    truncated,
    report,
    reportAuthor,
    reportComment,
    prFiles,
    baseTip,
    securityRuns,
    workflowRuns,
    baseReport,
    baseWorkflowFiles: baseReport?.workflow_files ?? null,
    // A merged PR's result on main is the main report (ci-reports/main.json). It counts only while
    // it is for the merge commit; after a later merge the check says the report is for another
    // commit (DESIGN 15a).
    mergeSha: pr?.mergeSha ?? null,
    mergeReport: pr?.mergeSha ? baseReport : null,
    deployRuns,
    meta: { calls, rateRemaining, authenticated: Boolean(token) },
  };
}

// Size of one pull request: changed lines and file names (two calls).
export async function collectPrStats({ repo, prNumber, token, fetchFn }) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'agile-team-forge-app',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const get = async (path) => {
    const response = await fetchFn(`${API}${path}`, { headers });
    if (!response.ok) throw new Error(`GitHub ${path.split('?')[0]}: HTTP ${response.status}`);
    return response.json();
  };
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
  const diffLines = (pr.additions ?? 0) + (pr.deletions ?? 0);
  if (!complete) return { diffLines, files: null, patches: null };
  // Patches of Python files, so a metric gate can see added lines that could tamper with a
  // measurement. GitHub leaves out the patch of a very large file; that is kept as null.
  const patches = Object.fromEntries(files.filter((f) => f.filename.endsWith('.py')).map((f) => [f.filename, f.patch ?? null]));
  return { diffLines, files: files.map((f) => f.filename), patches };
}

// Changed files of one pull request with their patches, for the code reviewer (DESIGN 14a). Every
// page of 100 (GitHub serves at most 3,000 files); GitHub leaves out the patch of a very large
// file, which stays null.
export async function collectPrFiles({ repo, prNumber, token, fetchFn }) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'agile-team-forge-app',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  // Any error, a 404 included, stops the read: a hidden list is not an empty change. A full last
  // page means the list may go on, so it is marked as cut (second review of unit 1, items 1, 2).
  const files = [];
  for (let page = 1; page <= FILE_PAGES; page += 1) {
    const response = await fetchFn(`${API}/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`, { headers });
    if (!response.ok) throw new Error(`GitHub pull request files: HTTP ${response.status}`);
    const list = await response.json();
    files.push(...list.map((f) => ({ filename: f.filename, status: f.status, patch: typeof f.patch === 'string' ? f.patch : null })));
    if (list.length < 100) return { files, truncated: false };
  }
  return { files, truncated: true };
}
