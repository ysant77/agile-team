// The local observe -> diagnose -> repair -> verify harness (C3, 24 Nov 2026). One bounded agent
// with typed tools. It starts from the read-only discovery tools (src/discovery.js on the local
// investigated tree, bakeoff/tasks/discovery.js) and adds two tools:
// - run-check { test, on: "base" | "candidate" }: the harness runs pytest on that scratch copy,
//   for one test id that exists there, in the sandbox (bakeoff/repair/sandbox.mjs);
// - propose-patch { edits: [{ path, old, new }], reason }: search-and-replace edits (since 24 Nov;
//   before, a unified diff), checked and applied to a fresh copy of the base
//   (bakeoff/repair/patch.mjs, applyEdits). At most 3 patches; the last one that applied is the
//   candidate.
// The model never gives a command, never sees the hidden checks or the truth, and never changes
// the investigated tree. After the loop, the evaluator decides with checks the model did not see.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { listRepoFiles, readCiResults, readRepoFile, recordFinding, startInvestigation } from '../../src/discovery.js';
import { ollamaTools } from '../../src/tool-specs.js';
import { localGithub, pmPrompt } from '../tasks/discovery.js';
import { applyEdits, makeCopy } from './patch.mjs';
import { runPytest } from './sandbox.mjs';

export const LIMITS = { rounds: 30, checks: 8, patches: 3 };
const DISCOVERY_TOOLS = ['start-investigation', 'list-repo-files', 'read-repo-file', 'read-ci-results', 'record-finding'];

