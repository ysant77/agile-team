// CI report helpers. Format: docs/ci-report.md (aat-ci-report/1 and /2).

import { createHash } from 'node:crypto';

export const REPORT_MARKER = '<!-- aat-ci-report -->';
export const REPORT_SCHEMA = 'aat-ci-report/2';
// Version 2 differs only in that a metric value may be {median, iqr_low, iqr_high, min, max, runs}.
export const REPORT_SCHEMAS = ['aat-ci-report/1', 'aat-ci-report/2'];

// The one reader of a number from evidence or config: the number when it is finite, else null.
// JSON gives Infinity for 1e999, so a type check alone is not enough.
export function finiteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Report hash rule, shared with the bank CI (tests/test_report_marker.py, same test vector):
// sha256 of the UTF-8 text with trailing spaces, tabs, CR and LF removed.
export function reportHash(text) {
  return createHash('sha256').update(String(text).replace(/[ \t\r\n]+$/, ''), 'utf8').digest('hex');
}

// A report hash marker: an artifact that the bank's report job ("ci") or publish-main-report job
// ("main") uploads to its own run. null for any other name.
const MARKER = /^(ci|main)-report-sha256-([0-9a-f]{64})-attempt-([1-9][0-9]{0,5})$/;
export function parseMarker(name) {
  const m = MARKER.exec(String(name ?? ''));
  return m ? { kind: m[1], hash: m[2], attempt: Number(m[3]) } : null;
}

// The raw JSON text of a report comment (what the bank wrote), or null.
export function extractReportText(commentBody) {
  if (typeof commentBody !== 'string' || !commentBody.trimStart().startsWith(REPORT_MARKER)) return null;
  const match = /```json\s*\n([\s\S]*?)\n```/.exec(commentBody);
  return match ? match[1] : null;
}

export function extractReport(commentBody) {
  if (typeof commentBody !== 'string' || !commentBody.trimStart().startsWith(REPORT_MARKER)) {
    return null;
  }
  const match = /```json\s*\n([\s\S]*?)\n```/.exec(commentBody);
  if (!match) return null;
  try {
    const report = JSON.parse(match[1]);
    return REPORT_SCHEMAS.includes(report?.schema) ? report : null;
  } catch {
    return null;
  }
}

// "tests/test_x.py::Class::test_name[param]" -> "test_name"
export function testName(id) {
  const last = String(id).split('::').pop();
  return last.replace(/\[.*\]$/, '');
}

export function testsByName(report, name) {
  return (report?.tests ?? []).filter((t) => testName(t.id) === name);
}

export function sameFiles(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

// True when `text` names the issue key as a whole key: BANK-1 matches "BANK-1 fix" and
// "fix/bank-1-lock", not "BANK-10 recon" or "XBANK-1".
export function namesKey(text, key) {
  const k = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A boundary on both sides: BANK-1abc and BANK-10 do not name BANK-1.
  return new RegExp(`(^|[^A-Za-z0-9])${k}(?![A-Za-z0-9])`, 'i').test(String(text ?? ''));
}
