// Monitor view (DESIGN 9b, cut to what the video needs): the audit chain check, one row per
// ticket with its claims, and the assignment posterior per (twin, skill) replayed from verdicts.
// Pure functions; the resolver reads the audit chain and passes it in.

import { DECAY, updatePosterior } from './assignment.js';
import { verifyChain } from './audit.js';

// The scenario generator writes "Twin change: scripted (Raj)" or "Twin change: live (Raj)" into
// the PR body. Anything else is treated as unknown, never guessed.
const TWIN_RE = /Twin change: (scripted|live) \(([A-Z][a-z]{1,19})\)/;

export function parseTwin(body) {
  const m = TWIN_RE.exec(String(body ?? ''));
  return m ? { origin: m[1], twin: m[2] } : { origin: null, twin: null };
}

// Section 5 / 9h: quality 1 for a first claim supported, 0.5 after one contradiction, 0 after two
// or more. The demo tickets have no due dates, so on_time is taken as 1 and the page says so.
export function ticketReward(contradictions, onTime = 1) {
  const quality = contradictions === 0 ? 1 : contradictions === 1 ? 0.5 : 0;
  return Number((0.4 * onTime + 0.6 * quality).toFixed(4));
}

export function buildMonitor(events) {
  const chain = verifyChain(events);
  const tickets = new Map();
  const posteriors = new Map();
  let outcomes = 0;
  const decisions = [];
  for (const e of events) {
    if (e.event === 'decision' && e.data?.issueKey) {
      const d = e.data;
      decisions.push({
        seq: e.seq, issueKey: d.issueKey, side: d.side, by: d.by ?? null, at: d.at ?? e.at,
        agreesWithCode: d.agreesWithCode ?? null, agreesWithOpinion: d.agreesWithOpinion ?? null,
        overridesFailedGate: Boolean(d.overridesFailedGate),
      });
      continue;
    }
    if (e.event !== 'verdict' || !e.data?.issueKey) continue;
    const d = e.data;
    const t = tickets.get(d.issueKey) ?? { issueKey: d.issueKey, twin: null, origin: null, skill: null, claims: [], contradictions: 0, closed: false, reward: null };
    t.twin = d.twin ?? t.twin;
    t.origin = d.origin ?? t.origin;
    t.skill = d.skill ?? t.skill;
    t.claims.push({ seq: e.seq, type: d.type, result: d.result, at: d.at ?? e.at });
    if (!t.closed && d.result === 'contradicted') t.contradictions += 1;
    // A ticket's outcome is fixed by its first supported claim; later claims do not change it.
    if (!t.closed && d.result === 'supported') {
      t.closed = true;
      t.reward = ticketReward(t.contradictions);
      if (t.twin) {
        const key = `${t.twin}|${t.skill ?? 'general'}`;
        const prev = posteriors.get(key) ?? { twin: t.twin, skill: t.skill ?? 'general', post: { alpha: 1, beta: 1 }, n: 0 };
        posteriors.set(key, { ...prev, post: updatePosterior(prev.post, t.reward, DECAY), n: prev.n + 1 });
        outcomes += 1;
      }
    }
    tickets.set(d.issueKey, t);
  }
  const posteriorRows = [...posteriors.values()].map((p) => ({
    twin: p.twin,
    skill: p.skill,
    alpha: Number(p.post.alpha.toFixed(3)),
    beta: Number(p.post.beta.toFixed(3)),
    mean: Number((p.post.alpha / (p.post.alpha + p.post.beta)).toFixed(3)),
    outcomes: p.n,
  })).sort((a, b) => a.skill.localeCompare(b.skill) || b.mean - a.mean);
  return {
    chain: chain.ok
      ? { ok: true, length: chain.length, headSeq: events.length ? events[events.length - 1].seq : null, head: chain.head }
      : { ok: false, at: chain.at, reason: chain.reason },
    tickets: [...tickets.values()],
    posteriors: posteriorRows,
    decisions,
    outcomes,
    notes: [
      'Only the assignment step is a bandit. This app trains no model weights.',
      'The page sets on_time to 1, because the demo tickets have no due dates.',
      'A ticket without a "Twin change" line in its PR gives no posterior update.',
      'Any user who can comment on a work item can record a decision. The page shows the author\'s Atlassian account id beside each decision.',
    ],
  };
}
