// Judge path seed (docs/JUDGE-PATH.md): writes, for each of the five cases, what the demo site
// and the bank repository need. It reads only fixtures/judge/*.json and makes no network call.
//
//   node scripts/judge-seed.mjs <out dir> <issue key per case: U01=BANK-60,U04=BANK-61,...>
//
// For each case it writes <out>/<case>/aat.ticket.json (the issue property body, with the case's
// own test names; create-ticket would rename them to the test_{TOKEN}_ form) and prints the
// branch, the head commit, the pull request title and the claim comment.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CASES = ['U01', 'U04', 'U20', 'U12', 'T08'];

// What the app must show for each case on the demo site (docs/JUDGE-PATH.md).
const EXPECTED = {
  U01: 'supported',
  U04: 'contradicted: the AC test passes on base',
  U20: 'contradicted: a pinned base test fails on the head code (protected set)',
  U12: 'cannot_verify: money_semantics needs a sign-off of the merged commit; then another person (not the claimant) signs off in the panel, the claim is made again, and the verdict is supported',
  T08: "supported; the reviewer's finding is shown as advice, not counted (needs the reviewer run on the PR first)",
};

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
    // Jira labels of the work item; U12's money_semantics label makes the sign-off necessary.
    labels: Array.isArray(c.ticket.labels) ? [...c.ticket.labels] : [],
    expected: EXPECTED[c.id] ?? null,
    benchmarkPr: pr.number,
  };
}

function main() {
  const [out, keyArg] = process.argv.slice(2);
  if (!out || !keyArg) {
    console.error('usage: node scripts/judge-seed.mjs <out dir> U01=BANK-60,U04=BANK-61,U20=BANK-62,U12=BANK-64,T08=BANK-63');
    process.exit(2);
  }
  const keys = Object.fromEntries(keyArg.split(',').map((p) => p.split('=')));
  for (const id of CASES) {
    if (!/^[A-Z][A-Z0-9]+-\d+$/.test(keys[id] ?? '')) {
      console.error(`no issue key for ${id}`);
      process.exit(2);
    }
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
    `  branch:   ${s.branch} (benchmark head ${s.head.slice(0, 7)}; the demo branch carries the same change on demo main)`,
    `  PR title: ${s.prTitle}`,
    `  labels:   ${s.labels.length ? s.labels.join(', ') : '(none)'}`,
    `  comment:  ${s.claim}${s.expected ? `\n  expected: ${s.expected}` : ''}`,
  ].join('\n'));
  }
}

// Run only as a script; a test imports CASES and seedOf.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
