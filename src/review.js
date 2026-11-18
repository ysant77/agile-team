// Agile Code Reviewer (DESIGN.md section 14a). The reviewer reads the pull request's patch hunks
// and gives a review marked "not verified": findings tied to hunk ids, risks, and proposed checks.
// Code checks every id, line, number and proposed test. A review never passes a claim and never
// approves. Only a blocking finding with an AC id, for the same head commit, can hold a supported
// claim at cannot_verify for a person to check (src/review-hold.js). A proposed check counts only
// when CI runs the test and the verifier maps it to an AC.

import { canonical, sha256 } from './audit.js';
import { numbersIn, quantityText } from './lint.js';
import { idsIn } from './opinion.js';
import { lintText, STYLE_CONTRACT, lintMessage } from './style.js';
import { VERIFY_CONFIG } from './verify-claim.js';
import { testName, testsByName } from './verifier/report.js';
import { rawRef, schemaErrorClass } from './trace.js';

// Guard version 4: the severity guards (3) plus the line, number, verdict-word and adoption
// guards from the unit 6 review.
export const REVIEW_GUARD_VERSION = 5;
export const REVIEW_PROMPT_VERSION = 'code-review/2';
export const REVIEW_LABEL = 'Review (not verified)';
export const MAX_FINDINGS = 6;
export const MAX_CHECKS = 3;
export const MAX_HUNKS = 40;
export const MAX_PATCH_LINES = 600;
export const SEVERITIES = ['blocking', 'note'];
export const TRIGGERS = ['cannot_verify', 'manual_ac', 'design', 'readability', 'request'];

// Fields that would make a review look like a decision. The schema refuses them.
const FORBIDDEN = ['result', 'verdict', 'approve', 'approved', 'status', 'decision'];
// Words that belong to verdicts and approvals, not to a review.
const VERDICT_WORDS = /\b(supported|verify|verified|verifies|approved?|approves|approving|lgtm|ship it|criteria\s+are\s+met|merge\s+now)\b/i;
const HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const HUNK_ID = /\bP\d+:H\d+\b/g;
const LINE_REF = /\blines? (\d+)(?:\s*(?:-|to)\s*(\d+))?/gi;

const DEFAULT_GUARDED = [...new Set([...VERIFY_CONFIG.guardedPaths, ...VERIFY_CONFIG.benchmarkGuardedPaths])];

// A commit sha has at least one digit and one letter a-f. A plain decimal number is not a sha.
const SHA = /\b[0-9a-f]{7,40}\b/g;
const stripShas = (text) => text.replace(SHA, (t) => (/[a-f]/.test(t) && /\d/.test(t) ? ' ' : t));

// New-side line numbers of the '+' lines of a hunk. Context and removed lines do not count.
function addedLines(h) {
  const added = new Set();
  let n = h.newStart;
  for (const line of h.text.split('\n')) {
    if (line.startsWith('+')) added.add(n++);
    else if (line.startsWith('-') || line.startsWith('\\')) continue;
    else n += 1;
  }
  return added;
}

const isTestFile = (f) => f.startsWith('tests/') || f.split('/').pop().startsWith('test_');
const matchesPath = (file, paths) => paths.some((g) => (g.endsWith('/') ? file.startsWith(g) : file === g));

// files: GitHub's pull request files ({ filename, status, patch }). Hunk ids come from code, in
// file order: P<pr>:H<n>. A file without a patch (GitHub leaves out very large ones) has no hunk.
export function parseHunks(prNumber, files) {
  const hunks = [];
  const noPatch = [];
  const notShown = new Map();
  let lines = 0;
  for (const f of files ?? []) {
    if (typeof f.patch !== 'string') {
      noPatch.push(f.filename);
      continue;
    }
    const parts = [];
    for (const line of f.patch.split('\n')) {
      const m = line.match(HEADER);
      if (m) {
        const count = m[2] === undefined ? 1 : Number(m[2]);
        const start = Number(m[1]);
        parts.push({ newStart: start, newEnd: count === 0 ? start : start + count - 1, body: [] });
      } else if (parts.length) parts.at(-1).body.push(line);
    }
    for (const p of parts) {
      if (hunks.length >= MAX_HUNKS || lines + p.body.length > MAX_PATCH_LINES) {
        notShown.set(f.filename, (notShown.get(f.filename) ?? 0) + 1);
        continue;
      }
      lines += p.body.length;
      hunks.push({ id: `P${prNumber}:H${hunks.length + 1}`, file: f.filename, newStart: p.newStart, newEnd: p.newEnd, text: p.body.join('\n') });
    }
  }
  return {
    hunks,
    noPatch,
    notShown: [...notShown].map(([file, n]) => ({ file, hunks: n })),
    testsTouched: (files ?? []).map((f) => f.filename).filter(isTestFile),
  };
}

