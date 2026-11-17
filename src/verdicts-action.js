// Rovo action and MCP tool `get-verdicts` (DESIGN 9i): read-only. Returns the verifier's verdicts
// on one work item, the arbitration case if there is one, and the audit chain head, so another
// agent can see why its claim was supported or contradicted. Nothing is written.

import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';

const KEY = /^[A-Z][A-Z0-9]*-[1-9][0-9]*$/;
const MAX = 20;

export function parseVerdictsInput(payload) {
  const issueKey = String(payload?.issueKey ?? '').trim().toUpperCase();
  const asked = Number(payload?.limit ?? 5);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX) : 5;
  return { issueKey, limit, error: KEY.test(issueKey) ? null : 'issueKey must look like BANK-32' };
}

// Only fields that are already shown on the work item; never the case packet or opinion text.
export function summarise(issueKey, { verdicts, kase, head }, limit) {
  const list = Array.isArray(verdicts) ? verdicts : [];
  const latest = list.slice(-limit).reverse().map((v) => ({
    claimId: v.claimId ?? null,
    type: v.type ?? null,
    result: v.result ?? null,
    reason: v.reason ?? null,
    checker: v.checker ?? null,
    headSha: v.headSha ?? null,
    at: v.at ?? null,
  }));
  const arbitration = kase
    ? {
      prNumbers: kase.prNumbers ?? [],
      decidedBy: kase.arbitration?.decidedBy ?? null,
      rule: kase.arbitration?.rule ?? null,
      winner: kase.arbitration?.winner ?? null,
      opinionAllowed: Boolean(kase.opinionAllowed),
      opinions: (kase.opinions ?? []).map((o) => ({ outcome: o.outcome, guard: o.guard ?? null, at: o.at ?? null })),
      finalDecision: 'human',
      humanDecision: (() => {
        const d = (kase.decisions ?? []).at(-1);
        return d ? { side: d.side, agreesWithCode: d.agreesWithCode, agreesWithOpinion: d.agreesWithOpinion, at: d.at } : null;
      })(),
    }
    : null;
  return {
    ok: true,
    issueKey,
    total: list.length,
    verdicts: latest,
    arbitration,
    audit: head ? { seq: head.seq, hash: head.hash } : null,
    note: 'Verdicts come from deterministic checks; no model decided them. An opinion never decides.',
  };
}

async function readVerdictProperty(issueKey) {
  // As the user: a caller who cannot see the work item gets nothing.
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/properties/aat.verdicts`);
  if (response.status === 404) {
    // 404 means either no such issue (or no access) or no verdict yet; tell them apart.
    const issue = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary`);
    return issue.ok ? { visible: true, verdicts: [] } : { visible: false };
  }
  if (!response.ok) return { visible: false };
  return { visible: true, verdicts: (await response.json()).value ?? [] };
}

export async function getVerdicts(payload, deps = {}) {
  const { readProperty = readVerdictProperty, store = kvs } = deps;
  const input = parseVerdictsInput(payload);
  if (input.error) return { ok: false, error: input.error };
  const read = await readProperty(input.issueKey);
  if (!read.visible) return { ok: false, error: `${input.issueKey} was not found, or you cannot see it` };
  const [kase, head] = await Promise.all([store.get(`case:${input.issueKey}`), store.get('audit-head')]);
  const result = summarise(input.issueKey, { verdicts: read.verdicts, kase, head }, input.limit);
  console.log('get-verdicts', input.issueKey, result.total);
  return result;
}
