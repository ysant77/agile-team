// The live judge route (docs/FIRST-JUDGE-CLAIM.md) replayed locally: the five judge PRs of the
// cases repository (17 to 21) go through the panel's own actions and verifyClaim, with a stand-in
// Jira and app store. Account A saves and records the AC line, links the PR and (U12) signs off;
// account B claims "done". GitHub is a recording of the real answers (fixtures/judge-live/), made
// once by `node scripts/judge-live.mjs --capture` with read-only GET calls through the GitHub CLI.
// The replay makes no network call. It runs no Forge code and writes nothing to Jira.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { appendAudit, readAudit } from '../src/audit-store.js';
import { saveAcsAction } from '../src/ac-editor.js';
import { linkPrAction } from '../src/pr-link.js';
import { signOffAction, readLatestDone } from '../src/sign-off.js';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { verifyClaim } from '../src/verify-claim.js';

export const REPO = 'ysant77/yms-bank-demo-cases';
const API = 'https://api.github.com';
const ACCOUNT_A = 'judge-account-a';
const ACCOUNT_B = 'judge-account-b';

// The AC lines of docs/JUDGE-PATH.md ("The AC line of each case"), as a judge pastes them.
export const CASES = {
  U01: { key: 'BANK-10', type: 'Bug', pr: 17, labels: [], expect: ['supported'],
    ac: 'AC1 | for the id 9223372036854775808, (1) GET /api/accounts/{id} gives 404; (2) GET /api/accounts/{id}/statement gives 404; (3) POST /api/transfers with that value as from_account_id gives 404 and moves no money. | test_passes(test_a_huge_account_id_is_404)' },
  U04: { key: 'BANK-11', type: 'Bug', pr: 18, labels: [], expect: ['contradicted'],
    ac: 'AC1 | each of these forms finds the account YMS-0000-0003: (1) lower case, yms-0000-0003; (2) spaces at the start and the end; (3) spaces in place of the hyphens, YMS 0000 0003. | test_passes(test_transfer_accepts_a_typed_account_number)' },
  U20: { key: 'BANK-12', type: 'Bug', pr: 19, labels: [], expect: ['contradicted'],
    ac: 'AC1 | (1) ledger.account_number raises LedgerError for a sequence below 1 or above 99,999,999; (2) for each sequence from 1 to 99,999,999 the number is the same as before. | test_passes(test_account_number_refuses_a_sequence_out_of_range)' },
  U12: { key: 'BANK-13', type: 'Bug', pr: 20, labels: ['money_semantics'], expect: ['cannot_verify', 'supported'],
    ac: 'AC1 | an amount is accepted if each decimal after the decimals of the currency is zero ("1.0" in JPY is 1 minor unit; "1.2300" in EUR is 123 minor units; "10.000" in a transfer between two EUR accounts gives 201 and the amount "10.00"); an amount with a decimal that is not zero after the decimals of the currency is still refused. | test_passes(test_zero_decimals_are_accepted, test_non_zero_extra_decimals_are_still_refused, test_transfer_accepts_zero_decimals)' },
  T08: { key: 'BANK-14', type: 'Story', pr: 21, labels: [], expect: ['supported'],
    ac: 'AC1 | kind=credit returns only lines with a positive amount; kind=debit returns only lines with a negative amount; with no kind all lines are returned. | test_passes(test_statement_can_show_credits_only)' },
};

// A stand-in for Forge KVS with the FAIL_IF_EXISTS policy that the audit chain uses.
export function memoryStore() {
  const m = new Map();
  return {
    map: m,
    get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : undefined),
    set: async (k, v, opts) => {
      if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && m.has(k)) throw new Error(`key exists: ${k}`);
      m.set(k, structuredClone(v));
    },
    delete: async (k) => { m.delete(k); },
  };
}

// GitHub from a recording: each GET path gives the recorded status and body. A path that is not
// in the recording fails the replay, so a change in what the app reads is seen.
export function recordedFetch(recording, seen = []) {
  return async (url) => {
    const path = url.startsWith(API) ? url.slice(API.length) : url;
    seen.push(path);
    const r = recording[path];
    if (!r) throw new Error(`not recorded: ${path}`);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (h) => (String(h).toLowerCase() === 'x-ratelimit-remaining' ? '4999' : null) },
      json: async () => structuredClone(r.body),
    };
  };
}

// Records real answers: one read-only GET through the GitHub CLI for each path. The CLI keeps
// the credential; this code never reads it. Only the status and the body are kept.
function liveFetch(recording) {
  return async (url) => {
    const path = url.startsWith(API) ? url.slice(API.length) : url;
    const out = spawnSync('gh', ['api', '--method', 'GET', '-i', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const text = out.stdout ?? '';
    const split = text.search(/\r?\n\r?\n/);
    const head = split >= 0 ? text.slice(0, split) : text;
    const bodyText = split >= 0 ? text.slice(split).trim() : '';
    const status = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(head)?.[1] ?? 0);
    if (!status) throw new Error(`no answer for ${path}`);
    let body = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = bodyText; }
    recording[path] = { status, body };
    return {
      ok: status >= 200 && status < 300, status,
      headers: { get: () => null },
      json: async () => structuredClone(body),
    };
  };
}

