// Verdict view (issue panel): what was proved, what was not checked, why, and what a person must
// decide. Pure functions; the panel resolver reads the stored verdicts and passes them in. Code sets
// the verdict; this module only explains it and never changes it. A model review is shown apart,
// as advice that is not counted (owner decision 20 Nov, src/review-advice.js).

import { ADVICE_HEADING, ADVICE_NOTE, adviceLine } from './review-advice.js';

// Blind set 4 lesson (benchmark/RESULTS-4.md): "supported" means that the named test fails before
// the change and passes after it, on this criterion. It does not show that the test covers every
// case of the criterion. Set 4 has 24 cases, 11 of them invalid; C supported 8 of the 11 in this
// way. The view says so on every verdict, not only on supported ones.
export const SUPPORTED_MEANS =
  'Supported means: for each criterion, the named test fails before the change and passes after it, on the head commit.';
export const NOT_CHECKED_COVERAGE = 'Not checked: whether the test covers every case of the criterion.';

// What the code checks never read, on any verdict (C2.3, 24 Nov 2026). Set 6 supported a change with
// an unasserted side effect (W10) and one whose test asserted only part of the criterion (W18).
export const NEVER_CHECKED = [
  'Whether the tests cover every case of the criterion (a test may assert only part of it).',
  'The text of the acceptance criteria: only the named tests and the mechanical checks are run.',
  'A side effect that no test asserts (for example a changed cookie, header or log).',
  'Whether a test computes its expected value with the code it tests (it then agrees with any result).',
  'Request text that reaches a query (for example SQL) when no test sends that text.',
];

// One sentence on what the verdict rests on. A verdict describes the evidence at the time of the
// claim, not the work item's later state.
function scopeOf(record) {
  const sha = (v) => (typeof v === 'string' && /^[0-9a-f]{7,40}$/.test(v) ? v.slice(0, 7) : null);
  const head = sha(record.headSha);
  const merge = sha(record.mergeSha);
  const ev = typeof record.evidenceHash === 'string' && /^[0-9a-f]{12,64}$/.test(record.evidenceHash) ? record.evidenceHash.slice(0, 12) : null;
  const at = typeof record.at === 'string' ? record.at.slice(0, 16).replace('T', ' ') : 'an unknown time';
  return `This verdict rests on the evidence read at ${at} UTC: ${head ? `head ${head}` : 'no head commit'}, `
    + `${merge ? `merge commit ${merge}` : 'no merge commit'}, ${ev ? `evidence record ${ev}` : 'no evidence record'}, `
    + `checker ${record.checker ?? 'unknown'}. A later push, merge or change of the ACs is not covered; claim again.`;
}

const REASON_MAX = 300;
const STATES = {
  supported: { label: 'Supported', tone: 'success', headline: 'Done by the code checks. A person decides to merge or close.' },
  contradicted: { label: 'Contradicted', tone: 'removed', headline: 'Not done: the evidence contradicts the claim.' },
  cannot_verify: { label: 'Cannot verify', tone: 'moved', headline: 'Not decided: some evidence is missing or not trusted.' },
};

const HUMAN = {
  supported: 'A person decides to merge or close the work item. No agent can do this.',
  contradicted: 'Fix the change or the test, then claim again. If the evidence is wrong, a person records a decision with a reason.',
  cannot_verify: 'Supply the missing evidence (see "Not checked"), or a person signs off with a reason where the ticket allows it.',
};

const clip = (text, max = REASON_MAX) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// The compact form of the checks that the verifier stores with each verdict. Only the fields the
// view needs, with bounded text, so the Jira property stays small.
export function compactChecks(checks) {
  if (!Array.isArray(checks)) return [];
  return checks
    .filter((c) => c !== null && typeof c === 'object' && typeof c.name === 'string')
    .map((c) => ({
      name: clip(c.name, 80),
      status: ['pass', 'fail', 'unknown'].includes(c.status) ? c.status : 'unknown',
      reason: clip(c.reason, 200),
      // An advisory check did not count; the view lists it under "not checked".
      ...(c.advisory === true ? { advisory: true } : {}),
      ...(Array.isArray(c.parts) && c.parts.length
        ? { parts: c.parts.filter((p) => p && typeof p === 'object').slice(0, 20).map((p) => ({
          acId: clip(p.acId, 20), name: clip(p.name, 120),
          status: ['pass', 'fail', 'unknown'].includes(p.status) ? p.status : 'unknown', reason: clip(p.reason, 200),
        })) }
        : {}),
    }));
}

// Five evidence levels (execution plan P1-3, review item A). Each level says what it rests on, so
// a green test is not read as proof that the behaviour is right. Statuses: proved, failed,
// "not proved" (the check ran and could not decide), "not checked" (no check for it: the claim type
// does not run it, or an AC has no mechanical check). Level 5 (every case of each AC is tested) is
// never "proved" from a passing test: set 4 has seven unsafe supported cases where the named test
// passed and the AC was not covered (lead review of P1-3). Built from the stored checks only; the
// verdict is not changed.
const STATUS = { pass: 'proved', fail: 'failed', unknown: 'not proved' };
const isManual = (p) => typeof p.name === 'string' && p.name.startsWith('manual(');
// Worst first: failed, then not proved, then not checked; proved only when every row is proved.
function combine(rows) {
  if (!rows.length) return 'not checked';
  for (const s of ['failed', 'not proved', 'not checked']) if (rows.some((r) => r.status === s)) return s;
  return 'proved';
}