// input: { ticket: { key, acceptanceCriteria }, pr: { number, headSha }, files, reportTests,
//          verdict: { result, reason }, trigger, guardedPaths }
export function buildReviewPacket(input) {
  const parsed = parseHunks(input.pr.number, input.files);
  return {
    ticket: {
      key: input.ticket.key,
      acs: (input.ticket.acceptanceCriteria ?? []).map((a) => ({ acId: a.acId, statement: a.statement ?? '', check: a.check ?? null })),
    },
    pr: { number: input.pr.number, headSha: input.pr.headSha ?? null },
    ...parsed,
    // True when GitHub's file list was cut at the page limit: the packet does not show every file.
    filesTruncated: Boolean(input.filesTruncated),
    existingTests: [...new Set((input.reportTests ?? []).map(testName))],
    verdict: input.verdict ? { result: input.verdict.result, reason: input.verdict.reason ?? '' } : null,
    trigger: TRIGGERS.includes(input.trigger) ? input.trigger : 'request',
    guardedPaths: input.guardedPaths ?? DEFAULT_GUARDED,
  };
}

export function packetHash(packet) {
  return sha256(canonical(packet));
}

const hasCodeCheck = (ac) => Boolean(ac?.check) && ac.check.type !== 'manual';
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

export function validateReview(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ['not valid JSON'] };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['not a JSON object'] };
  const errors = [];
  for (const k of FORBIDDEN) if (k in value) errors.push(`field "${k}" is not allowed: a review never decides`);
  const findings = value.findings ?? [];
  const risks = value.risks ?? [];
  const checks = value.proposedChecks ?? [];
  if (!Array.isArray(findings)) errors.push('findings is not a list');
  else if (findings.length > MAX_FINDINGS) errors.push(`more than ${MAX_FINDINGS} findings`);
  else {
    findings.forEach((f, i) => {
      if (!f || typeof f.hunk !== 'string' || typeof f.file !== 'string') errors.push(`finding ${i + 1}: hunk and file are required`);
      if (!Number.isInteger(f?.line) || f.line < 1) errors.push(`finding ${i + 1}: line must be a whole number`);
      if (!nonEmpty(f?.text)) errors.push(`finding ${i + 1}: no text`);
      if (f?.severity !== undefined && !SEVERITIES.includes(f.severity)) errors.push(`finding ${i + 1}: severity must be blocking or note`);
      if (f?.ac !== undefined && typeof f.ac !== 'string') errors.push(`finding ${i + 1}: ac must be an AC id`);
    });
  }
  if (!Array.isArray(risks) || risks.some((r) => typeof r !== 'string')) errors.push('risks must be a list of strings');
  if (!Array.isArray(checks)) errors.push('proposedChecks is not a list');
  else if (checks.length > MAX_CHECKS) errors.push(`more than ${MAX_CHECKS} proposed checks`);
  else {
    checks.forEach((c, i) => {
      for (const k of ['testName', 'file', 'ac', 'asserts']) if (!nonEmpty(c?.[k])) errors.push(`proposed check ${i + 1}: ${k} missing`);
      if (typeof c?.failsBeforeFix !== 'boolean') errors.push(`proposed check ${i + 1}: failsBeforeFix must be true or false`);
    });
  }
  if (!errors.length && findings.length === 0 && checks.length === 0) errors.push('a review needs a finding or a proposed check');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    review: {
      findings: findings.map((f) => ({
        hunk: f.hunk, file: f.file, line: f.line, text: f.text.trim(), severity: f.severity ?? 'note',
        ...(typeof f.ac === 'string' && f.ac.trim() ? { ac: f.ac.trim() } : {}),
      })),
      risks: risks.map((r) => r.trim()).filter(Boolean),
      proposedChecks: checks.map((c) => ({ testName: c.testName.trim(), file: c.file.trim(), ac: c.ac.trim(), asserts: c.asserts.trim(), failsBeforeFix: c.failsBeforeFix })),
    },
  };
}

const freeTexts = (r) => [...r.findings.map((f) => f.text), ...r.risks, ...r.proposedChecks.map((c) => c.asserts)];
// Free texts with the hunk they belong to. Only a finding has a hunk.
const scopedTexts = (r) => [...r.findings.map((f) => ({ text: f.text, hunk: f.hunk })), ...r.risks.map((text) => ({ text, hunk: null })),
  ...r.proposedChecks.map((c) => ({ text: c.asserts, hunk: null }))];

