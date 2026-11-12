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
    return decision('human', null, 'metric', 'the metric was not pre-registered', sides);
  }

  // 1. Code gates.
  const alive = sides.filter((s) => s.gatesPassed);
  if (alive.length === 0) return decision('code-gate', null, 'gates', 'no side passes the gates', sides);
  if (alive.length === 1) {
    return decision('code-gate', alive[0].id, 'gates', `only ${alive[0].id} passes the gates`, sides);
  }

  // 2. Pre-registered metric with a clear margin and no IQR overlap.
  const pre = ticket.preRegistered;
  if (pre?.metric) {
    const ranked = [...alive].sort((a, b) =>
      pre.higherIsBetter === false ? a.metrics.median - b.metrics.median : b.metrics.median - a.metrics.median,
    );
    const [best, next] = ranked;
    const margin = pre.margin ?? 0.1;
    const better =
      pre.higherIsBetter === false
        ? best.metrics.median <= next.metrics.median * (1 - margin)
        : best.metrics.median >= next.metrics.median * (1 + margin);
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

  // 3. Team lead tie-breaks in fixed order.
  const byFailureModes = minBy(alive, (s) => (s.newFailureModes ?? []).length);
  if (byFailureModes.length === 1) {
    return decision('lead-rule', byFailureModes[0].id, 'fewer new failure modes', describe(alive, 'newFailureModes'), sides);
  }
  const byDeps = minBy(byFailureModes, (s) => (s.newDependencies ?? []).length);
  if (byDeps.length === 1) {
    return decision('lead-rule', byDeps[0].id, 'no new dependency', describe(byFailureModes, 'newDependencies'), sides);
  }
  const byDiff = minBy(byDeps, (s) => s.diffLines ?? 0);
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
