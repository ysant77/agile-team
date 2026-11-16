// CI report helpers. Format: docs/ci-report.md (aat-ci-report/1 and /2).

export const REPORT_MARKER = '<!-- aat-ci-report -->';
export const REPORT_SCHEMA = 'aat-ci-report/2';
// Version 2 differs only in that a metric value may be {median, iqr_low, iqr_high, min, max, runs}.
export const REPORT_SCHEMAS = ['aat-ci-report/1', 'aat-ci-report/2'];

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
  return new RegExp(`(^|[^A-Za-z0-9])${k}(?![0-9])`, 'i').test(String(text ?? ''));
}