export function evidenceLevels(checks) {
  const list = compactChecks(checks);
  const find = (name) => list.find((c) => c.name === name);
  const level = (name, check, missing) => (check
    ? { level: name, status: STATUS[check.status], detail: `${check.name}: ${check.reason}` }
    : { level: name, status: 'not checked', detail: missing });
  const ci = find('ci_green') ?? find('merged_clean');
  const acCheck = find('ac_mapped');
  const parts = acCheck?.parts ?? [];
  const tests = parts.filter((p) => typeof p.name === 'string' && p.name.startsWith('test_passes('));
  const acs = parts.map((p) => (isManual(p)
    ? { acId: p.acId, status: 'not checked', detail: `no mechanical check: ${p.reason}` }
    : { acId: p.acId, status: STATUS[p.status], detail: `by ${p.name}: ${p.reason}` }));
  const testRows = tests.map((p) => ({ status: STATUS[p.status] }));
  // Level 5: what bears on it, never a status above "not checked".
  const pinned = find('pinned_tests_hold');
  const held = pinned && !pinned.advisory && pinned.status === 'pass' ? /^(\d+) pinned base test/.exec(pinned.reason) : null;
  const coverage = [
    'Not checked: a passing test does not show it.',
    held ? `Protected regression set: old behaviour held by ${held[1]} pinned tests; they do not cover the new AC.`
      : 'The protected regression set can show that old behaviour still holds; it did not run here.',
    'A person\'s sign-off can accept the coverage.',
  ];
  return [
    level('CI passed', ci, 'not checked for this claim'),
    level('Bug reproduced', find('reproduced'), 'not checked for this claim (only a done claim with code work runs the reproduction check)'),
    { level: 'The named AC test passed', status: combine(testRows),
      detail: tests.length ? tests.map((p) => `${p.acId} ${p.name}: ${p.reason}`).join('; ') : 'no AC names a test' },
    { level: 'Each AC has a mechanical check that passed', status: combine(acs), acs,
      detail: acs.length ? acs.map((a) => `${a.acId} ${a.status}`).join('; ') : 'no AC was checked' },
    { level: 'The tests cover every case of each AC', status: 'not checked', detail: coverage.join(' ') },
  ];
}

export function verdictState(record) {
  if (!record || typeof record !== 'object') return null;
  return STATES[record.result] ? record.result : null;
}

// The model's advice, apart from the verdict. Only well-formed items are shown.
function adviceView(advice) {
  const items = (Array.isArray(advice) ? advice : []).filter((a) => a && typeof a === 'object' && typeof a.hunk === 'string' && typeof a.text === 'string');
  if (items.length === 0) return null;
  return { heading: ADVICE_HEADING, note: ADVICE_NOTE, lines: items.slice(0, 6).map((a) => clip(adviceLine(a), 600)) };
}

// One verdict record (aat.verdicts entry) to the view model. A record without checks (written
// before checks were stored) shows its reason only, and says that the per-check detail is missing.
export function verdictView(record) {
  const state = verdictState(record);
  if (!state) return null;
  const s = STATES[state];
  const checks = compactChecks(record.checks);
  const proved = [];
  const notChecked = [];
  const failed = [];
  let unknown = 0;
  for (const c of checks) {
    if (c.advisory) {
      notChecked.push(`${c.name}: ${c.reason}`);
      continue;
    }
    const rows = c.parts?.length ? c.parts.map((p) => ({ ...p, check: c.name })) : [{ acId: null, name: c.name, status: c.status, reason: c.reason, check: c.name }];
    for (const r of rows) {
      const line = `${r.acId ? `${r.acId} ` : ''}${r.name}: ${r.reason}`.trim();
      if (r.status === 'pass') proved.push(line);
      else if (r.status === 'fail') failed.push(line);
      else {
        notChecked.push(line);
        unknown += 1;
      }
    }
  }
  if (checks.length === 0) notChecked.push('Per-check detail is not stored for this verdict; see the reason and the verdict comment.');
  // A record written before 20 Nov can carry a review hold. The stored result stays as it was.
  if (Array.isArray(record.reviewHold) && record.reviewHold.length && record.result === 'cannot_verify') {
    notChecked.push('An older checker let a model review hold this claim. A review no longer changes a verdict; claim again for a verdict from the code checks.');
  }
  notChecked.push(NOT_CHECKED_COVERAGE);
  return {
    state,
    label: s.label,
    tone: s.tone,
    headline: s.headline,
    why: clip(record.reason, 600),
    meaning: SUPPORTED_MEANS,
    proved,
    failed,
    notChecked,
    human: HUMAN[state],
    levels: evidenceLevels(record.checks),
    scope: scopeOf(record),
    kinds: { verified: proved.length, contradicted: failed.length, unknown },
    neverChecked: NEVER_CHECKED,
    advice: adviceView(record.advice),
    meta: {
      claim: record.type ?? null,
      at: record.at ?? null,
      head: typeof record.headSha === 'string' ? record.headSha.slice(0, 7) : null,
      checker: record.checker ?? null,
      decidedBy: 'code',
    },
  };
}

// The latest verdict per claim type is what the panel shows first; older ones stay in the list.
export function latestView(records) {
  const list = Array.isArray(records) ? records.filter((r) => r && typeof r === 'object') : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const v = verdictView(list[i]);
    if (v) return v;
  }
  return null;
}