function packetText(packet) {
  return [
    packet.ticket.key, `PR${packet.pr.number}`, packet.pr.headSha ?? '',
    ...packet.ticket.acs.flatMap((a) => [a.acId, a.statement, ...(a.check?.args ?? []).map(String)]),
    ...packet.hunks.flatMap((h) => [h.id, h.file, h.text]),
    ...packet.existingTests, packet.verdict?.reason ?? '',
  ].join('\n');
}

// Numbers in free text: "line N" must be an added line of the text's hunk (a finding) or of any
// hunk (a risk or a check); every other number must occur in the ticket, the hunks or the verdict
// reason. Hunk ids, issue keys, AC ids, test names and commit shas are ids.
function ungroundedNumbers(text, hunkId, packet, allowed) {
  const bad = [];
  const scope = hunkId ? packet.hunks.filter((h) => h.id === hunkId) : packet.hunks;
  const lines = new Set(scope.flatMap((h) => [...addedLines(h)]));
  const rest = stripShas(text.replace(HUNK_ID, ' ')).replace(LINE_REF, (_, a, b) => {
    for (const n of [a, b].filter(Boolean)) if (!lines.has(Number(n))) bad.push(`line ${n}`);
    return ' ';
  });
  for (const n of numbersIn(quantityText(rest))) if (!allowed.has(n)) bad.push(n);
  return bad;
}

// Guard 7 (version 5): text is compared lower-cased with all whitespace removed, so a quote in
// other letter case or with extra spaces is still a quote.
const fold = (t) => t.toLowerCase().replace(/\s+/g, '');

// Guard 7 (version 3): the share of a finding's text that is hunk content copied verbatim. Hunk
// ids and AC ids are removed first. Only runs of at least COPY_MIN characters count, so a short
// name in the reviewer's own sentence is not a copy. `code` is already folded.
const COPY_MIN = 12;
function copiedShare(body, code) {
  const text = fold(body.replace(HUNK_ID, ' ').replace(/\bAC\d+\b/g, ' '));
  if (text.length === 0) return 0;
  let copied = 0;
  for (let i = 0; i < text.length;) {
    let n = 0;
    while (i + n < text.length && code.includes(text.slice(i, i + n + 1))) n += 1;
    if (n >= COPY_MIN) {
      copied += n;
      i += n;
    } else {
      i += 1;
    }
  }
  return copied / text.length;
}

