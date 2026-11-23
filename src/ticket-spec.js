// The app's ticket data, stored as Jira issue property `aat.ticket`.
// Acceptance criteria lines from the PM agent: "AC1 | statement | test_passes(test_BANK1_x)".

const CHECK_RE = /^([a-z_]+)\((.*)\)$/;

function parseArgs(raw) {
  if (!raw.trim()) return [];
  return raw.split(',').map((a) => {
    const v = a.trim().replace(/^["']|["']$/g, '');
    return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  });
}

export function parseAcLines(text) {
  return String(text ?? '')
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^AC\d+\s*\|/.test(line))
    .map((line) => {
      const [acId, statement = '', checkText = 'manual()'] = line.split('|').map((s) => s.trim());
      const m = CHECK_RE.exec(checkText);
      const check = m ? { type: m[1], args: parseArgs(m[2]) } : { type: 'manual', args: [checkText] };
      if (check.type === 'manual' && check.args.length === 0) check.args = [statement];
      return { acId, statement, check };
    });
}

export function acLinesToText(acs) {
  return acs.map((a) => `${a.acId}: ${a.statement} [${a.check.type}(${a.check.args.join(', ')})]`).join('\n');
}

// Models do not reliably write {TOKEN}; normalise every test name to test_{TOKEN}_<name>.
export function normaliseTestName(name, projectKey) {
  let rest = String(name).trim().replace(/^test_/, '');
  rest = rest.replace(/^\{TOKEN\}_/, '').replace(/^\{KEY\}_/, '');
  if (projectKey) rest = rest.replace(new RegExp(`^${projectKey}-?\\d*_`, 'i'), '');
  return `test_{TOKEN}_${rest}`;
}

// The ACs whose test_passes check names no test. Ticket creation refuses them.
export function testPassesArgErrors(acs) {
  return acs.filter((ac) => ac.check?.type === 'test_passes' && (ac.check.args ?? []).length === 0).map((ac) => ac.acId);
}

export function normaliseAcs(acs, projectKey) {
  return acs.map((ac) =>
    ac.check.type === 'test_passes'
      // Every name is kept: the verifier checks each one (lead review of 23 Nov, finding 5).
      ? { ...ac, check: { ...ac.check, args: ac.check.args.map((n) => normaliseTestName(n, projectKey)) } }
      : ac,
  );
}

// The stored ACs as editor lines, the form the panel's AC editor accepts (src/ac-editor.js). Pure,
// so the panel can import it.
export function acEditorText(acs) {
  return (Array.isArray(acs) ? acs : [])
    .map((a) => `${a.acId} | ${a.statement ?? ''} | ${a.check?.type ?? 'manual'}(${(a.check?.args ?? []).join(', ')})`)
    .join('\n');
}

// The AC line rules of create-ticket and of the panel's AC editor, as one message, or null.
export function acLineErrors(text) {
  const malformed = malformedAcLines(text);
  if (malformed.length) {
    return 'Every acceptance criterion must be one line "AC1 | statement | check", for example ' +
      '"AC1 | balance never below 0.00 | test_passes(test_{TOKEN}_balance_never_negative)". ' +
      `Fix these lines and call again: ${malformed.join(' / ')}`;
  }
  const multi = testPassesArgErrors(parseAcLines(text));
  if (multi.length) {
    return `${multi.map((id) => `${id}: test_passes needs a test name`).join('; ')}, for example ` +
      '"AC1 | credits only | test_passes(test_{TOKEN}_credits_only)". Fix these ACs and call again.';
  }
  return null;
}

// Lines that look like criteria but lack the "| statement | check" form.
export function malformedAcLines(text) {
  return String(text ?? '')
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*\s]*AC\d+\b/.test(l) && !/^AC\d+\s*\|[^|]*\|\s*[a-z_]+\(.*\)\s*$/.test(l));
}
