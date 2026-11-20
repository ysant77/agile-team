// Arm D on set 2: C plus the Code Reviewer agent, under ARM-D-PROTOCOL.md. No network call except
// the local Ollama server.
//
//   node arm_d.mjs --rev <agile-team checkout on feat/code-reviewer-agent> --out <evidence dir> \
//     --manifest m.json --results <results-2.json> --truth truth-2.json --runs 3 --log <dir>
//
// For each case where C is `supported`, the agent gets the reviewer prompt (manifest.yml,
// reviewer-agent) and two tools. get-pr-diff returns the app's packet for the case
// (buildReviewPacket + packetForAgent). record-review runs the app's guards and gate
// (applyReviewGuards + reviewGate, one retry). Owner decision 20 Nov: the review is advice only.
// D is always C's outcome; the accepted findings are stored as advice, not counted. Until 20 Nov
// a rating-rule option turned D into `cannot_verify` on a finding; it is removed, so no option can
// make the reviewer change an outcome.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkToolCall, fetchWithTimeout } from './dispatch.mjs';

const args = process.argv.slice(2);
const opt = (name) => args.filter((_, i) => args[i - 1] === name);
const REV = resolve(opt('--rev')[0]);
const OUT = resolve(opt('--out')[0]);
const LOG = resolve(opt('--log')[0]);
const RUNS = Number(opt('--runs')[0] ?? 3);
const ONLY = new Set((opt('--only')[0] ?? '').split(',').filter(Boolean));
const manifest = opt('--manifest').flatMap((m) => JSON.parse(readFileSync(m, 'utf8')));
const cResults = JSON.parse(readFileSync(opt('--results')[0], 'utf8'));
const TRUTH = JSON.parse(readFileSync(opt('--truth')[0], 'utf8'));
const imp = (p) => import(pathToFileURL(join(REV, p)).href);
const { buildReviewPacket, applyReviewGuards, reviewGate, reviewSuggested, REVIEW_PROMPT_VERSION } = await imp('src/review.js');
const { withAdvice } = await imp('src/review-advice.js');
const { packetForAgent } = await imp('src/review-actions.js');
const { TOOL_SPECS } = await imp('src/tool-specs.js');
// Time limit of one model server call (--timeout-s, default 600 s).
const TIMEOUT_MS = 1000 * Number(opt('--timeout-s')[0] ?? 600);

const MODEL = 'qwen3-coder:30b';
const OLLAMA = 'http://localhost:11434';
const OPTIONS = { temperature: 0, num_ctx: 32768 };
const MAX_TURNS = 8;

// The reviewer prompt, read from the manifest (the folded YAML block of reviewer-agent).
function reviewerPrompt() {
  const lines = readFileSync(join(REV, 'manifest.yml'), 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trim() === '- key: reviewer-agent');
  const p = lines.findIndex((l, i) => i > start && l.trim() === 'prompt: >');
  const indent = lines[p + 1].match(/^ */)[0].length;
  const body = [];
  for (let i = p + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() && l.match(/^ */)[0].length < indent) break;
    body.push(l.slice(indent));
  }
  // YAML ">" folding: lines join with a space; an empty line is a paragraph break.
  return body.join('\n').trim().split(/\n\s*\n/).map((para) => para.split('\n').join(' ')).join('\n');
}
const PROMPT = reviewerPrompt();

const TOOLS = [
  { type: 'function', function: { name: 'get-pr-diff', description: 'Read the patch hunks, ACs and verdict for one issue and pull request.',
    parameters: { type: 'object', properties: { issueKey: { type: 'string' }, prNumber: { type: 'integer' } }, required: ['issueKey', 'prNumber'] } } },
  { type: 'function', function: { name: 'record-review', description: 'Record one review as a JSON object with findings, risks and proposedChecks.',
    parameters: { type: 'object', properties: { issueKey: { type: 'string' }, prNumber: { type: 'integer' }, review: { type: 'string', description: 'the review JSON object as a string' } }, required: ['issueKey', 'prNumber', 'review'] } } },
  { type: 'function', function: { name: 'get-verdicts', description: 'Read the stored verdicts of an issue.',
    parameters: { type: 'object', properties: { issueKey: { type: 'string' } }, required: ['issueKey'] } } },
];

const TOOL_NAMES = TOOLS.map((t) => t.function.name);

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

function packetFor(c, n, cResult) {
  const dir = join(OUT, c.branches[0].replaceAll('/', '_'));
  const meta = readJson(join(dir, 'meta.json'));
  const report = readJson(join(dir, 'report.json'));
  // The case manifest names the AC text `text`; the app's ticket spec names it `statement`.
  const ticket = { ...c.ticket, acceptanceCriteria: (c.ticket.acceptanceCriteria ?? []).map((a) => ({ ...a, statement: a.statement ?? a.text ?? '' })) };
  const verdict = { result: cResult.outcome, reason: cResult.reason };
  const packet = buildReviewPacket({
    ticket, pr: { number: 101 + n, headSha: meta.pr_head ?? meta.head }, files: meta.files, filesTruncated: false,
    reportTests: (report?.tests ?? []).map((t) => t.id), verdict, trigger: 'request',
  });
  return { packet, agentView: packetForAgent(packet, reviewSuggested(verdict, ticket)) };
}