export const REPAIR_TOOL_SPECS = [
  { type: 'function', function: { name: 'run-check', description: 'Run one test of the bank with pytest and get its outcome. "on" is "base" (the investigated code) or "candidate" (the code with your last applied patch). The test must exist in that copy: an existing test, or an agent test that your patch added. You cannot run any other command.', parameters: { type: 'object', properties: { test: { type: 'string', description: 'A pytest id: tests/<file>.py or tests/<file>.py::<test name>' }, on: { type: 'string', enum: ['base', 'candidate'] } }, required: ['test', 'on'] } } },
  { type: 'function', function: { name: 'propose-patch', description: 'Propose a change as edits. Each edit names a file, the exact old text and the new text. The old text must occur exactly once in the file: copy it from read-repo-file without the line numbers, with enough lines to be unique. An empty old text creates a new file. You may change Python files under src/ and add new tests named tests/test_agent_<name>.py. The bank\'s own tests, scripts, CI and config cannot be changed. Each patch is applied to a fresh copy of the base code; all its edits apply or none; at most 3 patches.', parameters: { type: 'object', properties: { edits: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string', description: 'The exact text to replace; empty for a new file' }, new: { type: 'string', description: 'The text that replaces it' } }, required: ['path', 'old', 'new'] } }, reason: { type: 'string', description: 'Why this change fixes the reported problem' } }, required: ['edits', 'reason'] } } },
];

export const HARNESS_NOTE = 'You also have run-check and propose-patch. Investigate first. If the code breaks a stated rule, you may add a test tests/test_agent_<name>.py that shows it, run it on base, and propose a fix. If no rule is broken, say so and change nothing. A person decides on every change.';

const parse = (raw) => { if (raw && typeof raw === 'object') return raw; try { return JSON.parse(raw); } catch { return {}; } };

// ask(messages, format, tools) -> { ok, content, toolCalls, error } (bakeoff/ollama.js, or a script).
export async function runRepair(ask, kase, { tree, python, keep = false }) {
  if (!tree || !existsSync(tree)) throw new Error('tree must name the work tree of the investigated branch');
  if (!python || !existsSync(python)) throw new Error('python must name the Python of the bank environment');
  const work = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'repair-'));
  const base = makeCopy(tree, join(work, 'base'));
  let candidate = null;
  const store = new Map();
  const d = {
    store: {
      get: async (k) => structuredClone(store.get(k)),
      set: async (k, v, o) => { if (o?.keyPolicy === 'FAIL_IF_EXISTS' && store.has(k)) throw new Error('key exists'); store.set(k, structuredClone(v)); },
      delete: async (k) => { store.delete(k); },
    },
    get: localGithub(tree), now: () => Date.now(), appendAudit: async () => ({ seq: 0 }),
  };
  const by = 'repair-harness';
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: tree, encoding: 'utf8' }).trim();
  const counts = { checks: 0, patches: 0 };
  const patches = [];
  const tools = {
    'start-investigation': (a) => startInvestigation({ symptom: a.symptom, by, repo: 'local/investigated', ref: branch }, d),
    'list-repo-files': (a) => listRepoFiles({ investigationId: a.investigationId, by, prefix: a.prefix }, d),
    'read-repo-file': (a) => readRepoFile({ investigationId: a.investigationId, by, path: a.path, startLine: a.startLine }, d),
    'read-ci-results': (a) => readCiResults({ investigationId: a.investigationId, by }, d),
    'record-finding': (a) => recordFinding({ investigationId: a.investigationId, by, finding: a.finding }, d),
    'run-check': async (a) => {
      if (counts.checks >= LIMITS.checks) return { ok: false, error: `the check budget (${LIMITS.checks}) is used` };
      const copy = a.on === 'candidate' ? candidate : a.on === 'base' ? base : undefined;
      if (copy === undefined) return { ok: false, error: 'on must be "base" or "candidate"' };
      if (copy === null) return { ok: false, error: 'there is no candidate yet; propose a patch first' };
      const file = String(a.test ?? '').split('::')[0];
      if (!/^tests\/[A-Za-z0-9_/]+\.py$/.test(file) || !existsSync(join(copy, file))) return { ok: false, error: `${a.test} is not a test file of that copy` };
      counts.checks += 1;
      try {
        const r = runPytest({ copy, python, tests: [String(a.test)] });
        return { ok: true, on: a.on, test: a.test, outcome: r.outcome, summary: r.summary, tail: r.tail };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
    'propose-patch': async (a) => {
      if (counts.patches >= LIMITS.patches) return { ok: false, error: `the patch budget (${LIMITS.patches}) is used` };
      counts.patches += 1;
      const dir = join(work, `candidate-${counts.patches}`);
      makeCopy(tree, dir);
      const applied = applyEdits(dir, a.edits);
      const asked = Array.isArray(a.edits) ? a.edits.map((e) => ({ path: String(e?.path ?? ''), old: String(e?.old ?? '').slice(0, 4000), new: String(e?.new ?? '').slice(0, 8000) })) : a.edits;
      patches.push({ n: counts.patches, reason: String(a.reason ?? '').slice(0, 600), edits: asked, diff: applied.ok ? applied.diff.slice(0, 20_000) : null, applied: applied.ok, error: applied.ok ? null : applied.error });
      if (!applied.ok) { rmSync(dir, { recursive: true, force: true }); return applied; }
      candidate = dir;
      return { ok: true, candidate: counts.patches, files: applied.files };
    },
  };
  const names = [...DISCOVERY_TOOLS, 'run-check', 'propose-patch'];
  const specs = [...ollamaTools(DISCOVERY_TOOLS), ...REPAIR_TOOL_SPECS];
  const messages = [{ role: 'system', content: `${pmPrompt()}\n\n${HARNESS_NOTE}` }, { role: 'user', content: kase.symptom }];
  const trace = [];
  let finalText = '';
  let stop = 'rounds';
  for (let round = 0; round < LIMITS.rounds; round += 1) {
    const reply = await ask(messages, undefined, specs);
    if (!reply.ok) { stop = `model error: ${reply.error}`; break; }
    const calls = reply.toolCalls ?? [];
    if (!calls.length) { finalText = reply.content ?? ''; stop = 'final answer'; break; }
    messages.push({ role: 'assistant', content: reply.content ?? '', tool_calls: calls.map((f) => ({ function: f })) });
    for (const f of calls) {
      const args = parse(f.arguments);
      const result = tools[f.name] ? await tools[f.name](args) : { ok: false, error: `unknown tool ${f.name}; the tools are: ${names.join(', ')}` };
      trace.push({ round, tool: f.name, args: f.name === 'propose-patch' ? { reason: args.reason, edits: Array.isArray(args.edits) ? args.edits.length : null, editBytes: JSON.stringify(args.edits ?? '').length } : args, ok: result.ok === true,
        result: result.ok ? { outcome: result.outcome, summary: result.summary, findingId: result.findingId, kind: result.kind, files: result.files } : { error: String(result.error ?? '').slice(0, 400) } });
      messages.push({ role: 'tool', content: JSON.stringify(result) });
    }
  }
  const findings = [...store.entries()].filter(([k]) => k.startsWith('finding:')).map(([, v]) => v);
  const evaluation = evaluate(kase, { tree, base, candidate, python, patches });
  const out = {
    case: kase.id, label: kase.label, stop, rounds: trace.length ? trace.at(-1).round + 1 : 0, trace, patches,
    finding: findings.at(-1) ? { kind: findings.at(-1).kind, hypothesis: findings.at(-1).hypothesis, citations: findings.at(-1).citations, reproducer: findings.at(-1).reproducer } : null,
    finalText: finalText.slice(0, 2000), evaluation,
  };
  if (!keep) rmSync(work, { recursive: true, force: true });
  return out;
}

// The evaluator: checks that the model did not see. The hidden check must fail on base (so it
// tests the reported problem) and pass on the candidate; the protected tests must pass on the
// candidate; an agent test counts as a reproducer only if it fails on base and passes on the
// candidate. The decision on the change stays with a person.
export function evaluate(kase, { tree, base, candidate, python, patches }) {
  const hiddenSrc = kase.hidden ? new URL(`./hidden/${kase.hidden}`, import.meta.url).pathname : null;
  const hiddenName = 'tests/test_hidden_check.py';
  const withHidden = (copy) => { cpSync(hiddenSrc, join(copy, hiddenName)); return copy; };
  const out = { patchesProposed: patches.length, patchesApplied: patches.filter((p) => p.applied).length };
  if (hiddenSrc) {
    const scratch = makeCopy(tree, `${base}-eval`);
    out.hiddenOnBase = runPytest({ copy: withHidden(scratch), python, tests: [hiddenName] }).outcome;
    rmSync(scratch, { recursive: true, force: true });
  }
  if (!candidate) {
    out.verdict = kase.truth === 'none' ? 'no change (as a clean control should)' : 'no candidate patch';
    return out;
  }
  if (hiddenSrc) out.hiddenOnCandidate = runPytest({ copy: withHidden(candidate), python, tests: [hiddenName] }).outcome;
  out.protected = Object.fromEntries((kase.protected ?? []).map((t) => [t, runPytest({ copy: candidate, python, tests: [t] }).outcome]));
  const agentTests = execFileSync('find', ['tests', '-maxdepth', '1', '-name', 'test_agent_*.py'], { cwd: candidate, encoding: 'utf8' }).split('\n').filter(Boolean).map((p) => p.replace(/^\.\//, ''));
  out.agentTests = agentTests.map((t) => {
    const scratch = makeCopy(tree, `${base}-repro`);
    cpSync(join(candidate, t), join(scratch, t));
    const onBase = runPytest({ copy: scratch, python, tests: [t] }).outcome;
    rmSync(scratch, { recursive: true, force: true });
    const onCandidate = runPytest({ copy: candidate, python, tests: [t] }).outcome;
    return { test: t, onBase, onCandidate, reproduces: onBase === 'failed' && onCandidate === 'passed' };
  });
  const protectedOk = Object.values(out.protected).every((o) => o === 'passed');
  if (kase.truth === 'none') out.verdict = 'invented change on a clean control';
  else if (out.hiddenOnBase !== 'failed') out.verdict = 'hidden check does not fail on base: the case is not valid';
  else if (!protectedOk) out.verdict = 'regression: a protected test fails on the candidate';
  else if (out.hiddenOnCandidate === 'passed') out.verdict = 'repaired (hidden check and protected tests pass); a person decides';
  else out.verdict = 'not repaired: the hidden check still fails';
  return out;
}

export function loadRepairCases(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
