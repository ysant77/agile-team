// Judge path seed (docs/JUDGE-PATH.md): writes, for each of the four cases, what the demo site
// and the bank repository need. It reads only fixtures/judge/*.json and makes no network call.
//
//   node scripts/judge-seed.mjs <out dir> <issue key per case: U01=BANK-60,U04=BANK-61,...>
//
// For each case it writes <out>/<case>/aat.ticket.json (the issue property body, with the case's
// own test names; create-ticket would rename them to the test_{TOKEN}_ form) and prints the
// branch, the head commit, the pull request title and the claim comment.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CASES = ['U01', 'U04', 'U20', 'T08'];
const [out, keyArg] = process.argv.slice(2);
if (!out || !keyArg) {
  console.error('usage: node scripts/judge-seed.mjs <out dir> U01=BANK-60,U04=BANK-61,U20=BANK-62,T08=BANK-63');
  process.exit(2);
}
const keys = Object.fromEntries(keyArg.split(',').map((p) => p.split('=')));
for (const id of CASES) {
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(keys[id] ?? '')) {
    console.error(`no issue key for ${id}`);
    process.exit(2);
  }
}

export function seedOf(c, key) {
  const pr = c.github.pulls[0];
  return {
    // Live specs name the criterion text "statement" (src/ticket-spec.js); the panel shows it.
    ticket: { version: 1, acceptanceCriteria: c.ticket.acceptanceCriteria.map(({ text, ...ac }) => ({ ...ac, statement: text })) },
    summary: `${c.ticket.type}: ${c.ticket.text}`.slice(0, 250),
    branch: `case/${c.id}`,
    head: c.github.runs[0].head_sha,
    prTitle: `${key} ${c.ticket.text}`.slice(0, 120),
    claim: `claim: ${c.claim}`,
    expected: c.id === 'T08' ? 'cannot_verify, held by review (needs the reviewer run on the PR first)' : null,
    benchmarkPr: pr.number,
  };
}

for (const id of CASES) {
  const c = JSON.parse(readFileSync(new URL(`../fixtures/judge/${id}.json`, import.meta.url), 'utf8'));
  const s = seedOf(c, keys[id]);
  mkdirSync(join(out, id), { recursive: true });
  writeFileSync(join(out, id, 'aat.ticket.json'), `${JSON.stringify(s.ticket, null, 1)}\n`);
  console.log([
    `${id} -> ${keys[id]}`,
    `  summary:  ${s.summary}`,
    `  property: ${join(out, id, 'aat.ticket.json')} (PUT /rest/api/3/issue/${keys[id]}/properties/aat.ticket)`,
    `  branch:   ${s.branch} at ${s.head.slice(0, 7)}`,
    `  PR title: ${s.prTitle}`,
    `  comment:  ${s.claim}${s.expected ? `\n  expected: ${s.expected}` : ''}`,
  ].join('\n'));
}
