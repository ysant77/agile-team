// Discovery from symptoms (Mode B), bake-off task (benchmark/DISCOVERY-PROTOCOL.md). The model gets
// the deployed PM agent prompt, the user's symptom and the five discovery tools. The tools run the
// same rules as the Forge actions (src/discovery.js); GitHub is served from a local git work tree
// of the investigated branch, at its commit, with no network. Code scores each run.
//
//   DISCOVERY_CASES=<cases.json> DISCOVERY_TREE=<work tree> node bakeoff/run.js --roles discovery ...
//
// cases.json: [{ id, symptom, truth: "race" | "button" | "end_day" | "access" | "none" }]. The cases are written by a
// person other than the builder, after the build is frozen (protocol).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listRepoFiles, readCiResults, readRepoFile, recordFinding, startInvestigation } from '../../src/discovery.js';
import { ollamaTools } from '../../src/tool-specs.js';

export const DISCOVERY_TOOLS = ['start-investigation', 'list-repo-files', 'read-repo-file', 'read-ci-results', 'record-finding'];
const REPO = 'local/investigated';
const MAX_ROUNDS = 30;

// Fixed with the build, before the cases are seen (protocol). A defect counts as identified when
// the finding is a defect, its hypothesis matches the pattern, and it cites the faulty file.
export const TRUTH = {
  race: {
    file: 'src/bank/ledger.py',
    pattern: /race|concurren|same time|simultaneous|parallel|lost update|\block|atomic|outside the (write )?transaction|before the (write )?transaction|both (pass|succeed)|sleep/i,
  },
  button: {
    file: 'src/bank/web/app.css',
    pattern: /(display\s*:\s*none|hidden|hides|invisible|not (shown|visible|displayed)|media|max-width)[\s\S]*(send|button)|(send|button)[\s\S]*(display\s*:\s*none|hidden|hides|invisible|not (shown|visible|displayed)|media|max-width)/i,
  },
  // Set 2 (protocol 2), fixed with the set 2 build before the symptoms are written.
  end_day: {
    file: 'src/bank/ledger.py',
    pattern: /(end|last|final) (date|day)|upper bound|one day (short|early)|day after|\binclusive|\bexclusive|(exclud|omit|drop|miss|left out|leaves out)[\s\S]{0,80}\b(end|last)\b|\b(end|last)\b[\s\S]{0,80}(exclud|omit|drop|miss|left out|leaves out)/i,
  },
  access: {
    file: 'src/bank/api.py',
    pattern: /\bowner|\bowns\b|ownership|another customer|other customers?|any (signed-in )?(customer|account)|someone else|access check|authori[sz]|permission|OwnedAccount|customer_id[\s\S]{0,40}(not|never) (compared|checked|used)/i,
  },
  none: null,
};

export function loadDiscoveryCases(file) {
  if (!file) return [];
  const cases = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(cases)) throw new Error('the case file must be a list');
  for (const c of cases) {
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(String(c?.id ?? ''))) throw new Error('each case needs an id');
    if (typeof c.symptom !== 'string' || !c.symptom.trim()) throw new Error(`${c.id}: no symptom`);
    if (!(c.truth in TRUTH)) throw new Error(`${c.id}: truth must be one of ${Object.keys(TRUTH).join(', ')}`);
  }
  return cases;
}

const json = (status, body) => ({ ok: status < 300, status, json: async () => body, headers: { get: () => null } });