async function chat(messages, seed) {
  const r = await fetchWithTimeout(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, stream: false, options: { ...OPTIONS, seed } }) }, TIMEOUT_MS);
  if (!r.ok) throw new Error(`ollama ${r.status}: ${await r.text()}`);
  return (await r.json()).message;
}

async function runCase(c, n, cResult, seed) {
  const { packet, agentView } = packetFor(c, n, cResult);
  const prNumber = packet.pr.number;
  const messages = [{ role: 'system', content: PROMPT }, { role: 'user', content: `Review pull request ${prNumber} on ${c.ticket.key}` }];
  const trace = [];
  let retries = 0;
  let accepted = null;
  for (let turn = 0; turn < MAX_TURNS && !accepted; turn++) {
    const msg = await chat(messages, seed);
    messages.push(msg);
    const calls = msg.tool_calls ?? [];
    trace.push({ turn, content: msg.content ?? '', calls: calls.map((x) => ({ name: x.function?.name, arguments: x.function?.arguments })) });
    if (!calls.length) break;
    for (const call of calls) {
      const name = call.function?.name;
      const a = call.function?.arguments ?? {};
      let result;
      // The model's call is untrusted: check the name and the arguments against the tool spec.
      const checked = checkToolCall(TOOL_SPECS, TOOL_NAMES, name, call.function?.arguments);
      if (!checked.ok) {
        result = { ok: false, error: checked.error };
        trace.push({ turn, refusedCall: name ?? null, error: checked.error });
      } else if (name === 'get-pr-diff') result = agentView;
      else if (name === 'get-verdicts') result = { ok: true, verdicts: [packet.verdict] };
      else if (name === 'record-review') {
        const raw = typeof a.review === 'string' ? a.review : JSON.stringify(a.review ?? '');
        const guarded = applyReviewGuards(raw, packet, { model: MODEL, promptVersion: REVIEW_PROMPT_VERSION });
        const gate = reviewGate(guarded, retries);
        trace.push({ turn, guard: guarded.outcome, guardName: guarded.guard, reasons: guarded.reasons, gate: gate.action });
        if (gate.action === 'retry') {
          retries += 1;
          result = { ok: false, error: gate.message };
        } else {
          accepted = gate.record;
          result = { ok: true, outcome: accepted.outcome };
        }
      } else result = { ok: false, error: `unknown action ${name}` };
      messages.push({ role: 'tool', content: JSON.stringify(result), tool_name: name });
    }
  }
  // The app's own path: the advice is attached, the outcome is not touched.
  const headSha = packet.pr.headSha ?? 'no-head';
  const { advice } = withAdvice({ result: cResult.outcome, reason: cResult.reason }, accepted ? [{ ...accepted, headSha }] : [], headSha);
  return {
    D: cResult.outcome,
    advice,
    review: accepted ? { outcome: accepted.outcome, guard: accepted.guard, style: accepted.style ?? null, review: accepted.review } : null,
    inputHash: accepted?.inputHash ?? null,
    trace,
  };
}

if (args.includes('--dry')) {
  // Show the prompt and each packet size; no model call.
  console.log(PROMPT);
  for (const [n, c] of manifest.entries()) {
    const cr = cResults.find((r) => r.id === c.id)?.C;
    if (cr?.outcome !== 'supported') continue;
    const { packet, agentView } = packetFor(c, n, cr);
    console.log(c.id, 'hunks', packet.hunks.length, 'noPatch', packet.noPatch.length, 'chars', JSON.stringify(agentView).length, 'acs', packet.ticket.acs.map((a) => a.statement.slice(0, 40)).join(' / '));
  }
  process.exit(0);
}
mkdirSync(LOG, { recursive: true });
const out = [];
for (const [n, c] of manifest.entries()) {
  if (ONLY.size && !ONLY.has(c.id)) continue;
  const cr = cResults.find((r) => r.id === c.id)?.C;
  if (!cr) continue;
  if (cr.outcome !== 'supported') {
    out.push({ id: c.id, C: cr.outcome, runs: [], D: cr.outcome, note: 'C is not supported; D does not run' });
    continue;
  }
  const runs = [];
  for (let k = 1; k <= RUNS; k++) {
    const r = await runCase(c, n, cr, k);
    writeFileSync(join(LOG, `${c.id}-run${k}.json`), `${JSON.stringify(r, null, 1)}\n`);
    runs.push({ run: k, seed: k, D: r.D, review: r.review?.outcome ?? 'no review', guard: r.review?.guard ?? null,
      findings: (r.review?.review?.findings ?? []).map((f) => `${f.severity ? `[${f.severity}${f.ac ? ` ${f.ac}` : ''}] ` : ''}${f.hunk} ${f.file}:${f.line}: ${f.text}`) });
    console.log(c.id, `run ${k}`, r.D, r.review?.outcome ?? 'no review', r.review?.guard ?? '', `advice ${r.advice.length}`);
  }
  // Every run gives C's outcome; the runs differ only in the advice they show.
  out.push({ id: c.id, C: cr.outcome, D: cr.outcome, correct: TRUTH[c.id]?.correct ?? null, runs });
}
writeFileSync(join(LOG, 'arm-d.json'), `${JSON.stringify({ model: MODEL, options: OPTIONS, promptVersion: REVIEW_PROMPT_VERSION, rule: 'advice-only', results: out }, null, 1)}\n`);
