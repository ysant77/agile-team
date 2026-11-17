// The fields the readers always set (src/github-evidence.js, src/jira-evidence.js and decide() in
// src/verify-claim.js), for contexts that tests build by hand. The checks read a missing field as
// not known (README, "No check passes by default"), so a hand-built context adds them here. A
// field that the test sets itself wins.
export const COMPLETE = { pulls: false, comments: false, runs: false, files: false, checks: false };

export function withReader(ctx) {
  const out = { truncated: COMPLETE, mergeRequiredTests: [], ...ctx };
  if (out.pr && !('prCandidates' in ctx) && Number.isInteger(out.pr.number)) out.prCandidates = [out.pr.number];
  if (out.ticket && typeof out.ticket === 'object') out.ticket = { subtasks: [], links: [], ...out.ticket };
  return out;
}