// Returns the record that is shown and audited. `outcome` is 'review' (advice only) or
// 'invalid_review' (refused by a guard). There is no verdict field: code decides the verdict.
export function applyReviewGuards(raw, packet, meta = {}) {
  const base = {
    label: REVIEW_LABEL,
    promptVersion: meta.promptVersion ?? REVIEW_PROMPT_VERSION,
    guardVersion: REVIEW_GUARD_VERSION,
    model: meta.model ?? null,
    inputHash: packetHash(packet),
    trigger: packet.trigger,
    raw: rawRef(raw),
    errorClass: null,
  };
  const checked = validateReview(raw);
  if (!checked.ok) return { ...base, outcome: 'invalid_review', guard: 'schema', errorClass: schemaErrorClass(checked.errors), reasons: checked.errors, review: null };
  const review = checked.review;
  const invalid = (guard, why) => ({ ...base, outcome: 'invalid_review', guard, reasons: [why], review });

  // Guard 5 first: patch text can ask for an approval; no review may give one.
  for (const t of freeTexts(review)) {
    const m = t.match(VERDICT_WORDS);
    if (m) return invalid('verdict-word', `"${m[0]}" is a verdict word; a review never decides`);
  }
  // Guard 1: hunk ids match exactly, the file is the hunk's file, the line is an added line of the hunk.
  const hunks = new Map(packet.hunks.map((h) => [h.id, h]));
  for (const f of review.findings) {
    const h = hunks.get(f.hunk);
    if (!h) return invalid('unknown-hunk', `${JSON.stringify(f.hunk)} is not a hunk id of this packet`);
    if (f.file !== h.file) return invalid('wrong-file', `${f.hunk} is in ${h.file}, not ${f.file}`);
    if (f.line < h.newStart || f.line > h.newEnd) return invalid('line-outside-hunk', `line ${f.line} is outside ${f.hunk} (${h.newStart} to ${h.newEnd})`);
    if (!addedLines(h).has(f.line)) return invalid('line-not-added', `line ${f.line} is not an added line of ${f.hunk}`);
  }
  // Guard 7 (code-review/2): a blocking finding names an AC of the ticket and states a defect in
  // the reviewer's own words. A quoted changed line is not a defect statement.
  // Known limit (docs/claims.md): the guard refuses copied code only. A short text with no defect
  // statement and no copied code, such as "Bad.", passes. Such a finding can only hold a
  // supported claim for a person to check; it can never pass a claim.
  const acSet = new Set(packet.ticket.acs.map((a) => a.acId));
  for (const f of review.findings) {
    if (f.ac !== undefined && !acSet.has(f.ac)) return invalid('unknown-ac', `${f.ac} is not an AC of ${packet.ticket.key}`);
    if (f.severity !== 'blocking') continue;
    if (!f.ac) return invalid('blocking-needs-ac', `a blocking finding at ${f.hunk} must name the AC that the change fails`);
    const body = fold(f.text);
    const code = packet.hunks.map((h) => fold(h.text.split('\n').map((l) => l.replace(/^[+\- ]/, '')).join('\n')));
    if (code.some((c) => c.includes(body)) || copiedShare(f.text, code.join('\n')) > 0.5) {
      return invalid('quoted-line', `the blocking finding at ${f.hunk} quotes changed code; state the defect against ${f.ac}`);
    }
  }
  // Guard 2: ids and numbers come from the packet.
  const known = packetText(packet);
  // Commit shas are ids, not numbers.
  const allowed = new Set(numbersIn(quantityText(stripShas(known.replace(HUNK_ID, ' ')))));
  for (const { text: t, hunk } of scopedTexts(review)) {
    const ids = idsIn(t).filter((id) => !known.includes(id));
    if (ids.length) return invalid('ungrounded-id', `${ids.join(', ')} not in the packet`);
    const bad = ungroundedNumbers(t, hunk, packet, allowed);
    if (bad.length) return invalid('ungrounded-number', `${bad.join(', ')} not in the packet`);
  }
  // Guards 3 and 4: each proposed check names a new test for one manual AC of this ticket.
  const acs = new Map(packet.ticket.acs.map((a) => [a.acId, a]));
  const token = packet.ticket.key.replace('-', '');
  const pattern = new RegExp(`^test_${token}_[a-z0-9_]+$`);
  for (const c of review.proposedChecks) {
    if (!acs.has(c.ac)) return invalid('unknown-ac', `${c.ac} is not an AC of ${packet.ticket.key}`);
    if (hasCodeCheck(acs.get(c.ac))) return invalid('ac-has-check', `${c.ac} already has a code check; a review proposes checks only for a manual AC`);
    if (!pattern.test(c.testName)) return invalid('test-name', `${c.testName} must look like test_${token}_what_it_checks`);
    if (packet.existingTests.includes(c.testName)) return invalid('test-exists', `${c.testName} is already in the CI report`);
    if (!/^tests\/[\w./-]+\.py$/.test(c.file)) return invalid('test-file', `${c.file} must be a Python file under tests/`);
    if (matchesPath(c.file, packet.guardedPaths) || c.file.split('/').pop() === 'conftest.py') {
      return invalid('guarded-path', `${c.file} is a guarded path; a change there makes the verifier refuse metric evidence`);
    }
  }
  return { ...base, outcome: 'review', guard: null, reasons: [], review };
}

function templateReview(review) {
  return {
    ...review,
    findings: review.findings.map((f, i) => ({ ...f, text: `Finding ${i + 1}: see ${f.hunk}, line ${f.line}.` })),
    risks: review.risks.map((_, i) => `Risk ${i + 1}: see the audited review input.`),
    proposedChecks: review.proposedChecks.map((c) => ({ ...c, asserts: `${c.testName} must pass for ${c.ac}.` })),
  };
}

// Arm D rating rule: the findings that can hold a claim (see review-hold.js).
export { blockingFindings } from './review-hold.js';

// Guard 6: a refused review or a style finding gets one retry. After that, a refused review is
// dropped (the human sees "no valid review"), and style findings are replaced by a template.
export function reviewGate(record, retries) {
  if (record.outcome === 'invalid_review') {
    if (retries < 1) {
      return { action: 'retry', message: `Review refused by guard ${record.guard}: ${record.reasons.join('; ')}. Use only hunk ids, lines, AC ids and numbers from the packet. Do not decide or approve. Call record-review again.` };
    }
    return { action: 'accept', record: { ...record, review: null } };
  }
  const findings = freeTexts(record.review).flatMap((t) => lintText(t, { kind: 'description' }).findings);
  if (findings.length === 0) return { action: 'accept', record: { ...record, style: 'pass' } };
  if (retries < 1) {
    return { action: 'retry', message: `Style findings: ${lintMessage(findings)}. ${STYLE_CONTRACT} Keep the same hunk ids and checks, and call record-review again.` };
  }
  return { action: 'accept', record: { ...record, review: templateReview(record.review), style: 'fallback', styleFindings: findings.length } };
}

