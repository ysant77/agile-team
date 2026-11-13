// Role-by-model report from one or more results files (DESIGN 9k, model selection protocol).
//   node bakeoff/report.js bakeoff/results/<run>.jsonl [...] > bakeoff/REPORT.md
//
// Per role: each model's score with the number of tasks, a 90% bootstrap interval over tasks, the
// spread across repeats, latency and peak memory. The leader and the runner-up are compared on the
// same tasks; when the 90% interval of the paired difference includes 0 the report says "no clear
// winner" and applies the pre-registered tie-break (smaller peak memory, then lower median latency).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUARD_VERSION } from '../src/opinion.js';
import { LINT_VERSION } from '../src/lint.js';

export const ROLE_ORDER = ['pm', 'dev', 'qa', 'ds', 'lead'];
const RESAMPLES = 2000;

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const pct = (x) => (x === null || x === undefined ? '-' : `${Math.round(x * 100)}%`);
const fix = (x, d = 1) => (x === null || x === undefined ? '-' : x.toFixed(d));

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Small seeded generator so the report is the same every time it is made.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// 90% percentile interval of the mean of `values`, resampling tasks with replacement.
export function bootstrap(values, seed = 1) {
  if (!values.length) return null;
  const next = rng(seed);
  const means = [];
  for (let i = 0; i < RESAMPLES; i += 1) {
    let sum = 0;
    for (let j = 0; j < values.length; j += 1) sum += values[Math.floor(next() * values.length)];
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.05 * RESAMPLES)], means[Math.ceil(0.95 * RESAMPLES) - 1]];
}

// A task run again (after a transport failure) counts once: the last row wins.
export function latestRows(all) {
  return [...new Map(all.map((r) => [`${r.model}|${r.role}|${r.task}|${r.repeat ?? 0}`, r])).values()];
}

export function summariseRole(rows, role, memory = {}) {
  // Lead and PM rows scored under older guards or lint rules are not compared (DESIGN 9k).
  const roleRows = rows.filter((r) => r.role === role && (role !== 'lead' || (r.guardVersion ?? 1) === GUARD_VERSION)
    && (role !== 'pm' || (r.lintVersion ?? 1) === LINT_VERSION));
  const tasks = [...new Set(roleRows.map((r) => r.task))].sort();
  const models = [...new Set(roleRows.map((r) => r.model))];
  const lines = models.map((model) => {
    const mine = roleRows.filter((r) => r.model === model);
    const base = mine.filter((r) => (r.repeat ?? 0) === 0);
    const scores = base.map((r) => (r.score === 1 ? 1 : 0));
    const byRepeat = new Map();
    for (const r of mine) {
      const k = r.repeat ?? 0;
      byRepeat.set(k, [...(byRepeat.get(k) ?? []), r.score === 1 ? 1 : 0]);
    }
    const repeatMeans = [...byRepeat.values()].filter((xs) => xs.length === base.length).map(mean);
    return {
      model,
      n: base.length,
      complete: base.length === tasks.length,
      passed: scores.reduce((s, x) => s + x, 0),
      score: mean(scores),
      interval: bootstrap(scores),
      repeats: repeatMeans.length,
      spread: repeatMeans.length > 1 ? [Math.min(...repeatMeans), Math.max(...repeatMeans)] : null,
      medianS: median(base.map((r) => r.wallS).filter((x) => typeof x === 'number')),
      tokensPerS: mean(base.map((r) => r.tokensPerS).filter(Boolean)),
      validJson: mean(base.map((r) => r.validJsonRate ?? 0)),
      peakGB: memory[model] ?? null,
      byTask: new Map(base.map((r) => [r.task, r.score === 1 ? 1 : 0])),
    };
  });
  const ranked = lines.filter((l) => l.complete).sort((x, y) => (y.score - x.score)
    || ((x.peakGB ?? Infinity) - (y.peakGB ?? Infinity)) || ((x.medianS ?? Infinity) - (y.medianS ?? Infinity)));
  let verdict;
  if (ranked.length === 0) verdict = { kind: 'none' };
  else if (ranked.length === 1) verdict = { kind: 'single', leader: ranked[0].model };
  else {
    const [a, b] = ranked;
    const diffs = tasks.map((t) => a.byTask.get(t) - b.byTask.get(t));
    const interval = bootstrap(diffs, 2);
    const clear = interval[0] > 0 && (a.spread === null || b.spread === null || a.spread[0] > b.spread[1]);
    // Tied models in the noise: the smaller and then the faster one wins (fixed before scoring).
    const tied = clear ? [] : ranked.filter((l) => {
      const d = tasks.map((t) => a.byTask.get(t) - l.byTask.get(t));
      return bootstrap(d, 2)[0] <= 0;
    });
    const pick = clear ? a : [...tied].sort((x, y) => ((x.peakGB ?? Infinity) - (y.peakGB ?? Infinity)) || ((x.medianS ?? Infinity) - (y.medianS ?? Infinity)))[0];
    verdict = { kind: clear ? 'clear' : 'noise', leader: a.model, runnerUp: b.model, diff: a.score - b.score, interval, tied: tied.map((l) => l.model), pick: pick.model };
  }
  return { role, tasks, lines, verdict };
}

