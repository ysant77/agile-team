// Runs the repair harness (bakeoff/repair/task.mjs) for one case.
//
//   node bakeoff/repair/run.mjs --case D2-1 --symptoms <case file of the lead> --tree <investigated
//     work tree> --python <bank environment python> --out <dir> (--model <name> --seed <n> | --scripted <steps.json>)
//
// The symptom is read from the lead's case file exactly as stored and given to the model
// unchanged. --scripted replays fixed tool calls instead of a model: it tests the harness, and
// its result is labelled "scripted", never "agent".

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chat } from '../ollama.js';
import { loadRepairCases, runRepair } from './task.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const kase = loadRepairCases(new URL('./cases-dev.json', import.meta.url)).find((c) => c.id === opt('--case'));
if (!kase) throw new Error('unknown --case');
const stored = JSON.parse(readFileSync(opt('--symptoms'), 'utf8')).find((c) => c.id === kase.id);
if (!stored?.symptom) throw new Error(`no symptom for ${kase.id} in the case file`);
kase.symptom = stored.symptom;

let ask;
let mode;
if (opt('--scripted')) {
  const steps = JSON.parse(readFileSync(opt('--scripted'), 'utf8'));
  let i = 0;
  mode = { kind: 'scripted', file: opt('--scripted') };
  ask = async () => (i < steps.length ? { ok: true, content: '', toolCalls: steps[i++] } : { ok: true, content: 'scripted run ends', toolCalls: [] });
} else {
  const model = opt('--model');
  const seed = Number(opt('--seed') ?? 11);
  mode = { kind: 'agent', model, seed, temperature: 0.6, numCtx: 16_384 };
  ask = (messages, format, tools) => chat({ model, messages, format, tools, settings: { temperature: 0.6, seed, numCtx: 16_384 } });
}
const started = new Date().toISOString();
const result = await runRepair(ask, kase, { tree: opt('--tree'), python: opt('--python') });
const out = opt('--out');
mkdirSync(out, { recursive: true });
const file = join(out, `${kase.id}-${mode.kind}-${mode.seed ?? 'x'}-${Date.now()}.json`);
writeFileSync(file, `${JSON.stringify({ started, ended: new Date().toISOString(), mode, ...result }, null, 1)}\n`);
console.log(file, '|', result.stop, '|', result.evaluation.verdict);
