// Re-score stored arm D records under the advice-only rule (owner decision 20 Nov). No model call.
//
//   node rescore_arm_d.mjs --app <agile-team checkout> --out <evidence dir> --manifest m.json \
//     --log <stored arm D dir> --truth truth-5.json --write <json file>
//
// For each stored run, the script rebuilds the review packet from the evidence (as arm_d.mjs does),
// replays the model's stored record-review calls through the app's guards and gate, and checks that
// the packet hash and the guard outcome are the ones stored. Then it applies the app's own
// withAdvice (src/review-advice.js) to C's verdict. The new D is the result that comes back.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkToolCall } from './dispatch.mjs';

const args = process.argv.slice(2);
const opt = (name) => args.filter((_, i) => args[i - 1] === name);
const APP = resolve(opt('--app')[0]);
const OUT = resolve(opt('--out')[0]);
const LOG = resolve(opt('--log')[0]);
const manifest = opt('--manifest').flatMap((m) => JSON.parse(readFileSync(m, 'utf8')));
const TRUTH = JSON.parse(readFileSync(opt('--truth')[0], 'utf8'));
const imp = (p) => import(pathToFileURL(join(APP, p)).href);
const { buildReviewPacket, applyReviewGuards, reviewGate } = await imp('src/review.js');
const { withAdvice } = await imp('src/review-advice.js');
const { TOOL_SPECS } = await imp('src/tool-specs.js');
const TOOL_NAMES = ['get-pr-diff', 'record-review', 'get-verdicts'];
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

const stored = readJson(join(LOG, 'arm-d.json'));
const cAll = readJson(join(OUT, 'results.json'));

// The packet of arm_d.mjs packetFor, with the same inputs (C's outcome and reason, PR 101 + n).
function packetFor(c, n, cResult) {
  const dir = join(OUT, c.branches[0].replaceAll('/', '_'));
  const meta = readJson(join(dir, 'meta.json'));
  const report = readJson(join(dir, 'report.json'));
  const ticket = { ...c.ticket, acceptanceCriteria: (c.ticket.acceptanceCriteria ?? []).map((a) => ({ ...a, statement: a.statement ?? a.text ?? '' })) };
  return buildReviewPacket({
    ticket, pr: { number: 101 + n, headSha: meta.pr_head ?? meta.head }, files: meta.files, filesTruncated: false,
    reportTests: (report?.tests ?? []).map((t) => t.id), verdict: { result: cResult.outcome, reason: cResult.reason }, trigger: 'request',
  });
}

// Replays the stored record-review calls in order, with arm_d.mjs's retry count.
function replay(trace, packet) {
  let retries = 0;
  for (const step of trace) {
    for (const call of step.calls ?? []) {
      if (call.name !== 'record-review') continue;
      if (!checkToolCall(TOOL_SPECS, TOOL_NAMES, call.name, call.arguments).ok) continue;
      const a = call.arguments ?? {};
      const raw = typeof a.review === 'string' ? a.review : JSON.stringify(a.review ?? '');
      const gate = reviewGate(applyReviewGuards(raw, packet, { model: 'qwen3-coder:30b', promptVersion: 'code-review/2' }), retries);
      if (gate.action === 'retry') retries += 1;
      else return gate.record;
    }
  }
  return null;
}

const ok = (id, outcome) => [...(TRUTH[id]?.correct ?? []), ...(TRUTH[id]?.accept ?? [])].includes(outcome);
const rows = [];
const problems = [];
for (const [n, c] of manifest.entries()) {
  const s = stored.results.find((r) => r.id === c.id);
  const cr = cAll.find((r) => r.id === c.id)?.C;
  if (!s || !cr) continue;
  if (cr.outcome !== s.C) problems.push(`${c.id}: C in results.json (${cr.outcome}) is not the stored C (${s.C})`);
  const runs = [];
  if (cr.outcome === 'supported') {
    const packet = packetFor(c, n, cr);
    for (const run of s.runs) {
      const rec = readJson(join(LOG, `${c.id}-run${run.run}.json`));
      const accepted = replay(rec.trace, packet);
      if ((accepted?.inputHash ?? null) !== (rec.inputHash ?? null)) problems.push(`${c.id} run ${run.run}: packet hash differs from the stored one`);
      if ((accepted?.outcome ?? 'no review') !== (rec.review?.outcome ?? 'no review')) problems.push(`${c.id} run ${run.run}: guard outcome differs from the stored one`);
      const v = withAdvice({ result: cr.outcome, reason: cr.reason, checks: cr.checks }, accepted ? [{ ...accepted, headSha: packet.pr.headSha }] : [], packet.pr.headSha);
      runs.push({ run: run.run, storedD: rec.D, D: v.result, reasonSame: v.reason === cr.reason, review: accepted?.outcome ?? 'no review', guard: accepted?.guard ?? null, advice: v.advice });
    }
  }
  const D = runs.length ? (runs.every((r) => r.D === cr.outcome) ? cr.outcome : 'differs') : cr.outcome;
  rows.push({ id: c.id, kind: TRUTH[c.id]?.kind ?? null, C: cr.outcome, storedD: s.D, D, runs });
}

const summary = {
  cases: rows.length,
  recordsDifferFromC: rows.filter((r) => r.D !== r.C || r.runs.some((x) => x.D !== r.C || !x.reasonSame)).length,
  storedDDifferFromC: rows.filter((r) => r.storedD !== r.C).map((r) => r.id),
  right: { C: rows.filter((r) => ok(r.id, r.C)).length, storedD: rows.filter((r) => ok(r.id, r.storedD)).length, D: rows.filter((r) => ok(r.id, r.D)).length },
  adviceItems: rows.reduce((k, r) => k + r.runs.reduce((j, x) => j + x.advice.length, 0), 0),
  problems,
};
const out = { rule: 'advice-only', source: LOG, summary, results: rows };
const dest = opt('--write')[0];
if (dest) writeFileSync(dest, `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
for (const r of rows) {
  if (!r.runs.length) continue;
  console.log(r.id, r.kind, `C ${r.C}`, `stored D ${r.storedD}`, `D ${r.D}`, r.runs.map((x) => `${x.review}/${x.guard ?? '-'}/advice ${x.advice.length}`).join(' '));
}
if (problems.length) process.exitCode = 1;