// One case through the panel actions and verifyClaim. Returns the verdicts in order and the
// GitHub paths read.
export async function runCase(id, fetchFn, { claimant = ACCOUNT_B } = {}) {
  const c = CASES[id];
  const store = memoryStore();
  const audit = (e) => appendAudit(e, store);
  const readA = (from, n) => readAudit(from, n, store);
  const props = { 'aat.ticket': null, 'aat.signoff': null, verdicts: [] };
  const ticket = () => ({
    key: c.key, type: c.type, labels: c.labels, fields: {}, status: 'In Progress', subtasks: [], links: [],
    acceptanceCriteria: props['aat.ticket']?.acceptanceCriteria ?? [], preRegistered: undefined, domain: undefined,
    signoff: props['aat.signoff'], approvedTestRemovals: [],
  });
  const panel = {
    canEdit: async () => true,
    readSpec: async () => props['aat.ticket'],
    writeSpec: async (_k, spec) => { props['aat.ticket'] = spec; return { ok: true, status: 200 }; },
    readAcs: async () => ticket().acceptanceCriteria,
    appendAudit: audit,
    store,
  };
  const step = (name, r) => { if (!r?.ok) throw new Error(`${id} ${name}: ${r?.error}`); return r; };
  step('save ACs', await saveAcsAction({ key: c.key, accountId: ACCOUNT_A, payload: { text: c.ac } }, panel));
  const readPr = async (n) => {
    const r = await fetchFn(`${API}/repos/${REPO}/pulls/${n}`);
    if (!r.ok) return null;
    const pr = await r.json();
    return { number: pr.number, headRepo: pr.head?.repo?.full_name ?? null };
  };
  step('link PR', await linkPrAction({ key: c.key, accountId: ACCOUNT_A, payload: { pr: String(c.pr), reason: 'judge PR of the case' } },
    { ...panel, repo: REPO, readPr }));
  const seen = [];
  const deps = {
    collectJira: async () => ticket(),
    collectGithub: (args) => collectGithub({ ...args, sleep: async () => {} }),
    collectPrStats,
    collectReviews: async () => [],
    addVerdictProperty: async (_k, rec) => { props.verdicts.push(rec); },
    appendAudit: audit,
    readAudit: readA,
    addComment: async () => ({ ok: true }),
    findComment: async () => null,
    fetchFn: async (u, o) => { seen.push(u.slice(API.length)); return fetchFn(u, o); },
    store,
    releaseClaim: async () => {},
    env: () => ({ repo: REPO, token: 'replay' }),
  };
  const verdicts = [];
  const claim = async (n) => {
    const log = console.log;
    console.log = () => {};
    try {
      verdicts.push(await verifyClaim({ issueKey: c.key, claim: { id: `${c.key}:${n}`, type: 'done', text: 'done', by: claimant } }, deps));
    } finally {
      console.log = log;
    }
  };
  await claim(1);
  if (id === 'U12') {
    step('sign-off', await signOffAction({ key: c.key, accountId: ACCOUNT_A, payload: { reason: 'the money rule of the change is right' } }, {
      canEdit: async () => true,
      readLatestDone: (k) => readLatestDone(k, { store, readAudit: readA }),
      appendAudit: audit,
      writeSignoff: async (_k, s) => { props['aat.signoff'] = s; return { ok: true, status: 200 }; },
    }));
    await claim(2);
  }
  return { verdicts, records: props.verdicts, paths: [...new Set(seen)] };
}

// What is kept of an answer: no email, no node id, no GitHub App record, and no API URL field that the app does not
// read (html_url and url stay). It keeps the recording small and free of personal data.
export function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === '_links' || k === 'performed_via_github_app' || k === 'node_id' || k === 'gravatar_id' || (k.endsWith('_url') && k !== 'html_url')) continue;
    out[k] = k === 'email' && typeof x === 'string' ? 'redacted@example.invalid' : scrub(x);
  }
  return out;
}

export const fixturePath = (id) => new URL(`../fixtures/judge-live/${id}.json`, import.meta.url);

if (process.argv[2] === '--capture') {
  mkdirSync(new URL('../fixtures/judge-live/', import.meta.url), { recursive: true });
  for (const id of process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(CASES)) {
    const recording = {};
    const { verdicts } = await runCase(id, liveFetch(recording));
    const sorted = Object.fromEntries(Object.keys(recording).sort().map((k) => [k, { status: recording[k].status, body: scrub(recording[k].body) }]));
    writeFileSync(fixturePath(id), `${JSON.stringify({ repo: REPO, case: id, capturedAt: new Date().toISOString(), responses: sorted }, null, 1)}\n`);
    const statuses = Object.values(recording).map((r) => r.status);
    console.log(id, verdicts.map((v) => `${v.result}: ${v.reason}`).join(' | '), `paths ${statuses.length}`, `non-2xx ${statuses.filter((s) => s >= 300).join(',') || 'none'}`);
  }
} else if (process.argv[2] === '--replay') {
  for (const id of Object.keys(CASES)) {
    const { responses } = JSON.parse(readFileSync(fixturePath(id), 'utf8'));
    const { verdicts } = await runCase(id, recordedFetch(responses));
    console.log(id, verdicts.map((v) => `${v.result}: ${v.reason}`).join(' | '));
  }
}
