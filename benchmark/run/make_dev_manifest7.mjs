// Development cases for scorer change 22 (24 Nov 2026). Not blind, not a benchmark set: each case
// is the set 6 control W03 (supported on its stored evidence) with one set 7 fact added. They
// check that each new manifest field reaches the app as intended. The expected outcome of each
// case is written here before the first run.
//   node benchmark/run/make_dev_manifest7.mjs > benchmark/run/manifests/dev-manifest-7.json

import { readFileSync } from 'node:fs';

const set6 = JSON.parse(readFileSync(new URL('./manifests/bench-manifest-6.json', import.meta.url), 'utf8'));
const W03 = set6.find((c) => c.id === 'W03');
const PO = 'acct-product-owner';
const CLAIMANT = W03.jira.claimant;
const money = { labels: ['money_semantics'] };

// [id, change, expected outcome, the rule the expectation rests on]
const CASES = [
  ['DEV7-01', { ticket: money, jira: { signoff: { by: PO, at: 'T+1h', sha: 'merge', reason: 'the money rule is right' } } }, 'supported', 'a sign-off of the merge commit by a person other than the claimant'],
  ['DEV7-02', { ticket: money }, 'cannot_verify', 'money_semantics with no sign-off'],
  ['DEV7-03', { ticket: money, jira: { signoff: { by: CLAIMANT, at: 'T+1h', sha: 'merge', reason: 'my own change' } } }, 'cannot_verify', 'the claimant signed off'],
  ['DEV7-04', { ticket: money, jira: { signoff: { by: PO, at: 'T+1h', sha: 'b'.repeat(40), reason: 'an earlier commit' } } }, 'cannot_verify', 'the sign-off names another commit'],
  ['DEV7-05', { github: { titleWithoutKey: true }, jira: { prLink: { by: PO, at: 'T+0', prNumber: 'case', reason: 'the PR of this work item' } } }, 'supported', 'a PR link by another person; the title has no key'],
  ['DEV7-06', { github: { titleWithoutKey: true } }, 'cannot_verify', 'no PR names the key and no link'],
  ['DEV7-07', { github: { titleWithoutKey: true }, jira: { prLink: { by: CLAIMANT, at: 'T+0', prNumber: 'case', reason: 'my PR' } } }, 'cannot_verify', 'the only link is by the claimant'],
  ['DEV7-08', { github: { rateLimited: { remaining: 0, resetAt: '2026-11-16T11:00:00Z' } } }, 'not_checked', 'GitHub rate limit: no verdict'],
  ['DEV7-09', { github: { rateLimited: { remaining: 40, retryAfterS: 60 } } }, 'not_checked', 'secondary limit with a wait above 10 s: no verdict'],
  ['DEV7-10', { github: { mergeCommit: {} } }, 'cannot_verify', 'the merge commit is not the CI commit, and main.json is not for it'],
  ['DEV7-11', { github: { pushRunInProgress: true } }, 'cannot_verify', 'the push run on the merge commit is still running; main.json is the earlier report'],
];

const out = CASES.map(([id, change, expected, rule], i) => ({
  ...structuredClone(W03),
  id,
  ticket: { ...structuredClone(W03.ticket), key: `DEV-7${String(i + 1).padStart(2, '0')}`, ...(change.ticket ?? {}) },
  github: { ...(change.github ?? {}) },
  jira: { ...structuredClone(W03.jira), ...(change.jira ?? {}) },
  dev: { expected, rule, base: 'W03 (set 6 control) on its stored evidence' },
}));
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
