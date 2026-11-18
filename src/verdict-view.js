// Verdict view (issue panel): what was proved, what was not checked, why, and what a person must
// decide. Pure functions; the panel resolver reads the stored verdicts and passes them in. Code sets
// the verdict; this module only explains it and never changes it.

// Blind set 4 lesson (benchmark/RESULTS-4.md): "supported" means that the named test fails before
// the change and passes after it, on this criterion. It does not show that the test covers every
// case of the criterion. Eight of 24 invalid changes in set 4 were supported in this way. The view
// says so on every verdict, not only on supported ones.
export const SUPPORTED_MEANS =
  'Supported means: for each criterion, the named test fails before the change and passes after it, on the head commit.';
export const NOT_CHECKED_COVERAGE = 'Not checked: whether the test covers every case of the criterion.';

const REASON_MAX = 300;
const STATES = {
  supported: { label: 'Supported', tone: 'success', headline: 'Done by the code checks. A person decides to merge or close.' },
  contradicted: { label: 'Contradicted', tone: 'removed', headline: 'Not done: the evidence contradicts the claim.' },
  cannot_verify: { label: 'Cannot verify', tone: 'moved', headline: 'Not decided: some evidence is missing or not trusted.' },
  held: { label: 'Held by review', tone: 'moved', headline: 'Not decided: the code checks passed, but a reviewer\'s blocking finding holds the claim.' },
};

const HUMAN = {
  supported: 'A person decides to merge or close the work item. No agent can do this.',
  contradicted: 'Fix the change or the test, then claim again. If the evidence is wrong, a person records a decision with a reason.',
  cannot_verify: 'Supply the missing evidence (see "Not checked"), or a person signs off with a reason where the ticket allows it.',
  held: 'A person reads the blocking finding. If it is right, fix the code and add a test. If it is wrong, a person records that with a reason. A review can hold a claim; it can never pass one.',
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
      ...(Array.isArray(c.parts) && c.parts.length
        ? { parts: c.parts.filter((p) => p && typeof p === 'object').slice(0, 20).map((p) => ({
          acId: clip(p.acId, 20), name: clip(p.name, 120),
          status: ['pass', 'fail', 'unknown'].includes(p.status) ? p.status : 'unknown', reason: clip(p.reason, 200),
        })) }
        : {}),
    }));
}

export function verdictState(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.result === 'cannot_verify' && Array.isArray(record.reviewHold) && record.reviewHold.length) return 'held';
  return STATES[record.result] ? record.result : null;
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
  for (const c of checks) {
    const rows = c.parts?.length ? c.parts.map((p) => ({ ...p, check: c.name })) : [{ acId: null, name: c.name, status: c.status, reason: c.reason, check: c.name }];
    for (const r of rows) {
      const line = `${r.acId ? `${r.acId} ` : ''}${r.name}: ${r.reason}`.trim();
      if (r.status === 'pass') proved.push(line);
      else if (r.status === 'fail') failed.push(line);
      else notChecked.push(line);
    }
  }
  if (checks.length === 0) notChecked.push('Per-check detail is not stored for this verdict; see the reason and the verdict comment.');
  if (state === 'held') notChecked.push(`The reviewer's finding on ${record.reviewHold.join(', ')} is not verified by code.`);
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
