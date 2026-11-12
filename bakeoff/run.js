// Role bake-off runner (DESIGN.md section 9e). One model loaded at a time; tasks are batched by
// model so each loads once. Results go to bakeoff/results/<run>.jsonl and a hash-chained log.
//
//   node bakeoff/run.js --models qwen3:4b,gemma4:26b --roles lead,pm [--tasks L01,S01] [--run name]

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextEvent } from '../src/audit.js';
import { OPINION_PROMPT_VERSION } from '../src/opinion.js';
import { chat, digest, loaded, parseJson, unload } from './ollama.js';
import { DISPUTES, runLead } from './tasks/lead.js';
import { BUGS, DS_TASKS, runDev, runDs, runQa } from './tasks/code.js';
import { REQUESTS, runPm } from './tasks/pm.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROLES = {
  lead: { tasks: DISPUTES, id: (t) => t.id, run: runLead },
  pm: { tasks: REQUESTS, id: (t) => t[0], run: runPm },
  dev: { tasks: BUGS, id: (t) => t.id, run: runDev },
  qa: { tasks: BUGS, id: (t) => t.id, run: runQa },
  ds: { tasks: DS_TASKS, id: (t) => t.id, run: runDs },
};

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GB = 1024 ** 3;

// Another session also uses Ollama on this Mac. Wait while a large model that is not ours is loaded.
async function waitForRoom(model, log, maxWaitMin = 120) {
  for (let i = 0; i < maxWaitMin; i += 1) {
    const others = (await loaded()).filter((m) => m.name !== model && m.sizeBytes > 8 * GB);
    if (others.length === 0) return true;
    if (i === 0) log(`waiting: ${others.map((m) => m.name).join(', ')} loaded by another user`);
    await sleep(60_000);
  }
  return false;
}

export async function main(argv = process.argv.slice(2)) {
  const a = args(argv);
  const models = (a.models ?? '').split(',').filter(Boolean);
  const roles = (a.roles ?? 'lead,pm').split(',').filter(Boolean);
  const only = a.tasks ? new Set(a.tasks.split(',')) : null;
  const run = a.run ?? new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(HERE, 'results');
  mkdirSync(dir, { recursive: true });
  const resultsFile = join(dir, `${run}.jsonl`);
  const chainFile = join(dir, `${run}.chain.jsonl`);
  let prev = null;
  const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  const record = (event, data) => {
    prev = nextEvent(prev, { actor: 'bakeoff', event, data, at: new Date().toISOString() });
    appendFileSync(chainFile, `${JSON.stringify(prev)}\n`);
  };

  for (const model of models) {
    if (!(await waitForRoom(model, log))) {
      log(`skip ${model}: no room after waiting`);
      record('skipped', { model });
      continue;
    }
    const modelDigest = await digest(model);
    if (!modelDigest) {
      log(`skip ${model}: not installed`);
      continue;
    }
    record('model_start', { model, digest: modelDigest });
    let peakVram = 0;
    for (const roleName of roles) {
      const role = ROLES[roleName];
      for (const task of role.tasks.filter((t) => !only || only.has(role.id(t)))) {
        const calls = [];
        const ask = async (messages, format) => {
          const reply = await chat({ model, messages, format });
          const parsed = reply.ok ? parseJson(reply.content) : { ok: false };
          calls.push({ ok: reply.ok, error: reply.error, tokens: reply.outputTokens, tps: reply.tokensPerS, wallS: reply.wallS, validJson: parsed.ok, repaired: !!parsed.repaired });
          const ps = (await loaded().catch(() => [])).find((m) => m.name === model);
          if (ps) peakVram = Math.max(peakVram, ps.vramBytes ?? ps.sizeBytes ?? 0);
          return { ...reply, parsed: parsed.ok ? parsed.value : null, calls };
        };
        const started = Date.now();
        let result;
        try {
          result = await role.run(ask, task, { model, digest: modelDigest, promptVersion: OPINION_PROMPT_VERSION });
        } catch (error) {
          result = { task: role.id(task), failed: String(error.message ?? error), score: 0 };
        }
        const row = {
          run, model, digest: modelDigest, role: roleName, ...result,
          wallS: (Date.now() - started) / 1000,
          calls: calls.length,
          validJsonRate: calls.length ? calls.filter((c) => c.validJson).length / calls.length : 0,
          tokensPerS: calls.filter((c) => c.tps).reduce((s, c, _, all) => s + c.tps / all.length, 0) || null,
          timeouts: calls.filter((c) => c.error === 'timeout').length,
        };
        appendFileSync(resultsFile, `${JSON.stringify(row)}\n`);
        record('task_done', { model, role: roleName, task: row.task, score: row.score });
        log(`${model} ${roleName} ${row.task}: score ${row.score}${row.failed ? ` (${row.failed})` : ''} in ${row.wallS.toFixed(0)} s`);
      }
    }
    record('model_end', { model, peakVramGB: +(peakVram / GB).toFixed(1) });
    writeFileSync(join(dir, `${run}.mem.${model.replace(/[:/]/g, '_')}.json`), JSON.stringify({ model, peakVramGB: +(peakVram / GB).toFixed(1) }));
    await unload(model).catch(() => {});
    log(`${model}: unloaded`);
  }
  log(`results: ${resultsFile}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
