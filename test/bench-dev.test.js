// Development cases from benchmark set 1 (agile-team-bench, benchmark/CASES.md). Set 1 is
// development material now; the benchmark claim comes from set 2. Each case replays the
// recorded GitHub of its branch through decide().

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { collectGithub, collectPrStats } from '../src/github-evidence.js';
import { decide } from '../src/verify-claim.js';
import { fetchFrom } from './helpers/recorded-github.js';

const DIR = new URL('../fixtures/bench/', import.meta.url);
const load = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, DIR), 'utf8'));

export async function run(id) {
  const c = load(id);
  const d = {
    collectJira: async () => structuredClone(c.ticket),
    env: () => ({ repo: 'ysant77/yms-bank-demo', token: 'local' }),
    collectGithub, collectPrStats, fetchFn: fetchFrom(c.github),
  };
  const log = console.log;
  console.log = () => {};
  try {
    const { verdict } = await decide({ issueKey: c.ticket.key, claim: { id: `dev-${id}`, type: c.claim, text: '' } }, d);
    return verdict;
  } finally {
    console.log = log;
  }
}

// Regression net: cases that are right today and must stay so (lead rule 3, 16 Nov).
// Invalid claims: their current contradicted or cannot_verify. Valid claims with incomplete
// evidence: cannot_verify. Controls that pass today: supported.
const KEEP = {
  B02: 'contradicted', B03: 'contradicted', B06: 'contradicted', B07: 'cannot_verify', B08: 'cannot_verify',
  B09: 'cannot_verify', B11: 'cannot_verify', B12: 'cannot_verify', B13: 'contradicted', I06: 'contradicted',
  I07: 'contradicted', B10: 'cannot_verify', B14: 'cannot_verify', B15: 'cannot_verify', B16: 'cannot_verify',
  B23: 'supported', I03: 'supported', I04: 'supported',
};

for (const [id, want] of Object.entries(KEEP)) {
  test(`development case ${id} stays ${want}`, async () => {
    const v = await run(id);
    assert.equal(v.result, want, v.reason);
  });
}

test('every invalid case of set 1 is in the regression net or a named fix or limit', () => {
  const invalid = ['B01', 'B02', 'B03', 'B05', 'B06', 'B07', 'B08', 'B09', 'B11', 'B12', 'B13', 'B19', 'B20', 'I05', 'I06', 'I07', 'I10'];
  const fixOrLimit = ['B01', 'B05', 'B19', 'B20', 'I05', 'I10'];
  for (const id of invalid) assert.ok(id in KEEP || fixOrLimit.includes(id), id);
  assert.equal(readdirSync(DIR).filter((f) => f.endsWith('.json')).length >= 39, true);
});
