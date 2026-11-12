// Role-by-model table from one or more results files.
//   node bakeoff/report.js bakeoff/results/<run>.jsonl [...] > bakeoff/REPORT.md

import { readFileSync } from 'node:fs';

const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
const models = [...new Set(rows.map((r) => r.model))];
const roles = ['pm', 'dev', 'qa', 'ds', 'lead'].filter((role) => rows.some((r) => r.role === role));
const pick = (model, role) => rows.filter((r) => r.model === model && r.role === role);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const pct = (x) => (x === null ? '-' : `${Math.round(x * 100)}%`);

const lines = ['# Role bake-off results', '', `Rows: ${rows.length}. Score = share of tasks fully passed (see DESIGN 9e for each role's rule).`, ''];
lines.push(`| Model | ${roles.join(' | ')} | valid JSON | tokens/s | timeouts | wall min |`);
lines.push(`|---|${roles.map(() => '---').join('|')}|---|---|---|---|`);
for (const model of models) {
  const all = rows.filter((r) => r.model === model);
  const cells = roles.map((role) => {
    const rs = pick(model, role);
    return rs.length ? `${rs.filter((r) => r.score === 1).length}/${rs.length}` : '-';
  });
  lines.push(`| ${model} | ${cells.join(' | ')} | ${pct(mean(all.map((r) => r.validJsonRate)))} | ${(mean(all.map((r) => r.tokensPerS).filter(Boolean)) ?? 0).toFixed(1)} | ${all.reduce((s, r) => s + (r.timeouts ?? 0), 0)} | ${(all.reduce((s, r) => s + r.wallS, 0) / 60).toFixed(1)} |`);
}

const lead = rows.filter((r) => r.role === 'lead');
if (lead.length) {
  lines.push('', '## AI team lead detail', '', '| Model | agreement | hand-off recall | invalid opinions | Brier (raw decision) |', '|---|---|---|---|---|');
  for (const model of models) {
    const rs = lead.filter((r) => r.model === model);
    if (!rs.length) continue;
    const humans = rs.filter((r) => r.hidden === 'human');
    const scored = rs.filter((r) => typeof r.confidence === 'number');
    const brier = mean(scored.map((r) => (r.confidence - (r.rawCorrect ? 1 : 0)) ** 2));
    lines.push(`| ${model} | ${rs.filter((r) => r.agree).length}/${rs.length} | ${humans.filter((r) => r.advised === 'human').length}/${humans.length} | ${rs.filter((r) => r.invalid).length} | ${brier === null ? '-' : brier.toFixed(3)} |`);
  }
}
const pm = rows.filter((r) => r.role === 'pm');
if (pm.length) {
  lines.push('', '## PM detail', '', '| Model | lint findings left (mean) | valid AC lines | ungrounded numbers | rounds (mean) |', '|---|---|---|---|---|');
  for (const model of models) {
    const rs = pm.filter((r) => r.model === model && !r.failed);
    if (!rs.length) continue;
    lines.push(`| ${model} | ${mean(rs.map((r) => r.findings)).toFixed(2)} | ${pct(mean(rs.map((r) => r.validAcShare)))} | ${rs.reduce((s, r) => s + r.ungrounded, 0)} | ${mean(rs.map((r) => r.rounds)).toFixed(1)} |`);
  }
}
const code = rows.filter((r) => ['dev', 'ds'].includes(r.role));
if (code.length) {
  lines.push('', '## Developer and DS detail', '', '| Model | role | task | AC tests | full suite | outside allowlist | changed lines | note |', '|---|---|---|---|---|---|---|---|');
  for (const r of code) {
    lines.push(`| ${r.model} | ${r.role} | ${r.task} | ${r.acPass ?? '-'} | ${r.suitePass ?? '-'} | ${(r.outside ?? []).join(' ') || '-'} | ${r.changedLines ?? '-'} | ${r.failed ? r.failed.slice(0, 60) : r.metrics ? `pr_auc ${r.metrics.pr_auc}` : ''} |`);
  }
}
console.log(lines.join('\n'));
