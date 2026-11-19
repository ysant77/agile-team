// Role bake-off runner (DESIGN.md section 9e). One model loaded at a time; tasks are batched by
// model so each loads once. Results go to bakeoff/results/<run>.jsonl and a hash-chained log.
//
//   node bakeoff/run.js [--models a,b] [--roles lead,pm] [--tasks L01,S01] [--run name] [--repeats 0,1,2,3]
// Models default to the candidates with status "run" in config/models.json, and the run name to its
// currentRun. Repeat 0 is the deploy setting; repeats 1..n use the repeat seeds (DESIGN 9k).
// With --resume yes, tasks that already have a row in the run's results file are skipped.
// --format none runs without the JSON schema (structured-output arm); --think on|off|low|high
// overrides the reasoning setting (reasoning arm). Both are recorded per row (DESIGN 9k arms).
// --redo model|role|task[,...] runs those rows again (a harness fault, named in the log); the
// report keeps the last row per task.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextEvent } from '../src/audit.js';
import { GUARD_VERSION, OPINION_PROMPT_VERSION } from '../src/opinion.js';
import { LINT_VERSION } from '../src/lint.js';
import { candidates, chatSettings, loadConfig } from './models.js';
import { chat, digest, loaded, parseJson, unload } from './ollama.js';
import { DISPUTES, runLead } from './tasks/lead.js';
import { BUGS, DS_TASKS, runDev, runDs, runQa } from './tasks/code.js';
import { REQUESTS, runPm } from './tasks/pm.js';
import { PROBES, runTools } from './tasks/tools.js';
import { loadDiscoveryCases, runDiscovery } from './tasks/discovery.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROLES = {
  lead: { tasks: DISPUTES, id: (t) => t.id, run: runLead },
  pm: { tasks: REQUESTS, id: (t) => t[0], run: runPm },
  dev: { tasks: BUGS, id: (t) => t.id, run: runDev },
  qa: { tasks: BUGS, id: (t) => t.id, run: runQa },
  ds: { tasks: DS_TASKS, id: (t) => t.id, run: runDs },
  tools: { tasks: PROBES, id: (t) => t.id, run: runTools },
  // Mode B (benchmark/DISCOVERY-PROTOCOL.md): cases from DISCOVERY_CASES, branch from DISCOVERY_TREE.
  discovery: { tasks: loadDiscoveryCases(process.env.DISCOVERY_CASES), id: (t) => t.id, run: runDiscovery },
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

// The harness commit, so a result can be traced to the exact tasks and scorers that produced it.
function harnessCommit() {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: HERE, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', '.', '../src'], { cwd: HERE, encoding: 'utf8' }).trim();
    return dirty ? `${head}+dirty` : head;
  } catch {
    return null;
  }
}

export const rowKey = (r) => `${r.model}|${r.role}|${r.task}|${r.repeat ?? 0}`;