// The four GitHub calls of src/discovery.js, answered from the work tree's HEAD with git.
export function localGithub(tree) {
  const git = (...args) => execFileSync('git', args, { cwd: tree, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const head = git('rev-parse', 'HEAD').trim();
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  return async (path) => {
    let m = /^\/repos\/[^/]+\/[^/]+\/commits\/(.+)$/.exec(path);
    if (m) return decodeURIComponent(m[1]) === branch ? json(200, { sha: head }) : json(404, { message: 'Not Found' });
    m = /^\/repos\/[^/]+\/[^/]+\/git\/trees\/([0-9a-f]{40})\?recursive=1$/.exec(path);
    if (m) {
      if (m[1] !== head) return json(404, { message: 'Not Found' });
      const tree = git('ls-tree', '-r', '-l', '-z', head).split('\0').filter(Boolean).map((line) => {
        const [meta, file] = line.split('\t');
        const [, type, , size] = meta.split(/\s+/);
        return { path: file, type, size: Number(size) };
      });
      return json(200, { sha: head, truncated: false, tree });
    }
    m = /^\/repos\/[^/]+\/[^/]+\/contents\/(.+)\?ref=([0-9a-f]{40})$/.exec(path);
    if (m) {
      const file = m[1].split('/').map(decodeURIComponent).join('/');
      if (m[2] !== head) return json(404, { message: 'Not Found' });
      const entry = git('ls-tree', '-z', head, '--', file).split('\0').filter(Boolean)[0];
      if (!entry || entry.split('\t')[1] !== file) return json(404, { message: 'Not Found' });
      const [mode, type] = entry.split(/\s+/);
      if (mode === '120000') return json(200, { type: 'symlink', path: file, target: git('show', `${head}:${file}`) });
      if (type !== 'blob') return json(200, { type: 'dir', path: file });
      const bytes = execFileSync('git', ['show', `${head}:${file}`], { cwd: tree, maxBuffer: 64 * 1024 * 1024 });
      return json(200, { type: 'file', path: file, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') });
    }
    if (/^\/repos\/[^/]+\/[^/]+\/actions\/runs\?head_sha=[0-9a-f]{40}&per_page=20$/.test(path)) return json(200, { total_count: 0, workflow_runs: [] });
    return json(404, { message: 'Not Found' });
  };
}

// The PM agent prompt as deployed: the folded "prompt: >" block of pm-agent in manifest.yml.
export function pmPrompt(manifest = join(new URL('../..', import.meta.url).pathname, 'manifest.yml')) {
  const text = readFileSync(manifest, 'utf8');
  const block = text.split('    - key: pm-agent\n')[1].split('\n      prompt: >\n')[1];
  const lines = [];
  for (const line of block.split('\n')) {
    if (line.trim() && !line.startsWith('        ')) break;
    lines.push(line.slice(8));
  }
  // YAML folding: lines join with a space; an empty line is a paragraph break.
  return lines.join('\n').split(/\n\s*\n/).map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')).filter(Boolean).join('\n\n');
}

// Protocol 2: on a control, the final text is read too. A sentence claims a defect when it holds
// one of CLAIM_WORDS and none of NO_DEFECT_WORDS. The list is open: a claim in other words is
// missed (a stated limit).
export const CLAIM_WORDS = [
  'the defect is', 'a defect in', 'defect is in', 'the bug is', 'a bug in', 'bug is in', 'is a bug',
  'the fault is', 'fault is in', 'root cause', 'is broken', 'race condition', 'the issue is in',
  'the problem is in', 'is faulty',
];
export const NO_DEFECT_WORDS = [
  'no defect', 'not a defect', 'no bug', 'not a bug', 'no fault', 'by design', 'as designed',
  'as intended', 'expected behaviour', 'expected behavior',
];

export function claimsDefect(text) {
  const sentences = String(text ?? '').toLowerCase().replace(/[`*_]/g, '').split(/(?<=[.!?])\s+|\n+/);
  return sentences.some((s) => CLAIM_WORDS.some((w) => s.includes(w)) && !NO_DEFECT_WORDS.some((w) => s.includes(w)));
}

export const OTHER_SYMPTOM = 'finding answers a symptom the model wrote';

export function scoreDiscovery(kase, finding, finalText = '') {
  const truth = TRUTH[kase.truth];
  const isDefect = finding?.kind === 'defect';
  // The finding must answer the case's own symptom (lead rule 3, 19 Nov), even with one open
  // investigation per person.
  if (finding && kase.symptom !== undefined && finding.symptom !== undefined && finding.symptom !== kase.symptom) {
    return { score: 0, reason: OTHER_SYMPTOM, inventedDefect: !truth && isDefect, textClaim: truth ? undefined : claimsDefect(finalText), identified: truth ? false : null, rightFile: truth ? false : null };
  }
  if (!truth) {
    const textClaim = claimsDefect(finalText);
    const invented = isDefect || textClaim;
    return { score: invented ? 0 : 1, inventedDefect: invented, textClaim, identified: null, rightFile: null };
  }
  const identified = isDefect && truth.pattern.test(String(finding.hypothesis ?? ''));
  const rightFile = isDefect && (finding.citations ?? []).some((c) => c.file === truth.file);
  return { score: identified && rightFile ? 1 : 0, inventedDefect: false, identified, rightFile };
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

export async function runDiscovery(ask, kase, { tree = process.env.DISCOVERY_TREE } = {}) {
  if (!tree || !existsSync(tree)) throw new Error('DISCOVERY_TREE must name the work tree of the investigated branch');
  const store = new Map();
  const audit = [];
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: tree, encoding: 'utf8' }).trim();
  const d = {
    store: {
      get: async (k) => structuredClone(store.get(k)),
      set: async (k, v, opts) => {
        if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && store.has(k)) throw new Error('key exists');
        store.set(k, structuredClone(v));
      },
      delete: async (k) => { store.delete(k); },
    },
    get: localGithub(tree),
    now: () => Date.now(),
    appendAudit: async (e) => { audit.push(e); return { seq: audit.length - 1 }; },
  };
  const by = 'bakeoff-pm';
  const tools = {
    'start-investigation': (a) => startInvestigation({ symptom: a.symptom, by, repo: REPO, ref: branch }, d),
    'list-repo-files': (a) => listRepoFiles({ investigationId: a.investigationId, by, prefix: a.prefix }, d),
    'read-repo-file': (a) => readRepoFile({ investigationId: a.investigationId, by, path: a.path, startLine: a.startLine }, d),
    'read-ci-results': (a) => readCiResults({ investigationId: a.investigationId, by }, d),
    'record-finding': (a) => recordFinding({ investigationId: a.investigationId, by, finding: a.finding }, d),
  };
  const messages = [{ role: 'system', content: pmPrompt() }, { role: 'user', content: kase.symptom }];
  const calls = [];
  let finding = null;
  let finalText = '';
  for (let round = 0; round < MAX_ROUNDS && !finding; round += 1) {
    const reply = await ask(messages, undefined, ollamaTools(DISCOVERY_TOOLS));
    if (!reply.ok) return { task: kase.id, failed: reply.error, score: 0 };
    const toolCalls = reply.toolCalls ?? [];
    if (toolCalls.length === 0) {
      finalText = reply.content ?? '';
      break;
    }
    messages.push({ role: 'assistant', content: reply.content ?? '', tool_calls: toolCalls.map((f) => ({ function: f })) });
    for (const f of toolCalls) {
      const args = parseArgs(f.arguments);
      const run = tools[f.name];
      const result = run ? await run(args) : { ok: false, error: `unknown tool ${f.name}; the tools are: ${DISCOVERY_TOOLS.join(', ')}` };
      // The full arguments and the full refusal text, so a refusal can be read later (round 1 kept
      // neither).
      calls.push({ name: f.name, args, ok: result.ok === true, error: result.ok ? undefined : String(result.error ?? '') });
      if (f.name === 'record-finding' && result.ok) finding = await d.store.get(`finding:${result.findingId}`);
      messages.push({ role: 'tool', content: JSON.stringify(result) });
    }
  }
  const investigations = [...store.keys()].filter((k) => k.startsWith('inv-call:'));
  return {
    task: kase.id,
    truth: kase.truth,
    ...scoreDiscovery(kase, finding, finalText),
    finding: finding ? { symptom: finding.symptom, kind: finding.kind, hypothesis: finding.hypothesis, citations: finding.citations, reproducer: finding.reproducer, severity: finding.severity, priority: finding.priority, openQuestions: finding.openQuestions } : null,
    toolCalls: calls.length,
    refusedCalls: calls.filter((c) => !c.ok).length,
    githubCalls: investigations.length,
    recordAttempts: calls.filter((c) => c.name === 'record-finding').length,
    humanSteps: 0,
    calls,
    finalText: finalText.slice(0, 1200),
  };
}
