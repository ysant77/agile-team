// The repository is public. No tracked file may hold a local home path (a run record written with
// an absolute path is the known way in: the set 5 rescore output of 20 Nov).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Built from parts, so this file does not match itself.
const HOME = new RegExp(['/' + 'Users/[^/\\s"]+', '/' + 'home/[a-z][^/\\s"]*/', '[A-Za-z]:\\\\' + 'Users\\\\'].join('|'));

test('no tracked text file under benchmark/ or elsewhere holds a home path', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const hits = [];
  for (const f of files) {
    const buf = readFileSync(f);
    if (buf.includes(0)) continue; // binary
    const lines = buf.toString('utf8').split('\n');
    lines.forEach((l, i) => { if (HOME.test(l)) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, []);
});

test('the pattern finds the three forms of a home path', () => {
  for (const p of ['/' + 'Users/someone/x', '/' + 'home/someone/x', 'C:\\' + 'Users\\someone']) assert.match(p, HOME);
  assert.doesNotMatch('src/bank/users/api.py', HOME);
});
