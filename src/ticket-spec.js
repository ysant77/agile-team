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
