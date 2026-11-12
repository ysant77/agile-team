import { fetch } from '@forge/api';
import { parseRepository } from './text.js';

const API = 'https://api.github.com';

// Spike: unauthenticated read of a public repository (60 requests per hour per IP).
export async function readLatestCommit(repository) {
  const repo = parseRepository(repository);
  const response = await fetch(`${API}/repos/${repo}/commits?per_page=1`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'agile-team-forge-app',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    return { ok: false, repository: repo, status: response.status };
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
