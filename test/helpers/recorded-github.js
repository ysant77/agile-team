// Serves a recorded GitHub (fixtures/bench/*.json) to the app's GitHub reader. The data comes from
// the local benchmark run: real CI reports of each case branch, and the GitHub-side facts the
// case states (simulated where the case says so).

import * as sim from '../../benchmark/run/sim-provenance.mjs';

const BOT = { login: 'github-actions[bot]', id: 41898282, type: 'Bot' };
const REPO = 'ysant77/yms-bank-demo';

export function fetchFrom(d) {
  const page = (u) => Number(new URL(u).searchParams.get('page') ?? 1);
  // main.json as served; its push run's marker is its hash (as in benchmark/run/score.mjs).
  const mainOf = () => (d.main === 'report' ? { ...d.report, head_sha: d.runs[0].head_sha } : d.main);
  const routes = [
    // Report provenance (SCORER-CHANGES 20), for fixtures saved with ciText, marker and pushRunId
    // by score.mjs --dump. An older fixture has none of them: no push run and no artifacts.
    [/\/actions\/runs\?head_sha=[0-9a-f]+&event=push/, (u) => {
      const sha = new URL(u).searchParams.get('head_sha');
      const main = mainOf();
      if (d.runs404) return 404;
      return { workflow_runs: main && d.pushRunId && main.head_sha === sha ? [sim.pushRun({ id: d.pushRunId, sha, repo: REPO })] : [] };
    }],
    [/\/actions\/runs\/\d+\/artifacts/, (u) => {
      const id = Number(/runs\/(\d+)\/artifacts/.exec(u)[1]);
      if (id === d.runs?.[0]?.id && 'ciText' in d) return sim.prArtifacts({ attempt: d.runs[0].run_attempt, ciText: d.ciText, marker: d.marker });
      if (d.cancelledRunId && id === d.cancelledRunId) return { total_count: 0, artifacts: [] };
      if (d.pushRunId && id === d.pushRunId && mainOf()) return sim.mainArtifacts(JSON.stringify(mainOf()));
      return 404;
    }],
    [/\/pulls\?/, (u) => (page(u) === 1 ? d.pulls : [])],
    [/\/actions\/runs\/\d+\/attempts\/(\d+)\/jobs/, (u) => d.attempts?.[/attempts\/(\d+)/.exec(u)[1]] ?? 404],
    // The run record of an earlier attempt (its conclusion); fixtures/bench "attemptRuns".
    [/\/actions\/runs\/\d+\/attempts\/(\d+)(\?|$)/, (u) => d.attemptRuns?.[/attempts\/(\d+)/.exec(u)[1]] ?? 404],
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
      const main = mainOf();
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
