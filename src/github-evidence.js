// Collects GitHub evidence for one ticket. fetchFn is injected (Forge fetch in production,
// a stub in tests). Token optional: without it, only a public repository can be read.

import { extractReport, namesKey } from './verifier/report.js';

const API = 'https://api.github.com';
const BOT = 'github-actions[bot]';
// The GitHub Actions bot account. Checked by id and type: a login is only text.
export const ACTIONS_BOT_ID = 41898282;
const isActionsBot = (u) => u?.id === ACTIONS_BOT_ID && u?.type === 'Bot';

// All changed file names of one PR (GitHub serves at most 3,000, in pages of 100). A renamed
// file counts under both names.
export async function listPrFiles(get, repo, prNumber) {
  const names = [];
  for (let page = 1; page <= 30; page += 1) {
    const files = (await get(`/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`)) ?? [];
    for (const f of files) names.push(f.filename, ...(f.previous_filename ? [f.previous_filename] : []));
    if (files.length < 100) break;
  }
  return names;
}

export async function collectGithub({ repo, key, token, fetchFn }) {
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
  // Pages of 100 until a short page or the page limit.
  const getPages = async (path, maxPages, pick = (body) => body, options = {}) => {
    const items = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const body = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, options);
      const list = pick(body) ?? [];
      items.push(...list);
      if (list.length < 100) break;
    }
    return items;
  };

  // The 500 most recently updated pull requests.
  const pulls = await getPages(`/repos/${repo}/pulls?state=all&sort=updated&direction=desc`, 5, (b) => b, { required: true });
  // A PR is linked when its title or branch names the key at a boundary, and its head branch is
  // in this repository (not a fork). Closed PRs that were not merged are abandoned work.
  const naming = pulls.filter((p) => p.head?.repo?.full_name === repo && (namesKey(p.title, key) || namesKey(p.head?.ref, key)));
  const live = naming.filter((p) => !(p.state === 'closed' && !p.merged_at));
  const match = live[0] ?? naming[0];
  const prCandidates = live.map((p) => p.number);
  const pr = match
    ? {
        number: match.number,
        title: match.title,
        branch: match.head?.ref,
        state: match.state,
        merged: Boolean(match.merged_at),
        headSha: match.head?.sha,
        url: match.html_url,
      }
    : null;

  let report = null;
  let reportAuthor = null;
  let reportComment = null;
  let prFiles = null;
  let workflowRuns = [];
  if (pr) {
    const runs = await getPages(`/repos/${repo}/actions/runs?head_sha=${pr.headSha}`, 3, (b) => b?.workflow_runs);
    workflowRuns = runs.map((r) => ({
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
    // Comments come oldest first; the latest bot report can be on any page.
    const comments = await getPages(`/repos/${repo}/issues/${pr.number}/comments`, 10);
    const fromBot = comments.filter((c) => isActionsBot(c.user) && extractReport(c.body));
    const latest = fromBot[fromBot.length - 1];
    if (latest) {
      report = extractReport(latest.body);
      reportAuthor = BOT;
      reportComment = { createdAt: latest.created_at, updatedAt: latest.updated_at };
    }
    // Every changed file, so the verifier can see a change to the workflow or the report plugin.
    prFiles = await listPrFiles(get, repo, pr.number);
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
    report,
    reportAuthor,
    reportComment,
    prFiles,
    workflowRuns,
    baseReport,
    baseWorkflowFiles: baseReport?.workflow_files ?? null,
    deployRuns,
    meta: { calls, rateRemaining, authenticated: Boolean(token) },
  };
}