// A human adopts a proposed check: the AC now names the test. The verifier decides the rest.
// Only a manual AC or an AC without a check can take a proposal; a code check is never replaced.
export function adoptProposal(ticket, { ac, testName: name }) {
  const acs = ticket.acceptanceCriteria ?? [];
  const matches = acs.filter((a) => a.acId === ac);
  if (matches.length === 0) throw new Error(`${ac} is not an AC of ${ticket.key}`);
  // Two ACs with the same id make the ticket ambiguous: adoption would change both checks.
  if (matches.length > 1) throw new Error(`${ac} is not unique in ${ticket.key}; fix the ticket before adopting a check`);
  const target = matches[0];
  if (hasCodeCheck(target)) throw new Error(`${ac} already has a code check; only a manual AC can take a proposed check`);
  if (!/^test_\w+$/.test(name ?? '')) throw new Error('the proposal has no test name');
  return {
    ...ticket,
    acceptanceCriteria: acs.map((a) => (a.acId === ac ? { ...a, check: { type: 'test_passes', args: [name] }, adoptedFrom: 'review' } : a)),
  };
}

export function proposalStatus(proposal, report) {
  const tests = testsByName(report, proposal.testName);
  const status = tests.length === 0 ? 'not in report' : tests.every((t) => t.outcome === 'passed') ? 'passed' : 'failed';
  return { testName: proposal.testName, status, note: proposal.failsBeforeFix ? 'fail on base not checked' : '' };
}

// Where the reviewer may speak (DESIGN 14d). It never adds evidence: when the verifier lacks a
// report, a token or a CI run, a review cannot help.
export function reviewSuggested(verdict, ticket) {
  if (!verdict || verdict.result === 'supported') return { suggest: false, why: 'every check passed; no review is needed' };
  if (verdict.result === 'contradicted') return { suggest: false, why: 'a check failed; the reviewer speaks on request only' };
  const manualAc = (ticket?.acceptanceCriteria ?? []).some((a) => !a.check || a.check.type === 'manual');
  if (manualAc || /needs a human/.test(verdict.reason ?? '')) {
    return { suggest: true, why: 'a manual AC has no code check; the reviewer can propose one' };
  }
  return { suggest: false, why: `missing evidence (${verdict.reason}); a review cannot add evidence` };
}

export function formatReview(issueKey, prNumber, record) {
  if (record.outcome === 'invalid_review' || !record.review) {
    return `${REVIEW_LABEL} on ${issueKey} PR #${prNumber}: no valid review (guard ${record.guard}). The verdict stays as code decided it.`;
  }
  const r = record.review;
  return [
    `${REVIEW_LABEL} on ${issueKey} PR #${prNumber}. It never passes a claim; a blocking finding holds a supported claim for a person to check.`,
    ...r.findings.map((f) => `- ${f.severity === 'blocking' ? `Blocking (${f.ac}) ` : ''}${f.hunk} ${f.file}:${f.line}: ${f.text}`),
    ...r.risks.map((x) => `- Risk: ${x}`),
    ...r.proposedChecks.map((c) => `- Proposed check for ${c.ac}: ${c.testName} in ${c.file}. It must assert: ${c.asserts}${c.failsBeforeFix ? ' It must fail before the fix.' : ''}`),
  ].join('\n');
}

// The panel's "Adopt check" button: only a proposal from a review that passed the guards can be
// adopted, and only by a human with a reason. Returns the new ticket spec or an error.
export function adoptFromReviews(spec, reviews, { prNumber, testName: name, reason }) {
  if (String(reason ?? '').trim().length < 5) return { ok: false, error: 'A reason of at least 5 characters is required.' };
  const proposal = (reviews ?? [])
    .filter((r) => r.outcome === 'review' && r.prNumber === prNumber && r.review)
    .flatMap((r) => r.review.proposedChecks)
    .find((c) => c.testName === name);
  if (!proposal) return { ok: false, error: `No valid review proposes ${name} for PR #${prNumber}.` };
  try {
    return { ok: true, proposal, spec: adoptProposal(spec, proposal) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
