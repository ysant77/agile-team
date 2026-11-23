import { fetch } from '@forge/api';
import { classifyGithubResponse, githubHeaders } from './github-evidence.js';
import { parseRepository } from './text.js';

const API = 'https://api.github.com';

// Spike: read the latest commit of a repository. The app's token is sent when one is set
// (without it, 60 calls an hour for each outgoing address).
export async function readLatestCommit(repository) {
  const repo = parseRepository(repository);
  const response = await fetch(`${API}/repos/${repo}/commits?per_page=1`, { headers: githubHeaders(process.env.GITHUB_TOKEN) });
  if (!response.ok) {
    const c = classifyGithubResponse(response);
    return { ok: false, repository: repo, status: response.status, kind: c.kind, reason: c.reason, retryAt: c.retryAt };
  }
  const [commit] = await response.json();
  return {
    ok: true,
    repository: repo,
    sha: commit.sha,
    date: commit.commit?.author?.date,
    message: (commit.commit?.message ?? '').split('\n')[0].slice(0, 200),
    url: commit.html_url,
    rateRemaining: response.headers.get('x-ratelimit-remaining'),
  };
}