export async function main(argv = process.argv.slice(2)) {
  const a = args(argv);
  const config = loadConfig(a.config);
  const models = a.models ? a.models.split(',').filter(Boolean) : candidates(config, ['run']);
  const roles = (a.roles ?? 'lead,pm,dev,qa,ds').split(',').filter(Boolean);
  const unknown = roles.filter((r) => !ROLES[r]);
  if (unknown.length) throw new Error(`unknown roles: ${unknown.join(', ')}`);
  const repeats = (a.repeats ?? '0').split(',').map(Number);
  const only = a.tasks ? new Set(a.tasks.split(',')) : null;
  const run = a.run ?? config.currentRun;
  const dir = join(HERE, 'results');
  mkdirSync(dir, { recursive: true });
  const resultsFile = join(dir, `${run}.jsonl`);
  const chainFile = join(dir, `${run}.chain.jsonl`);
  let prev = null;
  const done = new Set();
  if (a.resume === 'yes' && existsSync(resultsFile)) {
    for (const line of readFileSync(resultsFile, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line);
      // A row that failed in transport (the harness, not the model) is run again.
      if (/fetch failed|^timeout$|HTTP 5\d\d/.test(r.failed ?? '')) continue;
      done.add(rowKey(r));
    }
    for (const key of (a.redo ?? '').split(',').filter(Boolean)) done.delete(key.split('|').length === 3 ? `${key}|0` : key);
    if (existsSync(chainFile)) {
      const lines = readFileSync(chainFile, 'utf8').split('\n').filter(Boolean);
      prev = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
    }
  }
  const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  const record = (event, data) => {
    prev = nextEvent(prev, { actor: 'bakeoff', event, data, at: new Date().toISOString() });
    appendFileSync(chainFile, `${JSON.stringify(prev)}\n`);
  };

  for (const model of models) {
    const todo = (roleName, repeat) => ROLES[roleName].tasks.filter((t) => (!only || only.has(ROLES[roleName].id(t)))
      && !done.has(rowKey({ model, role: roleName, task: ROLES[roleName].id(t), repeat })));
    const pending = repeats.flatMap((rep) => roles.flatMap((r) => todo(r, rep)));
    if (pending.length === 0) {
      log(`${model}: nothing left to run`);
      continue;
    }
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
    record('model_start', { model, digest: modelDigest, harness: harnessCommit(), config: config.hash, repeats, guardVersion: GUARD_VERSION, lintVersion: LINT_VERSION });
    let peakVram = 0;
    for (const repeat of repeats) for (const roleName of roles) {
      const role = ROLES[roleName];
      const base = chatSettings(config, model, repeat);
      const thinkArg = a.think === undefined ? undefined : ({ on: true, off: false }[a.think] ?? a.think);
      const settings = thinkArg === undefined ? base : { ...base, think: thinkArg };
      const outputMode = a.format === 'none' ? 'free' : 'schema';
      for (const task of todo(roleName, repeat)) {
        const calls = [];
        const ask = async (messages, format, tools) => {
          const reply = await chat({ model, messages, format: outputMode === 'free' ? undefined : format, tools, settings });
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
          run, model, digest: modelDigest, role: roleName, taskSet: task.set ?? 1, outputMode, think: settings.think, guardVersion: roleName === 'lead' ? GUARD_VERSION : undefined, lintVersion: roleName === 'pm' ? LINT_VERSION : undefined, repeat, seed: settings.seed, temperature: settings.temperature, ...result,
          wallS: (Date.now() - started) / 1000,
          calls: calls.length,
          validJsonRate: calls.length ? calls.filter((c) => c.validJson).length / calls.length : 0,
          tokensPerS: calls.filter((c) => c.tps).reduce((s, c, _, all) => s + c.tps / all.length, 0) || null,
          timeouts: calls.filter((c) => c.error === 'timeout').length,
        };
        appendFileSync(resultsFile, `${JSON.stringify(row)}\n`);
        record('task_done', { model, role: roleName, task: row.task, repeat, score: row.score });
        log(`${model} ${roleName} ${row.task}${repeat ? ` r${repeat}` : ''}: score ${row.score}${row.failed ? ` (${row.failed})` : ''} in ${row.wallS.toFixed(0)} s`);
      }
    }
    record('model_end', { model, peakVramGB: +(peakVram / GB).toFixed(1) });
    // A resumed model keeps the highest peak seen in any part of the run.
    const memFile = join(dir, `${run}.mem.${model.replace(/[:/]/g, '_')}.json`);
    const before = existsSync(memFile) ? JSON.parse(readFileSync(memFile, 'utf8')).peakVramGB ?? 0 : 0;
    writeFileSync(memFile, JSON.stringify({ model, peakVramGB: Math.max(before, +(peakVram / GB).toFixed(1)) }));
    await unload(model).catch(() => {});
    log(`${model}: unloaded`);
  }
  log(`results: ${resultsFile}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
