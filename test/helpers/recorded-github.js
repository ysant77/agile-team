// Serves a recorded GitHub (fixtures/bench/*.json) to the app's GitHub reader. The data comes from
// the local benchmark run: real CI reports of each case branch, and the GitHub-side facts the
// case states (simulated where the case says so).

const BOT = { login: 'github-actions[bot]', id: 41898282, type: 'Bot' };

export function fetchFrom(d) {
  const page = (u) => Number(new URL(u).searchParams.get('page') ?? 1);
  const routes = [
    [/\/pulls\?/, (u) => (page(u) === 1 ? d.pulls : [])],
    [/\/actions\/runs\/\d+\/attempts\/(\d+)\/jobs/, (u) => d.attempts?.[/attempts\/(\d+)/.exec(u)[1]] ?? 404],
    [/\/actions\/runs\?head_sha=/, (u) => (d.runs404 ? 404 : { workflow_runs: page(u) === 1 ? d.runs : [] })],
    [/\/issues\/\d+\/comments/, (u) => (page(u) === 1 && d.comment ? [{ user: BOT, ...d.comment,
      body: `<!-- aat-ci-report -->\n\`\`\`json\n${JSON.stringify(d.report)}\n\`\`\`` }] : [])],
    [/\/pulls\/\d+\/files/, (u) => (d.filesTruncated
      ? Array.from({ length: 100 }, (_, i) => ({ filename: `src/gen/f${page(u)}_${i}.py`, patch: '' }))
      : d.files.slice((page(u) - 1) * 100, page(u) * 100))],
    [/\/pulls\/\d+$/, () => d.stats],
    [/\/branches\/main$/, () => ({ name: 'main', commit: { sha: d.baseTip } })],
    [/\/check-runs/, () => ({ check_runs: [{ name: 'CodeQL', app: { slug: 'github-advanced-security', id: 57789 }, head_sha: d.prHead, status: 'completed', conclusion: 'success', output: { title: 'No new alerts' } }] })],
    [/\/contents\/main\.json/, () => {
      const main = d.main === 'report' ? { ...d.report, head_sha: d.runs[0].head_sha } : d.main;
      return main ? { content: Buffer.from(JSON.stringify(main)).toString('base64') } : 404;
    }],
  ];
  return async (url) => {
    const hit = routes.find(([p]) => p.test(url));
    const body = hit ? hit[1](url) : 404;
    if (body === 404) return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
    return { ok: true, status: 200, json: async () => body, headers: { get: () => '4999' } };
  };
}
