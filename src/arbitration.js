// Arbitration rule (DESIGN.md section 6a). The first rule that decides wins.
// No model chooses a winner; humans decide the listed domains and every remaining tie.

export const HUMAN_DOMAINS = [
  'money_semantics',
  'security_exception',
  'data_repair',
  'model_risk',
  'fairness',
  'product_behaviour',
];

// side: { id, gatesPassed, gateReason, metrics: { median, iqrLow, iqrHigh }, newFailureModes: [],
//         newDependencies: [], diffLines }
// ticket: { domain, preRegistered: { metric, higherIsBetter, margin } }
export function arbitrate(ticket, sides) {
  if (ticket.domain && HUMAN_DOMAINS.includes(ticket.domain)) {
    return decision('human', null, 'domain', `${ticket.domain} is decided by a human`, sides);
  }
  if (!ticket.preRegistered?.metric && ticket.metricDisputed) {
    return decision('human', null, 'metric', 'the ticket registers more than one metric, so code cannot pick the deciding one', sides);
  }

  // 1. Code gates.
  const alive = sides.filter((s) => s.gatesPassed);
  if (alive.length === 0) return decision('code-gate', null, 'gates', 'no side passes the gates', sides);
  if (alive.length === 1) {
    return decision('code-gate', alive[0].id, 'gates', `only ${alive[0].id} passes the gates`, sides);
  }
  // Duplicate work (one ticket started twice by mistake): the first head to pass all gates wins.
  if (ticket.duplicateWork && alive.every((s) => s.gatesPassedAt)) {
    const first = [...alive].sort((a, b) => String(a.gatesPassedAt).localeCompare(String(b.gatesPassedAt)))[0];
    return decision('code-gate', first.id, 'first to pass', `${first.id} passed all gates first, at ${first.gatesPassedAt}`, sides);
  }

  // 2. Pre-registered metric with a clear margin and no IQR overlap.
  const pre = ticket.preRegistered;
  if (pre?.metric) {
    // A registered metric missing on a side that passes the gates: code cannot compare.
    const missing = alive.filter((s) => !s.metrics);
    if (missing.length) {
      return decision('human', null, 'metric', `${missing.map((s) => s.id).join(', ')} has no ${pre.metric} in its report`, sides);
    }
    const ranked = [...alive].sort((a, b) =>
      pre.higherIsBetter === false ? a.metrics.median - b.metrics.median : b.metrics.median - a.metrics.median,
    );
    const [best, next] = ranked;
    // The margin is relative to the larger absolute value, so it works for negative values and
    // near zero (unit 2 review, item 9).
    const margin = pre.margin ?? 0.1;
    const gap = Math.abs(best.metrics.median - next.metrics.median);
    const scale = Math.max(Math.abs(best.metrics.median), Math.abs(next.metrics.median));
    const better = best.metrics.median !== next.metrics.median && gap >= margin * scale;
    const separated =
      pre.higherIsBetter === false
        ? best.metrics.iqrHigh < next.metrics.iqrLow
        : best.metrics.iqrLow > next.metrics.iqrHigh;
    if (better && separated) {
      return decision(
        'code-metric',
        best.id,
        pre.metric,
        `${best.id} ${pre.metric} median ${best.metrics.median} vs ${next.metrics.median}, IQRs apart`,
        sides,
      );
    }
  }

  // 3. Team lead tie-breaks in fixed order. A value nobody measured is not "none": any unknown
  // input of a rule sends the case to a human (unit 2 review, item 3).
  const unknown = (field, label) => alive.filter((s) => s[field] === null || s[field] === undefined)
    .map((s) => `${s.id}: ${label} not known`);
  for (const [field, label] of [['newFailureModes', 'new failure modes'], ['newDependencies', 'new dependencies'], ['diffLines', 'diff size']]) {
    const gaps = unknown(field, label);
    if (gaps.length) return decision('human', null, 'unknown input', gaps.join('; '), sides);
  }
  const byFailureModes = minBy(alive, (s) => (s.newFailureModes ?? []).length);
  if (byFailureModes.length === 1) {
    return decision('lead-rule', byFailureModes[0].id, 'fewer new failure modes', describe(alive, 'newFailureModes'), sides);
  }
  const byDeps = minBy(byFailureModes, (s) => (s.newDependencies ?? []).length);
  if (byDeps.length === 1) {
    return decision('lead-rule', byDeps[0].id, 'no new dependency', describe(byFailureModes, 'newDependencies'), sides);
  }
  const byDiff = minBy(byDeps, (s) => s.diffLines);
  if (byDiff.length === 1) {
    return decision('lead-rule', byDiff[0].id, 'smaller diff', `${byDiff[0].id} changes ${byDiff[0].diffLines} lines`, sides);
  }

  // 4. Human.
  return decision('human', null, 'tie', 'no rule separates the sides', sides);
}

function minBy(items, fn) {
  const min = Math.min(...items.map(fn));
  return items.filter((i) => fn(i) === min);
}

function describe(items, field) {
  return items.map((s) => `${s.id}: ${(s[field] ?? []).join(', ') || 'none'}`).join('; ');
}

function decision(decidedBy, winner, rule, reason, sides) {
  return {
    decidedBy,
    winner,
    rule,
    reason,
    sides: sides.map((s) => ({ id: s.id, outcome: winner === null ? 'pending' : s.id === winner ? 'won' : 'arbitrated_out' })),
  };
}