export function readMemory(files) {
  const memory = {};
  for (const f of files) {
    const dir = dirname(f);
    const run = basename(f, '.jsonl');
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.startsWith(`${run}.mem.`) && n.endsWith('.json'))) {
      const m = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      memory[m.model] = Math.max(memory[m.model] ?? 0, m.peakVramGB ?? 0);
    }
  }
  return memory;
}

function verdictText(v) {
  if (v.kind === 'none') return 'No model has finished every task of this role yet.';
  if (v.kind === 'single') return `Only ${v.leader} has finished every task; no comparison yet.`;
  const d = `${v.leader} minus ${v.runnerUp}: ${fix(v.diff, 2)} (90% interval ${fix(v.interval[0], 2)} to ${fix(v.interval[1], 2)})`;
  if (v.kind === 'clear') return `**Clear winner: ${v.leader}.** ${d}.`;
  return `**No clear winner** (difference inside the noise). ${d}. Inside the noise: ${v.tied.join(', ')}. Tie-break (smaller peak memory, then lower median latency): **${v.pick}**.`;
}

export function render(all, memory = {}) {
  const rows = latestRows(all);
  const base = rows.filter((r) => (r.repeat ?? 0) === 0);
  const models = [...new Set(rows.map((r) => r.model))];
  const roles = ROLE_ORDER.filter((role) => rows.some((r) => r.role === role));
  const out = ['# Role bake-off results', '',
    `Rows: ${rows.length} (repeat 0 = deploy setting: ${base.length}). Score = share of tasks fully passed; each role's pass rule is in DESIGN 9e. Interval = 90% bootstrap over tasks. Spread = lowest to highest score across repeats (DESIGN 9k).`, ''];
  for (const role of roles) {
    const s = summariseRole(rows, role, memory);
    out.push(`## ${role} (${s.tasks.length} tasks)`, '');
    out.push('| Model | passed | score | 90% interval | repeats | spread | median s/task | tokens/s | peak GB | valid JSON |');
    out.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const l of [...s.lines].sort((x, y) => (y.score ?? 0) - (x.score ?? 0))) {
      out.push(`| ${l.model}${l.complete ? '' : ' (partial)'} | ${l.passed}/${l.n} | ${pct(l.score)} | ${l.interval ? `${pct(l.interval[0])}-${pct(l.interval[1])}` : '-'} | ${l.repeats} | ${l.spread ? `${pct(l.spread[0])}-${pct(l.spread[1])}` : '-'} | ${fix(l.medianS, 0)} | ${fix(l.tokensPerS)} | ${fix(l.peakGB)} | ${pct(l.validJson)} |`);
    }
    out.push('', verdictText(s.verdict), '');
  }

  const lead = base.filter((r) => r.role === 'lead');
  if (lead.length) {
    out.push('## AI team lead detail', '', '| Model | agreement | hand-off recall | invalid opinions | Brier (raw decision) |', '|---|---|---|---|---|');
    for (const model of models) {
      const rs = lead.filter((r) => r.model === model);
      if (!rs.length) continue;
      const humans = rs.filter((r) => r.hidden === 'human');
      const scored = rs.filter((r) => typeof r.confidence === 'number');
      const brier = mean(scored.map((r) => (r.confidence - (r.rawCorrect ? 1 : 0)) ** 2));
      out.push(`| ${model} | ${rs.filter((r) => r.agree).length}/${rs.length} | ${humans.filter((r) => r.advised === 'human').length}/${humans.length} | ${rs.filter((r) => r.invalid).length} | ${brier === null ? '-' : brier.toFixed(3)} |`);
    }
    out.push('');
  }
  const pm = base.filter((r) => r.role === 'pm');
  if (pm.length) {
    out.push('## PM detail', '', '| Model | lint findings left (mean) | valid AC lines | ungrounded numbers | rounds (mean) |', '|---|---|---|---|---|');
    for (const model of models) {
      const rs = pm.filter((r) => r.model === model && !r.failed);
      if (!rs.length) continue;
      out.push(`| ${model} | ${fix(mean(rs.map((r) => r.findings)), 2)} | ${pct(mean(rs.map((r) => r.validAcShare)))} | ${rs.reduce((s, r) => s + (r.ungrounded ?? 0), 0)} | ${fix(mean(rs.map((r) => r.rounds)))} |`);
    }
    out.push('');
  }
  const code = base.filter((r) => ['dev', 'ds'].includes(r.role));
  if (code.length) {
    out.push('## Developer and DS detail', '', '| Model | role | task | AC tests | full suite | outside allowlist | changed lines | note |', '|---|---|---|---|---|---|---|---|');
    for (const r of code) {
      out.push(`| ${r.model} | ${r.role} | ${r.task} | ${r.acPass ?? '-'} | ${r.suitePass ?? '-'} | ${(r.outside ?? []).join(' ') || '-'} | ${r.changedLines ?? '-'} | ${r.failed ? r.failed.slice(0, 60) : r.metrics ? `pr_auc ${r.metrics.pr_auc}` : ''} |`);
    }
  }
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  const all = files.flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
  console.log(render(all, readMemory(files)));
}
