// Assignment helper: largest job first, load cap, Thompson sampling on Beta posteriors.
// A multi-armed bandit, not reinforcement learning. Pure functions; RNG is injected.

export const DECAY = 0.95;

// Small seeded RNG (mulberry32) so proposals are reproducible in tests and replays.
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Marsaglia-Tsang gamma sampler.
function gamma(shape, rng) {
  if (shape < 1) return gamma(shape + 1, rng) * rng() ** (1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v ** 3;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function betaSample(alpha, beta, rng) {
  const x = gamma(alpha, rng);
  return x / (x + gamma(beta, rng));
}

export function eligible(twin, ticket) {
  const skillsOk = ticket.skills.every((s) => (twin.skills[s] ?? 0) >= 2);
  return skillsOk && twin.load + ticket.points <= twin.capacity;
}

export function match(twin, ticket) {
  const levels = ticket.skills.map((s) => twin.skills[s] ?? 0);
  return levels.reduce((a, b) => a + b, 0) / levels.length / 5;
}

// Returns proposals with a stated reason; never assigns (a human accepts or overrides).
export function propose(tickets, twins, rng) {
  const load = Object.fromEntries(twins.map((t) => [t.id, t.load]));
  const sorted = [...tickets].sort((a, b) => b.points - a.points || a.key.localeCompare(b.key));
  return sorted.map((ticket) => {
    const main = ticket.skills[0];
    const scored = twins
      .map((t) => ({ ...t, load: load[t.id] }))
      .filter((t) => eligible(t, ticket))
      .map((t) => {
        const post = t.posterior?.[main] ?? { alpha: 1, beta: 1 };
        const theta = betaSample(post.alpha, post.beta, rng);
        const m = match(t, ticket);
        const score = theta * m - 0.5 * (t.load / t.capacity);
        return { twin: t, theta, m, score };
      })
      .sort((a, b) => b.score - a.score);
    if (scored.length === 0) {
      return { ticket: ticket.key, twin: null, reason: 'no eligible twin: propose a split or the next sprint' };
    }
    const best = scored[0];
    load[best.twin.id] += ticket.points;
    const reason = `${main} ${best.twin.skills[main]}/5, load ${best.twin.load}/${best.twin.capacity}, theta ${best.theta.toFixed(2)}`;
    return { ticket: ticket.key, twin: best.twin.id, reason, score: Number(best.score.toFixed(4)) };
  });
}

export function reward({ onTime, firstClaimSupported, contradictions, reopenedWithin7d }) {
  let quality = 0;
  if (!reopenedWithin7d) {
    if (firstClaimSupported) quality = 1;
    else if (contradictions === 1) quality = 0.5;
  }
  return Number((0.4 * (onTime ? 1 : 0) + 0.6 * quality).toFixed(4));
}

export function updatePosterior(post = { alpha: 1, beta: 1 }, r, g = DECAY) {
  return { alpha: g * post.alpha + r, beta: g * post.beta + (1 - r) };
}
