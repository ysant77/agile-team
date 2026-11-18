// Benchmark rule 7 (benchmark/README.md): frozen files stay byte-identical. A case file, a
// prediction file, a protocol, a build record, a results file or a truth file that changes after
// it is frozen would let the benchmark be tuned after its results were seen. A change must go
// through run/SCORER-CHANGES.md and a new entry here, which a reviewer sees in the diff.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const FROZEN = [
  ['benchmark/CASES.md', 'a98a9b25159f9b61c968189258e86ab1f2aea74fadd2d29b7dda7cc5a1221e96'],
  ['benchmark/CASES-INDEPENDENT.md', 'd6b3ee6171e12d8c0f1f33a9a09a5b87d29a8e01cbd4fd39d8fef8f15ab5fc72'],
  ['benchmark/CASES-2-INDEPENDENT.md', '3d7d617114c2fc403a9900ed64e0454925c2be67b976150e9ecc72000c4820cf'],
  ['benchmark/CASES-3-INDEPENDENT.md', 'f3219f72822ae862ef46ec78342d8bde08b725371e9cdb1bff90162f48c0b91c'],
  ['benchmark/PREDICTIONS-INDEPENDENT.md', '6db9018f6d4797f4f2ac65c2b7f1457140a69045b68d00079822fc157d76b6bd'],
  ['benchmark/PREDICTIONS-2.md', '068e7c7ab6ec087beef0592bc91d6a93ca24ba9148034b4de4d2e4ee9b24fa5d'],
  ['benchmark/PREDICTIONS-3.md', '0cbd740154f572ff790a8d243b30a1daa857d3fee0b65716b5182477bd9996ea'],
  ['benchmark/ARM-D-PROTOCOL.md', 'cc646010783da537cb52078858f0387182cf0ad8f6efa31b952e6dcf52810b2e'],
  ['benchmark/ARM-CD-PROTOCOL-3.md', 'c58ea06f9c44ec41a0ccd273777fead1354df7c0a18a7778ddd9dee7386e9857'],
  ['benchmark/BUILD-3.md', '067d00e160af4290b692e3605394ccc13c1a621d782f2a18a7c3be0806a20e09'],
  ['benchmark/RESULTS.md', '9afc7c786ad5921528f80b7e409dd74c7a7864ffd9fd6363b2edd5601d83004c'],
  ['benchmark/RESULTS-2.md', '751de0083e02393ecad293c31f706a84da5adc810a4fbeb528c47a2701b787cb'],
  ['benchmark/RESULTS-2-ARM-D.md', 'd8181be99ec853d24bcfcc3c8d84ae2fad65b285f0f08ac2e846b7982543ef33'],
  ['benchmark/RESULTS-3.md', '628fc652e07676bb89e201d7fbccfcdca392963cb5901944ca739b16872efb8c'],
  ['benchmark/run/truth.json', '8dafbe4cdc99acef60aa1a06106a823f54ff318361a45226a245fcb6e65e558c'],
  ['benchmark/run/truth-2.json', '0b0ca9d9547ae369aa6a99a4ddfdd6b83eb5df7494b1d83d3f952a88e7913253'],
  ['benchmark/run/truth-3.json', '3da9ec7b1c432f2cbe02f7e839b6ee2763ea36ba6d28fd423520ec026f975fcb'],
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

test('every frozen benchmark file is byte-identical to its recorded hash', () => {
  for (const [file, hash] of FROZEN) assert.equal(sha256(readFileSync(file)), hash, file);
});

test('the hash check finds a one-character change in a frozen file', () => {
  const [file, hash] = FROZEN.find(([f]) => f.endsWith('truth-3.json'));
  const changed = readFileSync(file, 'utf8').replace('"cannot_verify"', '"supported"');
  assert.notEqual(sha256(changed), hash);
});
